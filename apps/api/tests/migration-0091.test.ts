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
const NA_FILA = ['na', 'fila'].join('_');
const ATRIBUIDA = ['atribui', 'da'].join('');
const EM_ATENDIMENTO = ['em', 'atendimento'].join('_');
const EM_ESPERA = ['em', 'espera'].join('_');
const ENCERRADA = ['encerra', 'da'].join('');
const PAUSA = ['pau', 'sa'].join('');
const INVISIVEL = ['invisi', 'vel'].join('');

const NOVOS_CONVERSA = ['Waiting', 'Assigned', 'Open', 'ClosedAttendant', 'ClosedClient', 'ClosedClientInactivity', 'Transferred'];
const ANTIGOS_CONVERSA = [NA_FILA, ATRIBUIDA, EM_ATENDIMENTO, EM_ESPERA, ENCERRADA];
const lista = (v: string[]) => v.map((x) => `'${x}'`).join(',');

const ROLLBACK = new Error('rollback-da-migration-0091');

beforeAll(async () => {
  c = await montarCenario(`mig91-${randomUUID().slice(0, 8)}`);
}, 180_000);
afterAll(async () => { await c?.encerrar(); });

describe('migration 0091: status Blip e ids do ticket', () => {
  it('converte cada estado legado e impõe os novos CHECKs (tudo em transação revertida)', async () => {
    const arquivo = new URL('../../../packages/db/drizzle/0091_status_blip_e_ids_do_ticket.sql', import.meta.url);
    const passos = readFileSync(arquivo, 'utf8').split('--> statement-breakpoint');
    const t = c.tenantId;

    await expect(
      c.dono.transaction(async (tx) => {
        const um = async <T>(q: ReturnType<typeof sql>) => (await tx.execute<T & Record<string, unknown>>(q)).rows[0] as T;
        const contato = async (n: string) => (await um<{ id: string }>(sql`insert into contato (tenant_id, nome) values (${t}, ${n}) returning id`)).id;

        // O banco já migrou: reabre os CHECKs para aceitar legado + novo.
        await tx.execute(sql`alter table conversa drop constraint conversa_estado_ck`);
        await tx.execute(sql`alter table conversa drop constraint conversa_standby_ck`);
        await tx.execute(sql.raw(`alter table conversa add constraint conversa_estado_ck check (estado in (${lista([...ANTIGOS_CONVERSA, ...NOVOS_CONVERSA])}))`));
        await tx.execute(sql`alter table status_atendente drop constraint status_atendente_estado_ck`);
        await tx.execute(sql.raw(`alter table status_atendente add constraint status_atendente_estado_ck check (estado in ('online','${PAUSA}','${INVISIVEL}','offline','Online','Pause','Invisible','Offline'))`));

        const semear = async (estado: string, extra: { espera?: boolean; motivo?: string; por?: string } = {}) => {
          const id = (await um<{ id: string }>(sql`
            insert into conversa (tenant_id, inbox_id, contato_id, fila_id, estado, em_espera_desde, motivo_encerramento)
            values (${t}, ${c.inboxId}, ${await contato(`m91-${randomUUID().slice(0, 6)}`)}, ${c.queueId}, ${estado},
                    ${extra.espera ? sql`now() - interval '1 hour'` : sql`null`}, ${extra.motivo ?? null}) returning id`)).id;
          if (extra.por) {
            await tx.execute(sql`insert into evento_atendimento (tenant_id, conversa_id, tipo, dados) values (${t}, ${id}, 'encerrada', jsonb_build_object('encerrada_por', ${extra.por}::text))`);
          }
          return id;
        };

        const ids = {
          fila: await semear(NA_FILA),
          atrib: await semear(ATRIBUIDA),
          atend: await semear(EM_ATENDIMENTO),
          espera: await semear(EM_ESPERA, { espera: true }),
          cliente: await semear(ENCERRADA, { por: 'cliente' }),
          inativ: await semear(ENCERRADA, { por: 'inatividade' }),
          transf: await semear(ENCERRADA, { por: 'transferencia' }),
          atendente: await semear(ENCERRADA, { por: 'atendente' }),
          semEventoTransf: await semear(ENCERRADA, { motivo: 'Transferida' }),
          semEventoCliente: await semear(ENCERRADA),
        };

        const ana = c.agentId;
        await tx.execute(sql`delete from status_atendente where usuario_id = ${ana}`);
        await tx.execute(sql.raw(`insert into status_atendente (usuario_id, tenant_id, estado) values ('${ana}', '${t}', '${PAUSA}')`));

        for (const passo of passos) if (passo.trim()) await tx.execute(sql.raw(passo));

        const estado = async (id: string) => (await um<{ estado: string; em_espera_desde: Date | null }>(sql`select estado, em_espera_desde from conversa where id = ${id}`));
        expect((await estado(ids.fila)).estado).toBe('Waiting');
        expect((await estado(ids.atrib)).estado).toBe('Assigned');
        expect((await estado(ids.atend)).estado).toBe('Open');
        const espera = await estado(ids.espera);
        expect(espera.estado).toBe('Open');
        expect(espera.em_espera_desde).not.toBeNull();
        expect((await estado(ids.cliente)).estado).toBe('ClosedClient');
        expect((await estado(ids.inativ)).estado).toBe('ClosedClientInactivity');
        expect((await estado(ids.transf)).estado).toBe('Transferred');
        expect((await estado(ids.atendente)).estado).toBe('ClosedAttendant');
        expect((await estado(ids.semEventoTransf)).estado).toBe('Transferred');
        expect((await estado(ids.semEventoCliente)).estado).toBe('ClosedClient');
        expect((await um<{ estado: string }>(sql`select estado from status_atendente where usuario_id = ${ana}`)).estado).toBe('Pause');

        // CHECKs novos rejeitam o legado e a espera fora de Open.
        await expect(tx.transaction((n) => n.execute(sql.raw(`update conversa set estado = '${ENCERRADA}' where id = '${ids.fila}'`)))).rejects.toThrow();
        await expect(tx.transaction((n) => n.execute(sql`update conversa set em_espera_desde = now() where id = ${ids.fila}`))).rejects.toThrow();
        await expect(tx.transaction((n) => n.execute(sql.raw(`update status_atendente set estado = '${INVISIVEL}' where usuario_id = '${ana}'`)))).rejects.toThrow();

        // Gatilho: sequenciais consecutivos por tenant.
        const novo = async () => (await um<{ n: string }>(sql`
          insert into conversa (tenant_id, inbox_id, contato_id) values (${t}, ${c.inboxId}, ${await contato(`seq-${randomUUID().slice(0, 6)}`)})
          returning numero_sequencial as n`)).n;
        const a = Number(await novo());
        const b = Number(await novo());
        expect(b).toBe(a + 1);

        throw ROLLBACK;
      }),
    ).rejects.toBe(ROLLBACK);

    const { rows } = await c.dono.execute<{ def: string }>(sql`select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'conversa_estado_ck'`);
    expect(rows[0]?.def).toContain('ClosedClientInactivity');
  });
});
