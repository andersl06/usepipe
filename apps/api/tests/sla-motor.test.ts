import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// The mode must be decided before any import that reads the variable, as
// nos outros testes de webhook/fila.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { montarCenario } = await import('./ajuda.js');
const { checkSlaOfConversationchecarSlaOfConversationcheckSlaOfConversation, rulesWinningByTarget } = await import(
  '../src/domain/management/sla-motor.js'
);
const { sortQueueOfWaitordenarQueueOfWaitsortQueueOfWait } = await import('../src/domain/management/monitoring.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

/**
 * The SLA clock (`dominio/gestao/sla-motor.ts`), called DIRECTLY — without going through the BullMQ queue. `PIPE_FILAS=memoria` already makes `enfileirarChecagemSla` a no-op (the same rule as media and the CRM mirror), so proving the real clock means calling `checarSlaDaConversa` directly, exactly what the queue consumer does in production. The fixtures use raw SQL against `cenario.dono` (bypassing RLS, since it is seed data) — the same pattern as `entrada-telefone.test.ts` and `midia-recebida.test.ts`.
 */

let a: Cenario;
let b: Cenario;

beforeAll(async () => {
  a = await montarCenario(`sla-a-${randomUUID().slice(0, 8)}`);
  b = await montarCenario(`sla-b-${randomUUID().slice(0, 8)}`);
}, 180_000);

afterAll(async () => {
  await a?.encerrar();
  await b?.encerrar();
});

async function createContact(cenario: Cenario, nome = 'Cliente'): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome) values (${cenario.tenantId}::uuid, ${nome}) returning id
  `);
  return rows[0]!.id;
}

async function createConversation(
  cenario: Cenario,
  opts: {
    priority?: string;
    criadaEm: Date;
    assignedAt?: Date | null;
    firstResponseAt?: Date | null;
    closedAt?: Date | null;
  },
): Promise<string> {
  const contactId = await createContact(cenario);
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into conversa (
      tenant_id, inbox_id, contato_id, fila_id, estado, prioridade,
      criada_em, atribuida_em, primeira_resposta_em, encerrada_em
    ) values (
      ${cenario.tenantId}::uuid, ${cenario.inboxId}::uuid, ${contactId}::uuid, ${cenario.queueId}::uuid,
      ${opts.closedAt ? 'encerrada' : 'atribuida'}, ${opts.priority ?? 'sem_prioridade'},
      ${opts.criadaEm}, ${opts.assignedAt ?? null}, ${opts.firstResponseAt ?? null}, ${opts.closedAt ?? null}
    )
    returning id
  `);
  return rows[0]!.id;
}

async function createRuleSla(
  cenario: Cenario,
  opts: {
    target: string;
    deadlineSeg: number;
    alertSeg?: number | null;
    acaoAlert?: Record<string, unknown>;
    acaoEstouro?: Record<string, unknown>;
  },
): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into regra_sla (tenant_id, nome, alvo, prazo_seg, alerta_seg, acao_alerta, acao_estouro)
    values (
      ${cenario.tenantId}::uuid, ${`regra ${randomUUID().slice(0, 8)}`}, ${opts.target},
      ${opts.deadlineSeg}, ${opts.alertSeg ?? null},
      ${JSON.stringify(opts.acaoAlert ?? {})}::jsonb, ${JSON.stringify(opts.acaoEstouro ?? {})}::jsonb
    )
    returning id
  `);
  return rows[0]!.id;
}

async function createWebhook(cenario: Cenario, eventos: string[]): Promise<void> {
  // A Postgres array literal built by hand — the same trick as `ajuda.ts`
  // (`criarChave`, `escopos` column): passing a raw JS array straight into raw `sql` does not turn into
  // `{a,b}` turns into a bare text parameter and Postgres rejects it.
  await cenario.dono.execute(sql`
    insert into webhook_saida (tenant_id, url, eventos, segredo)
    values (
      ${cenario.tenantId}::uuid, 'https://exemplo.teste/webhook',
      ${`{${eventos.join(',')}}`}::text[], 'segredo-de-teste'
    )
  `);
}

async function slaConversationOf(
  cenario: Cenario,
  conversationId: string,
): Promise<{ state: string; alertedAt: Date | null; exceededAt: Date | null } | null> {
  const { rows } = await cenario.dono.execute<{
    state: string;
    alertado_em: Date | null;
    estourado_em: Date | null;
  }>(sql`select estado, alertado_em, estourado_em from sla_conversa where conversa_id = ${conversationId}::uuid`);
  const r = rows[0];
  return r ? { state: r.state, alertadoEm: r.alertado_em, estouradoEm: r.estourado_em } : null;
}

async function contarEventos(cenario: Cenario, conversaId: string, tipo: string): Promise<number> {
  const { rows } = await cenario.dono.execute<{ n: number }>(sql`
    select count(*)::int as n from evento_atendimento where conversa_id = ${conversaId}::uuid and tipo = ${tipo}
  `);
  return rows[0]!.n;
}

async function contarEntregas(cenario: Cenario, evento: string): Promise<number> {
  const { rows } = await cenario.dono.execute<{ n: number }>(sql`
    select count(*)::int as n from entrega_webhook where tenant_id = ${cenario.tenantId}::uuid and evento = ${evento}
  `);
  return rows[0]!.n;
}

async function priorityOf(cenario: Cenario, conversaId: string): Promise<string> {
  const { rows } = await cenario.dono.execute<{ priority: string }>(
    sql`select prioridade from conversa where id = ${conversaId}::uuid`,
  );
  return rows[0]!.priority;
}

describe('Choose the most specific SLA rule for each target', () => {
  it('Prefer queue-scoped SLA rules over tenant-scoped rules for the same target', () => {
    const ofQueue = {
      id: 'r-fila',
      nome: 'da fila',
      alvo: 'primeira_resposta' as const,
      prazoSeg: 60,
      alertaSeg: null,
      escopoTipo: 'fila',
      escopoId: 'fila-1',
      acaoAlerta: {},
      acaoEstouro: {},
    };
    const doTenant = { ...ofQueue, id: 'r-tenant', nome: 'do tenant', escopoTipo: 'tenant', escopoId: null };
    expect(rulesWinningByTarget([doTenant, ofQueue], 'fila-1')).toEqual([ofQueue]);
    // Outside the queue the specific rule targeted: only the tenant's rule applies.
    expect(rulesWinningByTarget([doTenant, ofQueue], 'fila-2')).toEqual([doTenant]);
  });

  it('Track separate winning SLA rules for different targets (`sla_conversa`)', () => {
    const firstResponse = {
      id: 'r1',
      nome: '1a resposta',
      alvo: 'primeira_resposta' as const,
      prazoSeg: 60,
      alertaSeg: null,
      escopoTipo: 'tenant',
      escopoId: null,
      acaoAlerta: {},
      acaoEstouro: {},
    };
    const resolution = { ...firstResponse, id: 'r2', nome: 'resolução', alvo: 'encerramento' as const };
    expect(rulesWinningByTarget([firstResponse, resolution], null)).toEqual([
      firstResponse,
      resolution,
    ]);
  });
});

describe('Check conversation SLA alerts and breaches', () => {
  // Each test registers its OWN rule(s). Without this, the second rule
  // for a target already used by an earlier test (same `tenant` scope) would tie
  // with the first one, and `regrasVencedorasPorAlvo` would pick between them by
  // alphabetical name order — not necessarily the one THIS test just created.
  beforeEach(async () => {
    await a.dono.execute(sql`delete from regra_sla where tenant_id = ${a.tenantId}::uuid`);
  });

  it('alerta no limiar certo, estourado no prazo certo, e idempotente nos dois', async () => {
    await createRuleSla(a, { target: 'primeira_resposta', prazoSeg: 600, alertaSeg: 300 });
    const agora0 = new Date();
    const criadaEm = new Date(agora0.getTime() - 400_000); // 400s atrás: já passou do alerta (300s), não do prazo (600s)
    const conversationId = await createConversation(a, { criadaEm, assignedAt: criadaEm });

    await checkSlaOfConversationchecarSlaOfConversationcheckSlaOfConversation(a.tenantId, conversationId, agora0);
    let linha = await slaConversationOf(a, conversationId);
    expect(linha?.state).toBe('alertado');
    expect(linha?.alertadoEm).not.toBeNull();
    expect(linha?.estouradoEm).toBeNull();
    expect(await contarEventos(a, conversationId, 'sla_alertado')).toBe(1);

    // Idempotency: running it again at the SAME instant does not duplicate the event or change the timestamp.
    const alertadoEmAntes = linha!.alertedAt;
    await checkSlaOfConversationchecarSlaOfConversationcheckSlaOfConversation(a.tenantId, conversationId, agora0);
    linha = await slaConversationOf(a, conversationId);
    expect(linha?.alertadoEm).toEqual(alertadoEmAntes);
    expect(await contarEventos(a, conversationId, 'sla_alertado')).toBe(1);

    // O tempo passa e o prazo estoura (400s + 300s = 700s > 600s do prazo).
    const agora1 = new Date(agora0.getTime() + 300_000);
    await checkSlaOfConversationchecarSlaOfConversationcheckSlaOfConversation(a.tenantId, conversationId, agora1);
    linha = await slaConversationOf(a, conversationId);
    expect(linha?.state).toBe('estourado');
    expect(linha?.estouradoEm).not.toBeNull();
    expect(await contarEventos(a, conversationId, 'sla_estourado')).toBe(1);

    // Idempotency of the breach: running it again neither duplicates nor regresses the state.
    const estouradoEmAntes = linha!.exceededAt;
    await checkSlaOfConversationchecarSlaOfConversationcheckSlaOfConversation(a.tenantId, conversationId, new Date(agora1.getTime() + 60_000));
    linha = await slaConversationOf(a, conversationId);
    expect(linha?.state).toBe('estourado');
    expect(linha?.estouradoEm).toEqual(estouradoEmAntes);
    expect(await contarEventos(a, conversationId, 'sla_estourado')).toBe(1);
  });

  it('Send no SLA alert or breach for a conversation closed before either deadline', async () => {
    await createRuleSla(a, { target: 'primeira_resposta', prazoSeg: 600, alertaSeg: 300 });
    const agora = new Date();
    const criadaEm = new Date(agora.getTime() - 100_000);
    // Encerrou 50s depois de criada — MUITO antes do alerta (300s) e do prazo (600s).
    const encerradaEm = new Date(criadaEm.getTime() + 50_000);
    const conversaId = await createConversation(a, { criadaEm, assignedAt: criadaEm, encerradaEm });

    await checkSlaOfConversationchecarSlaOfConversationcheckSlaOfConversation(a.tenantId, conversaId, agora);

    expect(await contarEventos(a, conversaId, 'sla_alertado')).toBe(0);
    expect(await contarEventos(a, conversaId, 'sla_estourado')).toBe(0);
    const linha = await slaConversationOf(a, conversaId);
    // Closed without being met (never had a first response) and without breaching: canceled, not
    // left "running" forever — a Pipe decision made in `sla-motor.ts`.
    expect(linha?.state).toBe('cancelado');
  });

  it('a ação notificar_supervisor emite o webhook UMA vez só, mesmo reavaliando', async () => {
    await createWebhook(a, ['sla.alertou']);
    await createRuleSla(a, {
      target: 'primeira_resposta',
      prazoSeg: 600,
      alertaSeg: 100,
      acaoAlerta: { tipo: 'notificar_supervisor' },
    });
    const agora = new Date();
    const criadaEm = new Date(agora.getTime() - 200_000); // já passou do alerta (100s)
    const conversaId = await createConversation(a, { criadaEm, assignedAt: criadaEm });

    await checkSlaOfConversationchecarSlaOfConversationcheckSlaOfConversation(a.tenantId, conversaId, agora);
    await checkSlaOfConversationchecarSlaOfConversationcheckSlaOfConversation(a.tenantId, conversaId, new Date(agora.getTime() + 5_000));
    await checkSlaOfConversationchecarSlaOfConversationcheckSlaOfConversation(a.tenantId, conversaId, new Date(agora.getTime() + 10_000));

    expect(await contarEntregas(a, 'sla.alertou')).toBe(1);
  });

  it('Raise priority one step and reorder the waiting queue after an SLA breach (`elevar_prioridade`)', async () => {
    // `resolucao` is the target's name IN THE DATABASE (`ALVOS_SLA`); `sla.ts` translates it to the
    // alvo `encerramento` do `@pipe/core` (`ALVO_DO_BANCO`).
    await createRuleSla(a, {
      target: 'resolucao',
      prazoSeg: 60,
      alertaSeg: null,
      acaoEstouro: { tipo: 'elevar_prioridade' },
    });
    const agora = new Date();
    // A: older, `baixa` priority, resolution deadline already breached (created 100s ago, deadline is 60s).
    const criadaA = new Date(agora.getTime() - 100_000);
    const conversationA = await createConversation(a, { criadaEm: criadaA, priority: 'baixa' });
    // B: newer, `media` priority — with no SLA rule breaching for it.
    const criadaB = new Date(agora.getTime() - 10_000);
    const conversationB = await createConversation(a, { criadaEm: criadaB, priority: 'media' });

    const linhaAntes = [
      { id: conversationA, prioridade: 'baixa', marcos: { criadaEm: criadaA } },
      { id: conversationB, prioridade: 'media', marcos: { criadaEm: criadaB } },
    ];
    // Antes: `media` (B) vence `baixa` (A) — B primeiro.
    expect(sortQueueOfWaitordenarQueueOfWaitsortQueueOfWait(linhaAntes).map((l) => l.id)).toEqual([conversationB, conversationA]);

    await checkSlaOfConversationchecarSlaOfConversationcheckSlaOfConversation(a.tenantId, conversationA, agora);

    expect(await priorityOf(a, conversationA)).toBe('media');
    const linhaDepois = [
      { id: conversationA, prioridade: await priorityOf(a, conversationA), marcos: { criadaEm: criadaA } },
      { id: conversationB, prioridade: await priorityOf(a, conversationB), marcos: { criadaEm: criadaB } },
    ];
    // Afterwards: A and B tie at `media`; the tiebreaker is the OLDER one — A wins now.
    expect(sortQueueOfWaitordenarQueueOfWaitsortQueueOfWait(linhaDepois).map((l) => l.id)).toEqual([conversationA, conversationB]);
  });
});

describe('Isolate conversation SLA checks by tenant', () => {
  it('Never apply one tenant\'s SLA rule to another tenant\'s conversation', async () => {
    // A new tenant, with NO rule of its own — `a` has already accumulated rules from the tests
    // above in this file, and reusing it here would prove less than "no rule registered".
    const semRegra = await montarCenario(`sla-sem-regra-${randomUUID().slice(0, 8)}`);
    try {
      // A rule registered ONLY in tenant B.
      await createRuleSla(b, { target: 'primeira_resposta', prazoSeg: 10, alertaSeg: 5 });

      const agora = new Date();
      // It would easily breach IF B's rule applied to this tenant.
      const criadaEm = new Date(agora.getTime() - 100_000);
      const conversationWithoutRule = await createConversation(semRegra, { criadaEm, assignedAt: criadaEm });

      await checkSlaOfConversationchecarSlaOfConversationcheckSlaOfConversation(semRegra.tenantId, conversationWithoutRule, agora);

      // With no rule registered in THIS tenant: nothing changes, no row in `sla_conversa`.
      expect(await slaConversationOf(semRegra, conversationWithoutRule)).toBeNull();
      expect(await contarEventos(semRegra, conversationWithoutRule, 'sla_alertado')).toBe(0);
      expect(await contarEventos(semRegra, conversationWithoutRule, 'sla_estourado')).toBe(0);
    } finally {
      await semRegra.encerrar();
    }
  });
});
