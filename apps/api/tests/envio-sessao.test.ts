import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 5).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { NOME_DO_COOKIE, criarToken } = await import('@pipe/autenticacao');
const { subirApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * Responder pelo Desk tem de ENTREGAR.
 *
 * O defeito que estes testes trancam: o Desk gravava `mensagem` com
 * `estado_entrega='enviada'` e não inseria em `outbox_mensagem`. O atendente via o
 * ✓ e o cliente não recebia nada. A correção foi fazer a tela usar a MESMA rota da
 * integração, e o que estes testes provam é que a rota aceita as duas credenciais
 * sem afrouxar nenhuma regra.
 */

let cenario: Cenario;
let api: ApiNoAr;
let cookieDoAtendente: string;
let outroAtendenteId: string;
let contatoId: string;

beforeAll(async () => {
  cenario = await montarCenario(`envio-${randomUUID().slice(0, 8)}`);
  api = await subirApi(0);

  const novo = criarToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${cenario.atendenteId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  cookieDoAtendente = novo.token;

  const { rows: outro } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, 'Bruno Colega', ${`bruno-${randomUUID().slice(0, 8)}@e2e.pipe.app`})
    returning id
  `);
  outroAtendenteId = outro[0]!.id;

  const { rows: c } = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${cenario.tenantId}, 'Cliente do Teste', '+5511955554444')
    returning id
  `);
  contatoId = c[0]!.id;
});

afterAll(async () => {
  await api.fechar();
  await cenario.encerrar();
});

/** Uma conversa aberta, com janela de 24h em aberto, atribuída a quem se pedir. */
async function novaConversa(atendenteId: string | null): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into conversa (
      tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado,
      janela_expira_em, ultima_mensagem_em, ultima_mensagem_de
    ) values (
      ${cenario.tenantId}, ${cenario.inboxId}, ${contatoId}, ${cenario.filaId},
      ${atendenteId}, ${atendenteId ? 'atribuida' : 'na_fila'},
      now() + interval '20 hours', now(), 'contato'
    )
    returning id
  `);
  return rows[0]!.id;
}

function enviar(
  conversaId: string,
  corpo: Record<string, unknown>,
  credencial: { cookie?: string; token?: string },
): Promise<Response> {
  const cabecalhos: Record<string, string> = { 'content-type': 'application/json' };
  if (credencial.cookie) cabecalhos['cookie'] = `${NOME_DO_COOKIE}=${credencial.cookie}`;
  if (credencial.token) cabecalhos['authorization'] = `Bearer ${credencial.token}`;
  return fetch(`${api.url}/v1/conversas/${conversaId}/mensagens`, {
    method: 'POST',
    headers: cabecalhos,
    body: JSON.stringify(corpo),
  });
}

async function contarOutbox(conversaId: string): Promise<number> {
  const { rows } = await cenario.dono.execute<{ n: number }>(sql`
    select count(*)::int as n
      from outbox_mensagem o
      join mensagem m on m.id = o.mensagem_id
     where m.conversa_id = ${conversaId}::uuid
  `);
  return rows[0]?.n ?? 0;
}

describe('responder pelo Desk, com cookie de sessão', () => {
  it('grava a mensagem PENDENTE e cria a linha no outbox — o defeito que existia', async () => {
    const conversaId = await novaConversa(cenario.atendenteId);

    const resposta = await enviar(conversaId, { texto: 'Boa tarde!' }, { cookie: cookieDoAtendente });

    expect(resposta.status).toBe(201);
    const corpo = (await resposta.json()) as { id: string; estado_entrega: string };
    // `pendente`, e não `enviada`: quem avança o estado é a confirmação da Meta.
    expect(corpo.estado_entrega).toBe('pendente');
    expect(await contarOutbox(conversaId)).toBe(1);
  });

  it('assina a mensagem com o usuário do COOKIE', async () => {
    const conversaId = await novaConversa(cenario.atendenteId);

    await enviar(conversaId, { texto: 'Oi' }, { cookie: cookieDoAtendente });

    const { rows } = await cenario.dono.execute<{ autor_tipo: string; autor_id: string }>(sql`
      select autor_tipo, autor_id from mensagem where conversa_id = ${conversaId}::uuid limit 1
    `);
    expect(rows[0]?.autor_tipo).toBe('atendente');
    expect(rows[0]?.autor_id).toBe(cenario.atendenteId);
  });

  it('IGNORA atendente_id do corpo — ninguém manda mensagem em nome de colega', async () => {
    const conversaId = await novaConversa(cenario.atendenteId);

    const resposta = await enviar(
      conversaId,
      { texto: 'Tentando me passar por outro', atendente_id: outroAtendenteId },
      { cookie: cookieDoAtendente },
    );

    expect(resposta.status).toBe(201);
    const { rows } = await cenario.dono.execute<{ autor_id: string }>(sql`
      select autor_id from mensagem where conversa_id = ${conversaId}::uuid limit 1
    `);
    expect(rows[0]?.autor_id).toBe(cenario.atendenteId);
    expect(rows[0]?.autor_id).not.toBe(outroAtendenteId);
  });

  it('registra `mensagem_saida` e `primeira_resposta` — sem isso a Gestão mente', async () => {
    const conversaId = await novaConversa(cenario.atendenteId);

    await enviar(conversaId, { texto: 'Primeira resposta' }, { cookie: cookieDoAtendente });

    const { rows } = await cenario.dono.execute<{ tipo: string }>(sql`
      select tipo from evento_atendimento where conversa_id = ${conversaId}::uuid order by tipo
    `);
    const tipos = rows.map((r) => r.tipo);
    expect(tipos).toContain('mensagem_saida');
    expect(tipos).toContain('primeira_resposta');
  });

  it('recusa conversa de OUTRO atendente', async () => {
    const conversaId = await novaConversa(outroAtendenteId);

    const resposta = await enviar(conversaId, { texto: 'Não é minha' }, { cookie: cookieDoAtendente });

    expect(resposta.status).toBe(403);
    const corpo = (await resposta.json()) as { erro: { codigo: string } };
    expect(corpo.erro.codigo).toBe('conversa_de_outro_atendente');
    // E nada foi para a fila de entrega.
    expect(await contarOutbox(conversaId)).toBe(0);
  });

  it('recusa conversa que ainda está na fila, sem dono', async () => {
    const conversaId = await novaConversa(null);

    const resposta = await enviar(conversaId, { texto: 'Ninguém pegou' }, { cookie: cookieDoAtendente });

    expect(resposta.status).toBe(403);
    expect(await contarOutbox(conversaId)).toBe(0);
  });

  it('sem cookie e sem chave, 401', async () => {
    const conversaId = await novaConversa(cenario.atendenteId);
    const resposta = await enviar(conversaId, { texto: 'anônimo' }, {});
    expect(resposta.status).toBe(401);
  });

  it('cookie forjado, 401', async () => {
    const conversaId = await novaConversa(cenario.atendenteId);
    const resposta = await enviar(conversaId, { texto: 'forjado' }, { cookie: criarToken().token });
    expect(resposta.status).toBe(401);
  });
});

describe('a mesma rota, com chave de API — comportamento antigo intacto', () => {
  it('continua enviando, e continua aceitando atendente_id do corpo', async () => {
    const conversaId = await novaConversa(outroAtendenteId);

    // Chave de API NÃO é atendente: a regra de "conversa atribuída a você" não vale,
    // porque integração não tem dono. Por isso esta passa onde o cookie foi recusado.
    const resposta = await enviar(
      conversaId,
      { texto: 'Da integração', atendente_id: outroAtendenteId },
      { token: cenario.token },
    );

    expect(resposta.status).toBe(201);
    expect(await contarOutbox(conversaId)).toBe(1);
    const { rows } = await cenario.dono.execute<{ autor_id: string }>(sql`
      select autor_id from mensagem where conversa_id = ${conversaId}::uuid limit 1
    `);
    expect(rows[0]?.autor_id).toBe(outroAtendenteId);
  });

  it('sem o escopo mensagens:escrever, 403', async () => {
    const conversaId = await novaConversa(cenario.atendenteId);
    const resposta = await enviar(conversaId, { texto: 'x' }, { token: cenario.tokenSemEscopo });
    expect(resposta.status).toBe(403);
  });

  it('Bearer inválido não cai no caminho do cookie', async () => {
    // A armadilha da rota que aceita duas credenciais: se o Bearer errado fosse
    // ignorado, bastaria mandar lixo no header para ser tratado como visitante — e,
    // com um cookie válido junto, virar a pessoa. Bearer presente é Bearer conferido.
    const conversaId = await novaConversa(cenario.atendenteId);
    const resposta = await fetch(`${api.url}/v1/conversas/${conversaId}/mensagens`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer pipe_lixo_lixo',
        cookie: `${NOME_DO_COOKIE}=${cookieDoAtendente}`,
      },
      body: JSON.stringify({ texto: 'x' }),
    });
    expect(resposta.status).toBe(401);
  });
});
