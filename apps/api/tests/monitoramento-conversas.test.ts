import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { NOME_DO_COOKIE, criarToken } = await import('@pipe/autenticacao');
const { subirApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;
let a: Cenario;
let b: Cenario;
let api: ApiNoAr;
let gestor: string;
let semPoder: string;
let gestorB: string;

async function pessoa(cenario: Cenario, permissoes: string[]): Promise<string> {
  const marca = randomUUID().slice(0, 8);
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${cenario.tenantId}, ${`Gestor ${marca}`}, ${`gestor-${marca}@e2e.pipe.app`}) returning id
  `);
  const usuarioId = rows[0]!.id;
  if (permissoes.length === 0) return usuarioId;
  for (const codigo of permissoes) await cenario.dono.execute(sql`
    insert into permissao (codigo, descricao, grupo)
    values (${codigo}, ${codigo}, 'teste') on conflict (codigo) do nothing
  `);
  const { rows: papeis } = await cenario.dono.execute<{ id: string }>(sql`
    insert into papel (tenant_id, nome, escopo)
    values (${cenario.tenantId}, ${`monitoramento ${marca}`}, 'atendimento') returning id
  `);
  for (const codigo of permissoes) await cenario.dono.execute(sql`
    insert into papel_permissao (tenant_id, papel_id, permissao_codigo)
    values (${cenario.tenantId}, ${papeis[0]!.id}, ${codigo})
  `);
  await cenario.dono.execute(sql`
    insert into usuario_papel (tenant_id, usuario_id, papel_id)
    values (${cenario.tenantId}, ${usuarioId}, ${papeis[0]!.id})
  `);
  return usuarioId;
}

async function sessao(cenario: Cenario, usuarioId: string): Promise<string> {
  const token = criarToken();
  await cenario.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${cenario.tenantId}, ${usuarioId}, ${token.hash}, ${token.expiraEm}, 'google')
  `);
  return token.token;
}

const cabecalho = (token: string) => ({ cookie: `${NOME_DO_COOKIE}=${token}`, 'content-type': 'application/json' });

async function conversa(cenario = a): Promise<string> {
  const sufixo = randomUUID().slice(0, 8);
  const { rows: contatos } = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${cenario.tenantId}, ${`Contato ${sufixo}`}, ${`+55119${Math.floor(Math.random() * 1e8)}`}) returning id
  `);
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado, atribuida_em)
    values (${cenario.tenantId}, ${cenario.inboxId}, ${contatos[0]!.id}, ${cenario.filaId},
            ${cenario.atendenteId}, 'em_atendimento', now()) returning id
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
  const permissoes = ['monitoramento.tempo_real.ver', 'conversa.nota_interna', 'conversa.transferir', 'conversa.encerrar'];
  gestor = await sessao(a, await pessoa(a, permissoes));
  semPoder = await sessao(a, await pessoa(a, []));
  gestorB = await sessao(b, await pessoa(b, permissoes));
  api = await subirApi(0);
}, 180_000);

afterAll(async () => { await api?.fechar(); await a?.encerrar(); await b?.encerrar(); });

describe('monitoramento/conversas', () => {
  it('lê a prévia, grava nota e deixa auditoria', async () => {
    const id = await conversa();
    const previa = await pedir(gestor, 'GET', `/v1/gestao/monitoramento/conversas/${id}`);
    expect(previa.status).toBe(200);
    expect((await previa.json() as { id: string }).id).toBe(id);

    expect((await pedir(gestor, 'POST', `/v1/gestao/monitoramento/conversas/${id}/notas`, { texto: 'Acompanhar este atendimento.' })).status).toBe(201);
    const { rows: notas } = await a.dono.execute<{ corpo: string }>(sql`select corpo from nota_interna where conversa_id = ${id}::uuid`);
    expect(notas[0]?.corpo).toBe('Acompanhar este atendimento.');
    const { rows: log } = await a.dono.execute<{ depois: { acao: string } }>(sql`
      select depois from log_auditoria where objeto_tipo = 'conversa' and objeto_id = ${id}::uuid order by em desc limit 1
    `);
    expect(log[0]?.depois.acao).toBe('falar_com_atendente');
  });

  it('transfere e finaliza com capacidades próprias e registra auditoria', async () => {
    const transferida = await conversa();
    const transferencia = await pedir(gestor, 'POST', `/v1/gestao/monitoramento/conversas/${transferida}/transferir`, { para_fila_id: a.filaId });
    expect(transferencia.status).toBe(201);
    expect((await transferencia.json() as { para_conversa_id: string }).para_conversa_id).toMatch(/^[0-9a-f-]{36}$/);

    const finalizada = await conversa();
    const resposta = await pedir(gestor, 'POST', `/v1/gestao/monitoramento/conversas/${finalizada}/finalizar`, { etiqueta_ids: [await etiqueta()] });
    expect(resposta.status).toBe(201);
    expect((await resposta.json() as { estado: string }).estado).toBe('encerrada');
    const { rows: log } = await a.dono.execute<{ depois: { acao: string } }>(sql`
      select depois from log_auditoria where objeto_tipo = 'conversa' and objeto_id = ${finalizada}::uuid order by em desc limit 1
    `);
    expect(log.some((linha) => linha.depois.acao === 'finalizou_no_monitoramento')).toBe(true);
  });

  it('isola tenant, rejeita uuid malformado, falta de permissão e finalização sem etiqueta', async () => {
    const id = await conversa();
    expect((await pedir(gestorB, 'GET', `/v1/gestao/monitoramento/conversas/${id}`)).status).toBe(404);
    expect((await pedir(gestorB, 'POST', `/v1/gestao/monitoramento/conversas/${id}/finalizar`, { etiqueta_ids: [] })).status).toBe(404);
    expect((await pedir(gestor, 'GET', '/v1/gestao/monitoramento/conversas/nao-e-uuid')).status).toBe(404);
    expect((await pedir(semPoder, 'POST', `/v1/gestao/monitoramento/conversas/${id}/transferir`, { para_fila_id: a.filaId })).status).toBe(403);
    expect((await pedir(semPoder, 'POST', `/v1/gestao/monitoramento/conversas/${id}/finalizar`, { etiqueta_ids: [] })).status).toBe(403);
    const semEtiqueta = await pedir(gestor, 'POST', `/v1/gestao/monitoramento/conversas/${id}/finalizar`, {});
    expect(semEtiqueta.status).toBe(400);
    expect((await semEtiqueta.json() as { erro: { codigo: string } }).erro.codigo).toBe('etiqueta_obrigatoria');
  });
});
