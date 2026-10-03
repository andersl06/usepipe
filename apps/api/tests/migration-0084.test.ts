import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { montarCenario } = await import('./ajuda.js');
type Cenario = Awaited<ReturnType<typeof montarCenario>>;
let c: Cenario;
// Valores aposentados, montados por join só para semear linhas legadas.
const LEGADO = ['com', 'bot'].join('_');
const NA_FILA = ['na', 'fila'].join('_');
const TODOS = [LEGADO, NA_FILA, ['atribui', 'da'].join(''), ['em', 'atendimento'].join('_'),
  ['em', 'espera'].join('_'), ['encerra', 'da'].join(''),
  'Waiting', 'Assigned', 'Open', 'ClosedAttendant', 'ClosedClient', 'ClosedClientInactivity', 'Transferred'];

const ROLLBACK = new Error('rollback-da-migration-0084');

beforeAll(async () => {
  c = await montarCenario(`mig84-${randomUUID().slice(0, 8)}`);
}, 180_000);
afterAll(async () => { await c?.encerrar(); });

describe('migration 0084: conversas legadas do bot', () => {
  it('destaca o talk do bot para a execução (inclusive com fila legada) e preserva tickets reais', async () => {
    const arquivo = new URL('../../../packages/db/drizzle/0084_conversa_estado_sem_com_bot.sql', import.meta.url);
    // O CHECK recriado ao final validaria a tabela inteira com o vocabulário antigo; fica de fora.
    const passos = readFileSync(arquivo, 'utf8').split('--> statement-breakpoint').filter((p) => p.trim() && !p.includes('conversa_estado_ck'));
    const t = c.tenantId;

    await expect(
      c.dono.transaction(async (tx) => {
        const um = async <T>(q: ReturnType<typeof sql>) => (await tx.execute<T & Record<string, unknown>>(q)).rows[0] as T;
        const versao = await um<{ id: string }>(sql`insert into fluxo_versao (tenant_id, fluxo_id, versao, estado) values (${t}, ${c.flowId}, 9, 'publicada') returning id`);
        const contato = async (n: string) => (await um<{ id: string }>(sql`insert into contato (tenant_id, nome) values (${t}, ${n}) returning id`)).id;

        await tx.execute(sql`alter table conversa drop constraint conversa_estado_ck`);
        await tx.execute(sql`alter table conversa drop constraint if exists conversa_standby_ck`);
        await tx.execute(sql.raw(`alter table conversa add constraint conversa_estado_ck check (estado in (${TODOS.map((x) => `'${x}'`).join(',')}))`));

        const conversa = async (estado: string, fila: string | null) => (await um<{ id: string }>(sql`insert into conversa (tenant_id, inbox_id, contato_id, fila_id, estado) values (${t}, ${c.inboxId}, ${await contato(`m84-${randomUUID().slice(0, 6)}`)}, ${fila}, ${estado}) returning id`)).id;
        const comExecucao = async (id: string) => {
          const ctt = (await um<{ contato_id: string }>(sql`select contato_id from conversa where id = ${id}`)).contato_id;
          const exec = (await um<{ id: string }>(sql`insert into execucao_fluxo (tenant_id, fluxo_versao_id, conversa_id, contato_id, estado) values (${t}, ${versao.id}, ${id}, ${ctt}, 'aguardando') returning id`)).id;
          const msg = (await um<{ id: string }>(sql`insert into mensagem (tenant_id, conversa_id, direcao, autor_tipo, tipo, conteudo) values (${t}, ${id}, 'entrada', 'contato', 'texto', 'oi') returning id`)).id;
          return { exec, msg };
        };

        const soBot = await conversa(LEGADO, null);
        const a = await comExecucao(soBot);
        const botFila = await conversa(LEGADO, c.queueId);
        const b = await comExecucao(botFila);
        const botSemExec = await conversa(LEGADO, null);
        const real = await conversa(NA_FILA, c.queueId);
        await tx.execute(sql`insert into evento_atendimento (tenant_id, conversa_id, tipo) values (${t}, ${real}, 'criada')`);
        await comExecucao(real);

        for (const passo of passos) await tx.execute(sql.raw(passo));

        const existe = async (id: string) => (await tx.execute(sql`select estado from conversa where id = ${id}`)).rows as { estado: string }[];
        for (const [conv, x] of [[soBot, a], [botFila, b]] as const) {
          expect(await existe(conv)).toHaveLength(0);
          expect(await um(sql`select conversa_id, inbox_id from execucao_fluxo where id = ${x.exec}`)).toEqual({ conversa_id: null, inbox_id: c.inboxId });
          expect(await um(sql`select conversa_id, execucao_id from mensagem where id = ${x.msg}`)).toEqual({ conversa_id: null, execucao_id: x.exec });
        }
        expect(await existe(botSemExec)).toEqual([{ estado: NA_FILA }]);
        expect(await existe(real)).toEqual([{ estado: NA_FILA }]);

        throw ROLLBACK;
      }),
    ).rejects.toBe(ROLLBACK);

    const { rows } = await c.dono.execute<{ def: string }>(sql`select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'conversa_estado_ck'`);
    expect(rows[0]?.def).toContain('ClosedClientInactivity');
  });
});
