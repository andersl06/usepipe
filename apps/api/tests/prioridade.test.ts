import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { avaliarPriority, ordenarRulesOfPriority } = await import(
  '../src/dominio/gestao/prioridade-motor.js'
);
const { upApi } = await import('../src/servidor.js');
const { assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;
type RegraDeMotor = Parameters<typeof avaliarPriority>[0][number];

/**
 * O motor de `regra_prioridade` (`dominio/gestao/prioridade-motor.ts`) — item 2
 * da tarefa de "fazer funcionar o que só está cadastrado". `regras-prioridade.ts`
 * já tinha o CRUD; até este arquivo, nada LIA a tabela para decidir a
 * prioridade de uma conversa de verdade.
 *
 * Duas camadas de teste:
 *  1. `avaliarPrioridade`/`ordenarRegrasDePrioridade` direto, sem banco — a regra
 *     de "primeira que casa vence" é pura, e é mais rápido provar aqui.
 *  2. Um webhook de verdade (`falar`, o mesmo padrão de `entrada-telefone.test.ts`)
 *     provando que `dominio/entrada.ts` liga o motor quando a conversa entra na
 *     fila.
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

describe('avaliarPrioridade — primeira que casa vence (sem banco)', () => {
  it('escopo de fila vence o de tenant, mesmo cadastrado depois', () => {
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
      // Cadastrada DEPOIS da regra do tenant — decisão Pipe: escopo específico
      // vence por ser mais específico, não por ter sido cadastrado antes.
      criadoEm: new Date('2026-02-01T00:00:00Z'),
    });
    expect(avaliarPriority([doTenant, ofQueue], { queueId: 'fila-vip' })).toBe('alta');
    // Fora da fila-vip, só a regra do tenant se aplica.
    expect(avaliarPriority([doTenant, ofQueue], { queueId: 'outra-fila' })).toBe('baixa');
  });

  it('dentro do MESMO escopo, a regra mais antiga vence', () => {
    const antiga = regra({ id: 'antiga', nivel: 'media', criadoEm: new Date('2026-01-01T00:00:00Z') });
    const nova = regra({ id: 'nova', nivel: 'alta', criadoEm: new Date('2026-06-01T00:00:00Z') });
    // Ordem de entrada não importa — só a data de criação.
    expect(ordenarRulesOfPriority([nova, antiga]).map((r) => r.id)).toEqual(['antiga', 'nova']);
    expect(avaliarPriority([nova, antiga], {})).toBe('media');
  });

  it('condição vazia sempre casa — decisão Pipe: escopo já filtra, condição é refinamento opcional', () => {
    const withoutCondition = regra({ id: 'sem-condicao', nivel: 'maxima', condition: {} });
    expect(avaliarPriority([withoutCondition], { queueId: null, message: 'qualquer coisa' })).toBe(
      'maxima',
    );
  });

  it('condição com campo/operador só casa quando a expressão bate', () => {
    const urgente = regra({
      id: 'urgente',
      nivel: 'maxima',
      condition: { campo: 'mensagem', operador: 'contem', valor: 'urgente' },
    });
    expect(avaliarPriority([urgente], { message: 'isso é urgente, por favor' })).toBe('maxima');
    expect(avaliarPriority([urgente], { message: 'mensagem qualquer' })).toBeNull();
  });

  it('sem nenhuma regra casando, devolve null — não muda o padrão sem_prioridade', () => {
    const doTenant = regra({
      id: 'r1',
      nivel: 'alta',
      condition: { campo: 'mensagem', operador: 'contem', valor: 'urgente' },
    });
    expect(avaliarPriority([doTenant], { message: 'oi, tudo bem?' })).toBeNull();
  });
});

describe('a entrada liga o motor quando a conversa entra na fila', () => {
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
    nivel: string;
    condition?: Record<string, unknown>;
  }): Promise<void> {
    await cenario.dono.execute(sql`
      insert into regra_prioridade (tenant_id, nome, nivel, condicao)
      values (
        ${cenario.tenantId}::uuid, ${`regra ${randomUUID().slice(0, 8)}`}, ${opts.nivel},
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

  it('regra que casa define a prioridade da conversa nova', async () => {
    await createRule({
      nivel: 'maxima',
      condition: { campo: 'mensagem', operador: 'contem', valor: 'urgente' },
    });
    await falar('5521987650001', 'preciso de ajuda urgente com meu pedido');
    expect(await priorityOfPhone('+5521987650001')).toBe('maxima');
  });

  it('regra cadastrada mas que NÃO casa mantém sem_prioridade', async () => {
    await falar('5521987650002', 'só queria tirar uma dúvida tranquila');
    expect(await priorityOfPhone('+5521987650002')).toBe('sem_prioridade');
  });

  it('isolamento entre tenants: regra de um tenant não pega conversa de outro', async () => {
    const outro = await montarCenario(`prioridade-outro-${randomUUID().slice(0, 8)}`);
    try {
      // Regra SÓ no tenant `outro`, casando em qualquer mensagem (condição vazia).
      await outro.dono.execute(sql`
        insert into regra_prioridade (tenant_id, nome, nivel, condicao)
        values (${outro.tenantId}::uuid, 'regra do outro tenant', 'maxima', '{}'::jsonb)
      `);

      // Mensagem chega no tenant principal, que não tem regra nenhuma cadastrada.
      await falar('5521987650003', 'mensagem qualquer');
      expect(await priorityOfPhone('+5521987650003')).toBe('sem_prioridade');
    } finally {
      await outro.encerrar();
    }
  });
});
