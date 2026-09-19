import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { dubleWhatsApp, processarOutbox } = await import('@pipe/workers');
const { subirApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/banco.js');
const { importarFluxoDaBlip } = await import('../src/dominio/fluxo.js');
const { encerrarConversa } = await import('../src/dominio/conversa.js');
const { assinar, montarCenario, payloadDeMensagem } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * O bot de ponta a ponta, com o dublê do WhatsApp e a fila em linha:
 * mensagem entra → o bot responde pelo outbox → o cliente escolhe → transferência →
 * conversa na fila com o contexto → humano ganha → encerra → a próxima mensagem volta
 * ao fluxo no bloco que o atendimento aponta.
 *
 * O fluxo é a fixture SINTÉTICA do core, no formato do editor do Builder da Blip,
 * importada pelo mesmo caminho que um fluxo de cliente usaria.
 */

const FIXTURE: unknown = JSON.parse(
  readFileSync(
    new URL('../../../packages/core/src/fluxo/fixtures/editor-sintetico.json', import.meta.url),
    'utf8',
  ),
);

const ANA = '5511911110001';
const BIA = '5511911110002';
const CAIO = '5511911110003';
const DAVI = '5511911110004';

let cenario: Cenario;
let api: ApiNoAr;

async function publicar(json: unknown): Promise<void> {
  const r = await noTenant(cenario.tenantId, (tx) =>
    importarFluxoDaBlip(tx, {
      tenantId: cenario.tenantId,
      nome: 'Atendimento',
      canalId: cenario.canalId,
      json,
      publicar: true,
    }),
  );
  expect(r.erroDeValidacao).toBeNull();
  expect(r.relatorio.naoSuportado).toBeDefined();
}

beforeAll(async () => {
  cenario = await montarCenario(`fluxo-${randomUUID().slice(0, 8)}`);
  api = await subirApi(0);
  dubleWhatsApp.reiniciar();
  // Sem ninguém online: a conversa transferida tem de ficar NA FILA para o teste ver.
  await cenario.dono.execute(
    sql`update status_atendente set estado = 'offline' where usuario_id = ${cenario.atendenteId}::uuid`,
  );
  await publicar(FIXTURE);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await cenario?.encerrar();
});

async function falar(de: string, texto: string, id?: string): Promise<void> {
  const corpo = JSON.stringify(payloadDeMensagem(de, texto, id ? { id } : {}));
  const resposta = await fetch(`${api.url}/webhooks/whatsapp/${cenario.canalId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
    body: corpo,
  });
  expect(resposta.status).toBe(200);
}

type Conversa = { id: string; estado: string; fila_id: string | null; atendente_id: string | null };

async function conversaAberta(telefone: string): Promise<Conversa> {
  const { rows } = await cenario.dono.execute<Conversa>(sql`
    select c.id, c.estado, c.fila_id, c.atendente_id
      from conversa c join contato ct on ct.id = c.contato_id
     where c.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${telefone}`}
       and c.estado <> 'encerrada'
     order by c.criada_em desc limit 1
  `);
  expect(rows[0]).toBeDefined();
  return rows[0]!;
}

async function doBot(conversaId: string): Promise<string[]> {
  const { rows } = await cenario.dono.execute<{ conteudo: string }>(sql`
    select conteudo from mensagem
     where conversa_id = ${conversaId}::uuid and autor_tipo = 'bot'
     order by criada_em
  `);
  return rows.map((r) => r.conteudo);
}

async function eventos(conversaId: string): Promise<string[]> {
  const { rows } = await cenario.dono.execute<{ tipo: string }>(
    sql`select tipo from evento_atendimento where conversa_id = ${conversaId}::uuid order by em`,
  );
  return rows.map((r) => r.tipo);
}

describe('bot com o dublê do WhatsApp', () => {
  it('mensagem entra → o bot responde pelo outbox, e a conversa não está em fila nenhuma', async () => {
    await falar(ANA, 'oi');
    const conversa = await conversaAberta(ANA);
    expect(conversa.fila_id).toBeNull();
    expect(conversa.atendente_id).toBeNull();
    expect(await doBot(conversa.id)).toEqual(['Olá! Qual é o seu nome?']);

    // O tempo com o bot não é tempo de fila: sem `criada` nem `enfileirada` ainda.
    const tipos = await eventos(conversa.id);
    expect(tipos).not.toContain('criada');
    expect(tipos).not.toContain('enfileirada');

    const antes = dubleWhatsApp.chamadas.length;
    const resultados = await processarOutbox();
    expect(resultados.some((r) => r.estado === 'enviada')).toBe(true);
    expect(
      dubleWhatsApp.chamadas.slice(antes).some((c) => c.para === ANA && c.tipo === 'texto'),
    ).toBe(true);
    const { rows } = await cenario.dono.execute<{ estado_entrega: string }>(sql`
      select estado_entrega from mensagem where conversa_id = ${conversa.id}::uuid and autor_tipo = 'bot'
    `);
    expect(rows.map((r) => r.estado_entrega)).toEqual(['enviada']);
  });

  it('o cliente responde e o bot usa a variável no menu', async () => {
    await falar(ANA, 'Ana');
    const conversa = await conversaAberta(ANA);
    expect((await doBot(conversa.id)).at(-1)).toBe(
      'Prazer, Ana. Como posso ajudar?\n1. Financeiro\n2. Suporte',
    );

    // O menu vai estruturado em `dados`, e com 2 opções o worker manda em botões
    // (quick reply nasce ligado). O texto numerado continua sendo o conteúdo gravado.
    const { rows } = await cenario.dono.execute<{ dados: unknown }>(sql`
      select dados from mensagem where conversa_id = ${conversa.id}::uuid and autor_tipo = 'bot'
       order by criada_em desc limit 1
    `);
    expect(rows[0]?.dados).toEqual({
      pergunta: { texto: 'Prazer, Ana. Como posso ajudar?', opcoes: ['Financeiro', 'Suporte'] },
    });
    const antes = dubleWhatsApp.chamadas.length;
    await processarOutbox();
    expect(dubleWhatsApp.chamadas.slice(antes).filter((c) => c.para === ANA).map((c) => c.tipo)).toEqual([
      'interativo',
    ]);
  });

  it('o cliente escolhe → transferência → a conversa entra na fila com o contexto coletado', async () => {
    await falar(ANA, '2');
    const conversa = await conversaAberta(ANA);
    expect(conversa.fila_id).toBe(cenario.filaId);
    expect(conversa.estado).toBe('na_fila');
    expect(conversa.atendente_id).toBeNull();

    const { rows: notas } = await cenario.dono.execute<{ corpo: string }>(
      sql`select corpo from nota_interna where conversa_id = ${conversa.id}::uuid`,
    );
    expect(notas).toHaveLength(1);
    expect(notas[0]!.corpo).toContain('- nome: Ana');
    expect(notas[0]!.corpo).toContain('- opcao: 2');

    const { rows: execucoes } = await cenario.dono.execute<{
      estado: string;
      codigo: string | null;
      contexto: Record<string, string>;
    }>(sql`
      select e.estado, b.codigo, e.contexto from execucao_fluxo e
        left join bloco b on b.id = e.bloco_atual_id
       where e.conversa_id = ${conversa.id}::uuid
    `);
    expect(execucoes[0]).toMatchObject({ estado: 'concluida', codigo: 'desk:suporte' });
    expect(execucoes[0]!.contexto['nome']).toBe('Ana');

    const tipos = await eventos(conversa.id);
    expect(tipos).toContain('criada');
    expect(tipos).toContain('enfileirada');
  });

  it('humano ganha: na fila e depois com o atendente, o bot fica calado', async () => {
    const conversa = await conversaAberta(ANA);
    const respostas = (await doBot(conversa.id)).length;

    await falar(ANA, 'alô?');
    expect(await doBot(conversa.id)).toHaveLength(respostas);

    await cenario.dono.execute(
      sql`update status_atendente set estado = 'online' where usuario_id = ${cenario.atendenteId}::uuid`,
    );
    await falar(ANA, 'tem alguém aí?');
    const atribuida = await conversaAberta(ANA);
    expect(atribuida.id).toBe(conversa.id);
    expect(atribuida.atendente_id).toBe(cenario.atendenteId);
    expect(await doBot(conversa.id)).toHaveLength(respostas);
  });

  it('encerrado o atendimento, a próxima mensagem volta ao fluxo no bloco que o atendimento aponta', async () => {
    const conversa = await conversaAberta(ANA);
    const { rows: etiquetas } = await cenario.dono.execute<{ id: string }>(sql`
      insert into etiqueta (tenant_id, nome) values (${cenario.tenantId}::uuid, ${`Resolvido ${randomUUID().slice(0, 6)}`})
      returning id
    `);
    await encerrarConversa(
      { tenantId: cenario.tenantId, atendenteId: cenario.atendenteId, exigirAtribuicao: true },
      { conversaId: conversa.id, etiquetaId: etiquetas[0]!.id },
    );

    await falar(ANA, 'oi de novo');
    const nova = await conversaAberta(ANA);
    expect(nova.id).not.toBe(conversa.id);
    expect(nova.fila_id).toBeNull();
    expect(await doBot(nova.id)).toEqual([
      'Seu atendimento foi encerrado. Posso ajudar em algo mais?',
    ]);

    // O contexto é do contato: a conversa nova sabe o nome.
    const { rows } = await cenario.dono.execute<{
      contexto: Record<string, string>;
      codigo: string;
    }>(sql`
      select e.contexto, b.codigo from execucao_fluxo e join bloco b on b.id = e.bloco_atual_id
       where e.conversa_id = ${nova.id}::uuid
    `);
    expect(rows[0]!.contexto['nome']).toBe('Ana');
    expect(rows[0]!.codigo).toBe('pos-atendimento');
  });

  it('reentrega da mesma mensagem não duplica a resposta do bot', async () => {
    const id = `wamid.REPETIDA.${randomUUID()}`;
    await falar(BIA, 'oi', id);
    await falar(BIA, 'oi', id);
    const conversa = await conversaAberta(BIA);
    expect(await doBot(conversa.id)).toEqual(['Olá! Qual é o seu nome?']);
    const { rows } = await cenario.dono.execute<{ total: string }>(
      sql`select count(*)::text as total from execucao_passo where entrada->>'id_provedor' = ${id}`,
    );
    expect(Number(rows[0]!.total)).toBe(1);
  });

  it('humano ganha no meio do fluxo: com atendente, o bot não responde mais', async () => {
    await falar(CAIO, 'oi');
    const conversa = await conversaAberta(CAIO);
    await cenario.dono.execute(sql`
      update conversa set atendente_id = ${cenario.atendenteId}::uuid, fila_id = ${cenario.filaId}::uuid,
                          estado = 'atribuida'
       where id = ${conversa.id}::uuid
    `);
    await falar(CAIO, 'Caio');
    expect(await doBot(conversa.id)).toEqual(['Olá! Qual é o seu nome?']);
  });

  it('fluxo que falha (ação que o Pipe não executa) manda a conversa para a fila, não deixa o cliente sem resposta', async () => {
    const comScript = JSON.parse(JSON.stringify(FIXTURE)) as {
      flow: Record<string, { $enteringCustomActions: unknown[] }>;
    };
    comScript.flow['boas-vindas']!.$enteringCustomActions.push({
      type: 'ExecuteScript',
      settings: { function: 'run', source: 'function run() { return 1; }', outputVariable: 'x' },
      conditions: [],
    });
    await publicar(comScript);

    await falar(DAVI, 'oi');
    const conversa = await conversaAberta(DAVI);
    expect(conversa.fila_id).toBe(cenario.filaId);
    const { rows } = await cenario.dono.execute<{ estado: string }>(
      sql`select estado from execucao_fluxo where conversa_id = ${conversa.id}::uuid`,
    );
    expect(rows[0]!.estado).toBe('falhou');
    const { rows: notas } = await cenario.dono.execute<{ corpo: string }>(
      sql`select corpo from nota_interna where conversa_id = ${conversa.id}::uuid`,
    );
    expect(notas[0]!.corpo).toContain('o fluxo falhou');
    expect(notas[0]!.corpo).toContain('ExecuteScript');
  });
});
