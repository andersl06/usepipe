import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// The mode must be decided before any import that reads the variable.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { evaluatePriority, sortRulesOfPriority } = await import(
  '../src/domain/management/priority-engine.js'
);
const { upApi } = await import('../src/servidor.js');
const { assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;
type RegraDeMotor = Parameters<typeof evaluatePriority>[0][number];

/**
 * The `regra_prioridade` engine (`dominio/gestao/prioridade-motor.ts`) — item 2 of the "make what is only registered actually work" task. `regras-prioridade.ts` already had the CRUD; until this file, nothing READ the table to decide an actual conversation's priority. Two layers of tests: 1. `avaliarPrioridade`/`ordenarRegrasDePrioridade` directly, without a database — the "first match wins" rule is pure, and proving it here is faster. 2. A real webhook (`falar`, the same pattern as `entrada-telefone.test.ts`) proving that `dominio/entrada.ts` wires up the engine when a conversation enters the queue.
 */

function regra(parcial: Partial<RegraDeMotor> & Pick<RegraDeMotor, 'id' | 'nivel'>): RegraDeMotor {
  return {
    scopeType: 'tenant',
    scopeId: null,
    condition: {},
    criadoEm: new Date('2026-01-01T00:00:00Z'),
    ...parcial,
  };
}

describe('Choose the first matching priority rule', () => {
  it('Prefer queue-scoped priority rules over tenant-scoped rules regardless of creation order', () => {
    const doTenant = regra({
      id: 'r-tenant',
      nivel: 'baixa',
      criadoEm: new Date('2026-01-01T00:00:00Z'),
    });
    const ofQueue = regra({
      id: 'r-fila',
      nivel: 'alta',
      scopeType: 'fila',
      scopeId: 'fila-vip',
      // Registered AFTER the tenant's rule — Pipe's decision: a more specific scope
      // wins for being more specific, not for having been registered earlier.
      criadoEm: new Date('2026-02-01T00:00:00Z'),
    });
    expect(evaluatePriority([doTenant, ofQueue], { queueId: 'fila-vip' })).toBe('alta');
    // Outside the fila-vip, only the tenant's rule applies.
    expect(evaluatePriority([doTenant, ofQueue], { queueId: 'outra-fila' })).toBe('baixa');
  });

  it('Prefer the oldest matching rule within the same scope', () => {
    const antiga = regra({ id: 'antiga', nivel: 'media', criadoEm: new Date('2026-01-01T00:00:00Z') });
    const nova = regra({ id: 'nova', nivel: 'alta', criadoEm: new Date('2026-06-01T00:00:00Z') });
    // Arrival order does not matter — only the creation date.
    expect(sortRulesOfPriority([nova, antiga]).map((r) => r.id)).toEqual(['antiga', 'nova']);
    expect(evaluatePriority([nova, antiga], {})).toBe('media');
  });

  it('Match an empty priority condition because scope already filters the rule', () => {
    const withoutCondition = regra({ id: 'sem-condicao', nivel: 'maxima', condition: {} });
    expect(evaluatePriority([withoutCondition], { queueId: null, message: 'qualquer coisa' })).toBe(
      'maxima',
    );
  });

  it('Match a priority condition only when its field and operator expression holds', () => {
    const urgente = regra({
      id: 'urgente',
      nivel: 'maxima',
      condition: { campo: 'mensagem', operador: 'contem', valor: 'urgente' },
    });
    expect(evaluatePriority([urgente], { message: 'isso é urgente, por favor' })).toBe('maxima');
    expect(evaluatePriority([urgente], { message: 'mensagem qualquer' })).toBeNull();
  });

  it('Return null when no priority rule matches (`sem_prioridade`)', () => {
    const doTenant = regra({
      id: 'r1',
      nivel: 'alta',
      condition: { campo: 'mensagem', operador: 'contem', valor: 'urgente' },
    });
    expect(evaluatePriority([doTenant], { message: 'oi, tudo bem?' })).toBeNull();
  });
});

describe('Evaluate priority when a conversation enters a queue', () => {
  let cenario: Cenario;
  let api: ApiNoAr;

  beforeAll(async () => {
    cenario = await montarCenario(`prioridade-${randomUUID().slice(0, 8)}`);
    api = await upApi(0);
  }, 180_000);

  afterAll(async () => {
    await api?.fechar();
    await cenario?.encerrar();
  });

  async function createRule(opts: {
    level: string;
    condition?: Record<string, unknown>;
  }): Promise<void> {
    await cenario.dono.execute(sql`
      insert into regra_prioridade (tenant_id, nome, nivel, condicao)
      values (
        ${cenario.tenantId}::uuid, ${`regra ${randomUUID().slice(0, 8)}`}, ${opts.level},
        ${JSON.stringify(opts.condition ?? {})}::jsonb
      )
    `);
  }

  async function falar(de: string, texto: string): Promise<void> {
    const corpo = JSON.stringify(payloadOfMessage(de, texto));
    const resposta = await fetch(`${api.url}/webhooks/whatsapp/${cenario.channelId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
      body: corpo,
    });
    expect(resposta.status).toBe(200);
  }

  async function priorityOfPhone(telefone: string): Promise<string> {
    const { rows } = await cenario.dono.execute<{ priority: string }>(sql`
      select c.prioridade
        from conversa c
        join contato ct on ct.id = c.contato_id
       where ct.telefone_e164 = ${telefone}
       order by c.criada_em desc
       limit 1
    `);
    return rows[0]!.priority;
  }

  it('Set a new conversation\'s priority from a matching rule', async () => {
    await createRule({
      level: 'maxima',
      condition: { campo: 'mensagem', operador: 'contem', valor: 'urgente' },
    });
    await falar('5521987650001', 'preciso de ajuda urgente com meu pedido');
    expect(await priorityOfPhone('+5521987650001')).toBe('maxima');
  });

  it('Keep no priority when a registered rule does not match (`sem_prioridade`)', async () => {
    await falar('5521987650002', 'só queria tirar uma dúvida tranquila');
    expect(await priorityOfPhone('+5521987650002')).toBe('sem_prioridade');
  });

  it('Never apply one tenant\'s priority rule to another tenant\'s conversation', async () => {
    const outro = await montarCenario(`prioridade-outro-${randomUUID().slice(0, 8)}`);
    try {
      // A rule that exists ONLY in the `outro` tenant, matching any message (empty condition).
      await outro.dono.execute(sql`
        insert into regra_prioridade (tenant_id, nome, nivel, condicao)
        values (${outro.tenantId}::uuid, 'regra do outro tenant', 'maxima', '{}'::jsonb)
      `);

      // The message arrives at the main tenant, which has no rule registered at all.
      await falar('5521987650003', 'mensagem qualquer');
      expect(await priorityOfPhone('+5521987650003')).toBe('sem_prioridade');
    } finally {
      await outro.encerrar();
    }
  });
});
