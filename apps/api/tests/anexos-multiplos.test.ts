import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 13).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { NOME_DO_COOKIE, criarToken } = await import('@pipe/autenticacao');
const { subirApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');
const { usarArmazenamento } = await import('../src/dominio/anexo.js');
const { MAX_ARQUIVOS_POR_MENSAGEM, MAX_BYTES_POR_ARQUIVO } = await import('@pipe/armazenamento');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * `POST /v1/conversas/:id/mensagens/anexos` — vários arquivos num envio
 * (`enviarAnexos`, `dominio/envio.ts`; auditoria do Desk, item 2).
 *
 * O modelo é o da origem: UMA mensagem por arquivo, em sequência, até 10. O que
 * este arquivo prova é o "tudo ou nada": o lote é validado inteiro ANTES de a
 * primeira mensagem sair — mais de 10, anexo inexistente, arquivo fora do teto
 * do tipo, janela fechada ou conversa de outro atendente não deixam NENHUMA
 * mensagem para trás.
 */

let cenario: Cenario;
let api: ApiNoAr;
let sessaoAtendente: string;
let colegaId: string;

const objetos = new Map<string, Uint8Array>();

beforeAll(async () => {
  usarArmazenamento({
    guardar: async (chave, dados) => {
      objetos.set(chave, dados);
      return { chave, bytes: dados.byteLength };
    },
    ler: async (chave) => {
      const dados = objetos.get(chave);
      return dados ? { dados, bytes: dados.byteLength } : null;
    },
    remover: async (chave) => {
      objetos.delete(chave);
    },
  });
  cenario = await montarCenario(`anexos-lote-${randomUUID().slice(0, 8)}`);
  api = await subirApi(0);
  process.env['PIPE_STORAGE_URL_BASE'] = api.url;

  const novo = criarToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${cenario.atendenteId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  sessaoAtendente = novo.token;

  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, 'Colega', ${`colega-${randomUUID().slice(0, 8)}@e2e.pipe.app`})
    returning id
  `);
  colegaId = rows[0]!.id;
}, 180_000);

afterAll(async () => {
  await api.fechar();
  await cenario.encerrar();
  usarArmazenamento(null);
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const PDF = Buffer.from('%PDF-1.4\n%teste\n');

function comChave(): Record<string, string> {
  return { authorization: `Bearer ${cenario.token}`, 'content-type': 'application/json' };
}

function comCookie(): Record<string, string> {
  return { cookie: `${NOME_DO_COOKIE}=${sessaoAtendente}`, 'content-type': 'application/json' };
}

async function subir(dados: Buffer, mime: string, nome: string): Promise<string> {
  const resposta = await fetch(`${api.url}/v1/anexos?nome=${encodeURIComponent(nome)}`, {
    method: 'POST',
    headers: { 'content-type': mime, authorization: `Bearer ${cenario.token}` },
    body: new Uint8Array(dados),
  });
  expect(resposta.status).toBe(201);
  return ((await resposta.json()) as { id: string }).id;
}

/** Uma conversa com a janela de 24 h aberta (ou fechada), atribuída a `atendenteId`. */
async function criarConversa(
  atendenteId: string | null,
  janela: 'aberta' | 'fechada' = 'aberta',
): Promise<string> {
  const { rows: contatos } = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${cenario.tenantId}, 'Cliente', ${`+55119${Math.floor(Math.random() * 1e8)}`})
    returning id
  `);
  const expira = janela === 'aberta' ? sql`now() + interval '1 hour'` : sql`now() - interval '1 hour'`;
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado,
                          atribuida_em, janela_expira_em, ultima_mensagem_em, ultima_mensagem_de)
    values (${cenario.tenantId}, ${cenario.inboxId}::uuid, ${contatos[0]!.id}::uuid,
            ${cenario.filaId}::uuid, ${atendenteId}, 'atribuida', now(), ${expira},
            now() - interval '5 minutes', 'contato')
    returning id
  `);
  return rows[0]!.id;
}

async function enviarLote(
  conversaId: string,
  corpo: unknown,
  cabecalhos: Record<string, string> = comChave(),
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const resposta = await fetch(`${api.url}/v1/conversas/${conversaId}/mensagens/anexos`, {
    method: 'POST',
    headers: cabecalhos,
    body: JSON.stringify(corpo),
  });
  return { status: resposta.status, corpo: (await resposta.json()) as Record<string, unknown> };
}

async function mensagensDe(conversaId: string) {
  const { rows } = await cenario.dono.execute<{
    id: string;
    tipo: string;
    anexo_id: string | null;
    conteudo: string | null;
    estado_entrega: string;
  }>(sql`
    select id, tipo, anexo_id, conteudo, estado_entrega from mensagem
     where conversa_id = ${conversaId}::uuid and direcao = 'saida'
     order by criada_em asc, id asc
  `);
  return rows;
}

describe('POST /v1/conversas/:id/mensagens/anexos', () => {
  it('três arquivos viram três mensagens, na ordem, uma por arquivo, com o tipo do MIME', async () => {
    const conversaId = await criarConversa(cenario.atendenteId);
    const foto = await subir(PNG, 'image/png', 'foto.png');
    const contrato = await subir(PDF, 'application/pdf', 'contrato.pdf');
    const outra = await subir(PNG, 'image/png', 'outra.png');

    const { status, corpo } = await enviarLote(conversaId, {
      anexo_ids: [foto, contrato, outra],
      texto: 'Segue o material',
    });
    expect(status).toBe(201);
    const mensagens = corpo['mensagens'] as { id: string; estado_entrega: string }[];
    expect(mensagens).toHaveLength(3);
    expect(mensagens.every((m) => m.estado_entrega === 'pendente')).toBe(true);

    // Na ordem em que a resposta diz que saíram (a ordem do lote), não na do relógio.
    const todas = await mensagensDe(conversaId);
    const gravadas = mensagens.map((m) => todas.find((g) => g.id === m.id)!);
    expect(gravadas.map((m) => m.anexo_id)).toEqual([foto, contrato, outra]);
    expect(gravadas.map((m) => m.tipo)).toEqual(['imagem', 'documento', 'imagem']);
    // A legenda vai na PRIMEIRA, só.
    expect(gravadas.map((m) => m.conteudo)).toEqual(['Segue o material', null, null]);

    const { rows: outbox } = await cenario.dono.execute<{ n: string }>(sql`
      select count(*)::text as n from outbox_mensagem
       where mensagem_id in (select id from mensagem where conversa_id = ${conversaId}::uuid)
    `);
    expect(Number(outbox[0]?.n)).toBe(3);

    const { rows: conversa } = await cenario.dono.execute<{ estado: string }>(
      sql`select estado from conversa where id = ${conversaId}::uuid`,
    );
    expect(conversa[0]?.estado).toBe('em_atendimento');
  });

  it('mais de 10 recusa o lote inteiro, sem mandar nenhuma', async () => {
    const conversaId = await criarConversa(cenario.atendenteId);
    const ids: string[] = [];
    for (let i = 0; i <= MAX_ARQUIVOS_POR_MENSAGEM; i += 1) {
      ids.push(await subir(PNG, 'image/png', `f${i}.png`));
    }
    const { status, corpo } = await enviarLote(conversaId, { anexo_ids: ids });
    expect(status).toBe(400);
    expect((corpo['erro'] as { codigo: string }).codigo).toBe('anexos_demais');
    expect(await mensagensDe(conversaId)).toHaveLength(0);
  });

  it('um anexo inexistente no meio do lote recusa tudo — nenhuma mensagem antes nem depois', async () => {
    const conversaId = await criarConversa(cenario.atendenteId);
    const ok1 = await subir(PNG, 'image/png', 'a.png');
    const ok2 = await subir(PNG, 'image/png', 'b.png');
    const { status } = await enviarLote(conversaId, { anexo_ids: [ok1, randomUUID(), ok2] });
    expect(status).toBe(404);
    expect(await mensagensDe(conversaId)).toHaveLength(0);
  });

  it('um arquivo acima do teto do tipo recusa o lote inteiro e diz qual é', async () => {
    const conversaId = await criarConversa(cenario.atendenteId);
    const ok = await subir(PNG, 'image/png', 'ok.png');
    const grande = await subir(PDF, 'application/pdf', 'enorme.pdf');
    // O upload já barra o tamanho; para provar a conferência por arquivo no LOTE, a
    // linha é adulterada com o papel dono, como se tivesse entrado por outro caminho.
    await cenario.dono.execute(sql`
      update anexo set bytes = ${MAX_BYTES_POR_ARQUIVO + 1} where id = ${grande}::uuid
    `);
    const { status, corpo } = await enviarLote(conversaId, { anexo_ids: [ok, grande] });
    expect(status).toBe(400);
    const erro = corpo['erro'] as { codigo: string; mensagem: string };
    expect(erro.codigo).toBe('arquivo_grande_demais');
    expect(erro.mensagem).toContain('enorme.pdf');
    expect(await mensagensDe(conversaId)).toHaveLength(0);
  });

  it('sem `anexo_ids` (ou vazio) é 400', async () => {
    const conversaId = await criarConversa(cenario.atendenteId);
    expect((await enviarLote(conversaId, {})).status).toBe(400);
    expect((await enviarLote(conversaId, { anexo_ids: [] })).status).toBe(400);
    expect((await enviarLote(conversaId, { anexo_ids: 'x' })).status).toBe(400);
  });

  it('janela de 24 h fechada: nada sai, com o mesmo 409 do envio simples', async () => {
    const conversaId = await criarConversa(cenario.atendenteId, 'fechada');
    const a1 = await subir(PNG, 'image/png', 'a.png');
    const a2 = await subir(PNG, 'image/png', 'b.png');
    const { status, corpo } = await enviarLote(conversaId, { anexo_ids: [a1, a2] });
    expect(status).toBe(409);
    expect((corpo['erro'] as { codigo: string }).codigo).toBe('janela_fechada');
    expect(await mensagensDe(conversaId)).toHaveLength(0);
  });

  it('pela sessão do Desk: o dono envia; conversa de outro atendente é 403 e nada sai', async () => {
    const minha = await criarConversa(cenario.atendenteId);
    const a1 = await subir(PNG, 'image/png', 'a.png');
    const a2 = await subir(PNG, 'image/png', 'b.png');
    const ok = await enviarLote(minha, { anexo_ids: [a1, a2] }, comCookie());
    expect(ok.status).toBe(201);
    const gravadas = await mensagensDe(minha);
    expect(gravadas).toHaveLength(2);

    const { rows } = await cenario.dono.execute<{ autor_id: string | null }>(
      sql`select autor_id from mensagem where id = ${gravadas[0]!.id}::uuid`,
    );
    expect(rows[0]?.autor_id).toBe(cenario.atendenteId);

    const doColega = await criarConversa(colegaId);
    const recusa = await enviarLote(doColega, { anexo_ids: [a1] }, comCookie());
    expect(recusa.status).toBe(403);
    expect(await mensagensDe(doColega)).toHaveLength(0);
  });

  it('o mesmo anexo repetido no lote vira uma mensagem só', async () => {
    const conversaId = await criarConversa(cenario.atendenteId);
    const a1 = await subir(PNG, 'image/png', 'a.png');
    const { status, corpo } = await enviarLote(conversaId, { anexo_ids: [a1, a1] });
    expect(status).toBe(201);
    expect(corpo['mensagens']).toHaveLength(1);
  });
});
