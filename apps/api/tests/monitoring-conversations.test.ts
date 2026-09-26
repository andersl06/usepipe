import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { NOME_DO_COOKIE, createToken } = await import('@pipe/authentication');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;
let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
let gestor: string;
let semPoder: string;
let gestorB: string;

async function pessoa(cenario: Cenario, permissions: string[]): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, ${`Gestor ${marca}`}, ${`gestor-${marca}@e2e.pipe.app`}) returning id
  `);
  const userId = rows[0]!.id;
  if (permissions.length === 0) return userId;
  for (const codigo of permissions) await cenario.dono.execute(sql`
    insert into permissao (codigo, descricao, grupo)
    values (${codigo}, ${codigo}, 'teste') on conflict (codigo) do nothing
  `);
  const { rows: papeis } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo)
    values (${cenario.tenantId}, ${`monitoramento ${marca}`}, 'atendimento') returning id
  `);
  for (const codigo of permissions) await cenario.dono.execute(sql`
    insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
    values (${cenario.tenantId}, ${papeis[0]!.id}, ${codigo})
  `);
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    values (${cenario.tenantId}, ${userId}, ${papeis[0]!.id})
  `);
  return userId;
}

async function session(cenario: Cenario, userId: string): Promise<string> {
  const token = createToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${userId}, ${token.hash}, ${token.expiraEm}, 'google')
  `);
  return token.token;
}

const cabecalho = (token: string) => ({ cookie: `${NOME_DO_COOKIE}=${token}`, 'content-type': 'application/json' });

async function conversation(cenario = a): Promise<string> {
  const sufixo = randomUUID().slice(0, 8);
  const { rows: contacts } = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${cenario.tenantId}, ${`Contato ${sufixo}`}, ${`+55119${Math.floor(Math.random() * 1e8)}`}) returning id
  `);
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado, atribuida_em)
    values (${cenario.tenantId}, ${cenario.inboxId}, ${contacts[0]!.id}, ${cenario.queueId},
            ${cenario.agentId}, 'em_atendimento', now()) returning id
  `);
  return rows[0]!.id;
}

async function etiqueta(): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into etiqueta (tenant_id, nome, obrigatoria_no_encerramento)
    values (${a.tenantId}, ${`Encerramento ${randomUUID().slice(0, 6)}`}, true) returning id
  `);
  return rows[0]!.id;
}

async function pedir(token: string, metodo: string, caminho: string, corpo?: unknown) {
  return fetch(`${api.url}${caminho}`, {
    method: metodo,
    headers: cabecalho(token),
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

beforeAll(async () => {
  a = await montarCenario(`mon-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`mon-${randomUUID().slice(0, 8)}`);
  const permissions = ['monitoramento.tempo_real.ver', 'conversa.nota_interna', 'conversa.transferir', 'conversa.encerrar'];
  gestor = await session(a, await pessoa(a, permissions));
  semPoder = await session(a, await pessoa(a, []));
  gestorB = await session(b, await pessoa(b, permissions));
  api = await upApi(0);
}, 180_000);

afterAll(async () => { await api?.fechar(); await a?.encerrar(); await b?.encerrar(); });

describe('Monitor conversations across queues and agents', () => {
  it('Query several queues and agents without dropping all but the last selected ID', async () => {
    const first = await conversation();
    const segunda = await conversation();
    const fora = await conversation(b);
    const atendente2 = await pessoa(a, []);
    const { rows: queues } = await a.dono.execute<{ id: string }>(sql`
      insert into fila (tenant_id, nome) values (${a.tenantId}, ${`Fila ${randomUUID()}`}) returning id
    `);
    const fila2 = queues[0]!.id;
    await a.dono.execute(sql`update conversa set fila_id = ${fila2}, atendente_id = ${atendente2} where id = ${segunda}`);
    for (const query of [
      `fila=${a.queueId},${fila2}&agent=${a.agentId},${atendente2}`,
      `fila=${a.queueId}&fila=${fila2}&agent=${a.agentId}&atendente=${atendente2}`,
    ]) {
      const resposta = await pedir(gestor, 'GET', `/v1/management/monitoring?${query}`);
      expect(resposta.status).toBe(200);
      const corpo = await resposta.json() as { data: { opens: { id: string }[] } };
      const ids = corpo.data.opens.map(c => c.id);
      expect(ids).toEqual(expect.arrayContaining([first, segunda]));
      expect(ids).not.toContain(fora);
    }
    const unica = await pedir(gestor, 'GET', `/v1/management/monitoring?fila=${fila2}`);
    const corpo = await unica.json() as { data: { opens: { id: string }[] } };
    expect(corpo.data.opens.map(c => c.id)).toEqual([segunda]);
  });

  it('lê a prévia, grava nota e deixa auditoria', async () => {
    const id = await conversation();
    const previa = await pedir(gestor, 'GET', `/v1/management/monitoring/conversations/${id}`);
    expect(previa.status).toBe(200);
    expect((await previa.json() as { id: string }).id).toBe(id);

    expect((await pedir(gestor, 'POST', `/v1/management/monitoring/conversations/${id}/notes`, { texto: 'Acompanhar este atendimento.' })).status).toBe(201);
    const { rows: notas } = await a.dono.execute<{ body: string }>(sql`select corpo from nota_interna where conversa_id = ${id}::uuid`);
    expect(notas[0]?.body).toBe('Acompanhar este atendimento.');
    const { rows: log } = await a.dono.execute<{ depois: { acao: string } }>(sql`
      select depois from log_auditoria where objeto_tipo = 'conversa' and objeto_id = ${id}::uuid order by em desc limit 1
    `);
    expect(log[0]?.depois.acao).toBe('falar_com_atendente');
  });

  it('Transfer or close monitored conversations under separate permissions and audit both', async () => {
    const transferida = await conversation();
    const transferencia = await pedir(gestor, 'POST', `/v1/management/monitoring/conversations/${transferida}/transfer`, { para_fila_id: a.queueId });
    expect(transferencia.status).toBe(201);
    expect((await transferencia.json() as { forConversationId: string }).forConversationId).toMatch(/^[0-9a-f-]{36}$/);

    const finalizada = await conversation();
    const resposta = await pedir(gestor, 'POST', `/v1/management/monitoring/conversations/${finalizada}/finalize`, { etiqueta_ids: [await etiqueta()] });
    expect(resposta.status).toBe(201);
    expect((await resposta.json() as { state: string }).state).toBe('encerrada');
    const { rows: log } = await a.dono.execute<{ depois: { acao: string } }>(sql`
      select depois from log_auditoria where objeto_tipo = 'conversa' and objeto_id = ${finalizada}::uuid order by em desc limit 1
    `);
    expect(log.some((linha) => linha.depois.acao === 'finalizou_no_monitoramento')).toBe(true);
  });

  it('Enforce tenant isolation, valid IDs, permissions, and a closure label in monitoring', async () => {
    const id = await conversation();
    expect((await pedir(gestorB, 'GET', `/v1/management/monitoring/conversations/${id}`)).status).toBe(404);
    expect((await pedir(gestorB, 'POST', `/v1/management/monitoring/conversations/${id}/finalize`, { etiqueta_ids: [] })).status).toBe(404);
    expect((await pedir(gestor, 'GET', '/v1/management/monitoring/conversations/nao-e-uuid')).status).toBe(404);
    expect((await pedir(semPoder, 'POST', `/v1/management/monitoring/conversations/${id}/transfer`, { para_fila_id: a.queueId })).status).toBe(403);
    expect((await pedir(semPoder, 'POST', `/v1/management/monitoring/conversations/${id}/finalize`, { etiqueta_ids: [] })).status).toBe(403);
    const semEtiqueta = await pedir(gestor, 'POST', `/v1/management/monitoring/conversations/${id}/finalize`, {});
    expect(semEtiqueta.status).toBe(400);
    expect((await semEtiqueta.json() as { error: { code: string } }).error.code).toBe('label_required');
  });
});
