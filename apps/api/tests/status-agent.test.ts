import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// The mode has to be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME: NOME_DO_COOKIE } = await import('../src/session.js');
const { upApi } = await import('../src/servidor.js');
const { definirStatus } = await import('../src/domain/status-agent.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * Cada troca efetiva de status do atendente grava uma linha de histórico (de, para, motivo) na mesma transação da troca, seja
 * pelo domínio (API e supervisor), pela ação do Desk, pela queda por inatividade ou pelo logout. Repetir o mesmo valor não grava.
 */

let a: Cenario;
let api: ApiNoAr;
let colegaId: string;

async function criarUsuario(nome: string): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email)
    values (${a.tenantId}, ${nome}, ${`${nome.toLowerCase().replace(/\W+/g, '-')}-${randomUUID().slice(0, 8)}@e2e.pipe.app`})
    returning id
  `);
  return rows[0]!.id;
}

async function abrirSessao(userId: string): Promise<string> {
  const novo = createToken();
  await a.dono.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
    values (${a.tenantId}, ${userId}, ${novo.hash}, ${novo.expiraEm}, 'google')
  `);
  return novo.token;
}

async function acaoDesk(session: string, nome: string, campos: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const resposta = await fetch(`${api.url}/v1/desk/actions/${nome}`, {
    method: 'POST',
    headers: { cookie: `${NOME_DO_COOKIE}=${session}`, 'content-type': 'application/json' },
    body: JSON.stringify({ campos }),
  });
  return (await resposta.json()) as Record<string, unknown>;
}

async function motivoDePausa(nome: string): Promise<string> {
  const { rows } = await a.dono.execute<{ id: string }>(sql`insert into motivo_pausa (tenant_id, nome) values (${a.tenantId}, ${nome}) returning id`);
  return rows[0]!.id;
}

interface Linha { de: string; para: string; motivo: string | null }

async function historico(userId: string): Promise<Linha[]> {
  const { rows } = await a.dono.execute<Linha & Record<string, unknown>>(sql`
    select de, para, motivo from status_atendente_historico
     where tenant_id = ${a.tenantId}::uuid and usuario_id = ${userId}::uuid order by em, id
  `);
  return rows.map((r) => ({ de: r.de, para: r.para, motivo: r.motivo }));
}

beforeAll(async () => {
  a = await montarCenario(`status-hist-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  colegaId = await criarUsuario('Colega de Status');
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await a?.encerrar();
});

describe('histórico de status do atendente', () => {
  it('Online -> Pause (com motivo) -> Invisible -> Online grava uma linha por troca, pelo domínio', async () => {
    const motivoId = await motivoDePausa('Almoço');
    const base = { tenantId: a.tenantId, byUserId: a.agentId, targetUserId: a.agentId };
    // O cenário já semeia o atendente como Online: repetir Online não grava nada.
    await definirStatus({ ...base, state: 'Online' });
    expect(await historico(a.agentId)).toEqual([]);

    await definirStatus({ ...base, state: 'Pause', motivoPausaId: motivoId });
    await definirStatus({ ...base, state: 'Invisible' });
    await definirStatus({ ...base, state: 'Online' });
    await definirStatus({ ...base, state: 'Online' });

    expect(await historico(a.agentId)).toEqual([
      { de: 'Online', para: 'Pause', motivo: 'Almoço' },
      { de: 'Pause', para: 'Invisible', motivo: null },
      { de: 'Invisible', para: 'Online', motivo: null },
    ]);
  });

  it('pausa sem motivo é recusada e não grava histórico', async () => {
    const antes = await historico(a.agentId);
    await expect(definirStatus({ tenantId: a.tenantId, byUserId: a.agentId, targetUserId: a.agentId, state: 'Pause' })).rejects.toThrow();
    expect(await historico(a.agentId)).toEqual(antes);
  });

  it('um supervisor trocando o status de outra pessoa também fica no histórico dela', async () => {
    const supervisor = a.agentId; // o dono do cenário tem `*`; aqui basta o ator ser outro usuário com a permissão
    await a.dono.execute(sql`
      insert into permissao (codigo, descricao, grupo) values ('monitoramento.tempo_real.ver', 'ver tempo real', 'teste') on conflict (codigo) do nothing
    `);
    const { rows: papeis } = await a.dono.execute<{ id: string }>(sql`
      insert into papel (tenant_id, nome, escopo) values (${a.tenantId}, ${`sup ${randomUUID().slice(0, 6)}`}, 'atendimento') returning id`);
    await a.dono.execute(sql`insert into papel_permissao (tenant_id, papel_id, permissao_codigo) values (${a.tenantId}, ${papeis[0]!.id}, 'monitoramento.tempo_real.ver')`);
    await a.dono.execute(sql`insert into usuario_papel (tenant_id, usuario_id, papel_id) values (${a.tenantId}, ${supervisor}, ${papeis[0]!.id})`);

    await definirStatus({ tenantId: a.tenantId, byUserId: supervisor, targetUserId: colegaId, state: 'Online' });
    await definirStatus({ tenantId: a.tenantId, byUserId: supervisor, targetUserId: colegaId, state: 'Offline' });
    expect(await historico(colegaId)).toEqual([
      { de: 'Offline', para: 'Online', motivo: null },
      { de: 'Online', para: 'Offline', motivo: null },
    ]);
  });

  it('a ação do Desk grava o histórico e a queda por inatividade e o logout registram a origem', async () => {
    const id = await criarUsuario('Atendente do Desk');
    const sessao = await abrirSessao(id);
    const motivoId = await motivoDePausa('Reunião');

    expect(await acaoDesk(sessao, 'definirStatus', { state: 'Online' })).toMatchObject({ ok: true });
    expect(await acaoDesk(sessao, 'definirStatus', { state: 'Online' })).toMatchObject({ ok: true });
    expect(await acaoDesk(sessao, 'definirStatus', { state: 'Pause', motivoId })).toMatchObject({ ok: true });
    expect(await acaoDesk(sessao, 'definirStatus', { state: 'Pause' })).toMatchObject({ ok: false });
    expect(await acaoDesk(sessao, 'definirStatus', { state: 'Invisible' })).toMatchObject({ ok: true });
    expect(await acaoDesk(sessao, 'definirStatus', { state: 'Online' })).toMatchObject({ ok: true });

    // Queda por inatividade: Online -> Offline uma vez; repetir já Offline não grava.
    expect(await acaoDesk(sessao, 'cairPorInatividade')).toMatchObject({ ok: true });
    expect(await acaoDesk(sessao, 'cairPorInatividade')).toMatchObject({ ok: true });

    // O logout deixa o atendente Offline e registra a origem.
    expect(await acaoDesk(sessao, 'definirStatus', { state: 'Online' })).toMatchObject({ ok: true });
    const sair = await fetch(`${api.url}/v1/auth/sair`, { method: 'POST', headers: { cookie: `${NOME_DO_COOKIE}=${sessao}` } });
    expect(sair.status).toBe(204);

    expect(await historico(id)).toEqual([
      { de: 'Offline', para: 'Online', motivo: null },
      { de: 'Online', para: 'Pause', motivo: 'Reunião' },
      { de: 'Pause', para: 'Invisible', motivo: null },
      { de: 'Invisible', para: 'Online', motivo: null },
      { de: 'Online', para: 'Offline', motivo: 'inatividade' },
      { de: 'Offline', para: 'Online', motivo: null },
      { de: 'Online', para: 'Offline', motivo: 'logout' },
    ]);
  });

  it('o histórico é consultável por usuário e período', async () => {
    const { rows } = await a.dono.execute<{ n: string }>(sql`
      select count(*)::text as n from status_atendente_historico
       where tenant_id = ${a.tenantId}::uuid and usuario_id = ${a.agentId}::uuid
         and em >= now() - interval '1 hour' and em <= now()
    `);
    expect(Number(rows[0]!.n)).toBe(3);
  });
});
