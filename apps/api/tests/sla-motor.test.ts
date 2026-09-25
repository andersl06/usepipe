import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

// O modo tem que ser decidido antes de qualquer import que leia a variável, como
// nos outros testes de webhook/fila.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';

const { montarCenario } = await import('./ajuda.js');
const { checarSlaOfConversation, rulesWinningByTarget } = await import(
  '../src/domain/management/sla-motor.js'
);
const { ordenarQueueOfWait } = await import('../src/domain/management/monitoring.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

/**
 * O relógio de SLA (`dominio/gestao/sla-motor.ts`), chamado DIRETO — sem passar
 * pela fila BullMQ. `PIPE_FILAS=memoria` já faz `enfileirarChecagemSla` não fazer
 * nada (mesma regra da mídia e do espelho no CRM), então provar o relógio de
 * verdade é chamar `checarSlaDaConversa` direto, exatamente o que o consumidor
 * da fila faz em produção.
 *
 * Os fixtures usam SQL cru contra `cenario.dono` (bypassa RLS, é semente) — o
 * mesmo padrão de `entrada-telefone.test.ts` e `midia-recebida.test.ts`.
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
      ${opts.encerradaEm ? 'encerrada' : 'atribuida'}, ${opts.prioridade ?? 'sem_prioridade'},
      ${opts.criadaEm}, ${opts.atribuidaEm ?? null}, ${opts.firstResponseAt ?? null}, ${opts.encerradaEm ?? null}
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
      ${cenario.tenantId}::uuid, ${`regra ${randomUUID().slice(0, 8)}`}, ${opts.alvo},
      ${opts.prazoSeg}, ${opts.alertaSeg ?? null},
      ${JSON.stringify(opts.acaoAlerta ?? {})}::jsonb, ${JSON.stringify(opts.acaoEstouro ?? {})}::jsonb
    )
    returning id
  `);
  return rows[0]!.id;
}

async function createWebhook(cenario: Cenario, eventos: string[]): Promise<void> {
  // Literal de array do Postgres construído à mão — o mesmo truque de `ajuda.ts`
  // (`criarChave`, coluna `escopos`): passar um array JS direto no `sql` cru não vira
  // `{a,b}`, vira parâmetro de texto solto e o Postgres recusa.
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
  return r ? { state: r.estado, alertadoEm: r.alertado_em, estouradoEm: r.estourado_em } : null;
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
    // Fora da fila que a regra específica escolheu: só a do tenant se aplica.
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
  // Cada teste cadastra a(s) SUA(S) própria(s) regra(s). Sem isto, a segunda regra
  // de um alvo já usado por um teste anterior (mesmo escopo `tenant`) empataria
  // com a primeira, e `regrasVencedorasPorAlvo` escolheria uma delas por ordem
  // alfabética de nome — não necessariamente a que ESTE teste acabou de criar.
  beforeEach(async () => {
    await a.dono.execute(sql`delete from regra_sla where tenant_id = ${a.tenantId}::uuid`);
  });

  it('alerta no limiar certo, estourado no prazo certo, e idempotente nos dois', async () => {
    await createRuleSla(a, { alvo: 'primeira_resposta', prazoSeg: 600, alertaSeg: 300 });
    const agora0 = new Date();
    const criadaEm = new Date(agora0.getTime() - 400_000); // 400s atrás: já passou do alerta (300s), não do prazo (600s)
    const conversationId = await createConversation(a, { criadaEm, atribuidaEm: criadaEm });

    await checarSlaOfConversation(a.tenantId, conversationId, agora0);
    let linha = await slaConversationOf(a, conversationId);
    expect(linha?.state).toBe('alertado');
    expect(linha?.alertadoEm).not.toBeNull();
    expect(linha?.estouradoEm).toBeNull();
    expect(await contarEventos(a, conversationId, 'sla_alertado')).toBe(1);

    // Idempotência: rodar de novo no MESMO instante não duplica o evento nem muda o carimbo.
    const alertadoEmAntes = linha!.alertadoEm;
    await checarSlaOfConversation(a.tenantId, conversationId, agora0);
    linha = await slaConversationOf(a, conversationId);
    expect(linha?.alertadoEm).toEqual(alertadoEmAntes);
    expect(await contarEventos(a, conversationId, 'sla_alertado')).toBe(1);

    // O tempo passa e o prazo estoura (400s + 300s = 700s > 600s do prazo).
    const agora1 = new Date(agora0.getTime() + 300_000);
    await checarSlaOfConversation(a.tenantId, conversationId, agora1);
    linha = await slaConversationOf(a, conversationId);
    expect(linha?.state).toBe('estourado');
    expect(linha?.estouradoEm).not.toBeNull();
    expect(await contarEventos(a, conversationId, 'sla_estourado')).toBe(1);

    // Idempotência do estouro: rodar de novo não duplica nem regride o estado.
    const estouradoEmAntes = linha!.estouradoEm;
    await checarSlaOfConversation(a.tenantId, conversationId, new Date(agora1.getTime() + 60_000));
    linha = await slaConversationOf(a, conversationId);
    expect(linha?.state).toBe('estourado');
    expect(linha?.estouradoEm).toEqual(estouradoEmAntes);
    expect(await contarEventos(a, conversationId, 'sla_estourado')).toBe(1);
  });

  it('Send no SLA alert or breach for a conversation closed before either deadline', async () => {
    await createRuleSla(a, { alvo: 'primeira_resposta', prazoSeg: 600, alertaSeg: 300 });
    const agora = new Date();
    const criadaEm = new Date(agora.getTime() - 100_000);
    // Encerrou 50s depois de criada — MUITO antes do alerta (300s) e do prazo (600s).
    const encerradaEm = new Date(criadaEm.getTime() + 50_000);
    const conversaId = await createConversation(a, { criadaEm, atribuidaEm: criadaEm, encerradaEm });

    await checarSlaOfConversation(a.tenantId, conversaId, agora);

    expect(await contarEventos(a, conversaId, 'sla_alertado')).toBe(0);
    expect(await contarEventos(a, conversaId, 'sla_estourado')).toBe(0);
    const linha = await slaConversationOf(a, conversaId);
    // Fechou sem cumprir (nunca teve 1ª resposta) e sem estourar: cancelado, não
    // "correndo" para sempre — decisão Pipe em `sla-motor.ts`.
    expect(linha?.state).toBe('cancelado');
  });

  it('a ação notificar_supervisor emite o webhook UMA vez só, mesmo reavaliando', async () => {
    await createWebhook(a, ['sla.alertou']);
    await createRuleSla(a, {
      alvo: 'primeira_resposta',
      prazoSeg: 600,
      alertaSeg: 100,
      acaoAlerta: { tipo: 'notificar_supervisor' },
    });
    const agora = new Date();
    const criadaEm = new Date(agora.getTime() - 200_000); // já passou do alerta (100s)
    const conversaId = await createConversation(a, { criadaEm, atribuidaEm: criadaEm });

    await checarSlaOfConversation(a.tenantId, conversaId, agora);
    await checarSlaOfConversation(a.tenantId, conversaId, new Date(agora.getTime() + 5_000));
    await checarSlaOfConversation(a.tenantId, conversaId, new Date(agora.getTime() + 10_000));

    expect(await contarEntregas(a, 'sla.alertou')).toBe(1);
  });

  it('Raise priority one step and reorder the waiting queue after an SLA breach (`elevar_prioridade`)', async () => {
    // `resolucao` é o nome do alvo NO BANCO (`ALVOS_SLA`); `sla.ts` traduz para o
    // alvo `encerramento` do `@pipe/core` (`ALVO_DO_BANCO`).
    await createRuleSla(a, {
      alvo: 'resolucao',
      prazoSeg: 60,
      alertaSeg: null,
      acaoEstouro: { tipo: 'elevar_prioridade' },
    });
    const agora = new Date();
    // A: mais antiga, prioridade `baixa`, prazo de resolução já estourado (criada há 100s, prazo é 60s).
    const criadaA = new Date(agora.getTime() - 100_000);
    const conversationA = await createConversation(a, { criadaEm: criadaA, prioridade: 'baixa' });
    // B: mais nova, prioridade `media` — sem regra de SLA estourando para ela.
    const criadaB = new Date(agora.getTime() - 10_000);
    const conversationB = await createConversation(a, { criadaEm: criadaB, prioridade: 'media' });

    const linhaAntes = [
      { id: conversationA, prioridade: 'baixa', marcos: { criadaEm: criadaA } },
      { id: conversationB, prioridade: 'media', marcos: { criadaEm: criadaB } },
    ];
    // Antes: `media` (B) vence `baixa` (A) — B primeiro.
    expect(ordenarQueueOfWait(linhaAntes).map((l) => l.id)).toEqual([conversationB, conversationA]);

    await checarSlaOfConversation(a.tenantId, conversationA, agora);

    expect(await priorityOf(a, conversationA)).toBe('media');
    const linhaDepois = [
      { id: conversationA, prioridade: await priorityOf(a, conversationA), marcos: { criadaEm: criadaA } },
      { id: conversationB, prioridade: await priorityOf(a, conversationB), marcos: { criadaEm: criadaB } },
    ];
    // Depois: A e B empatam em `media`; o desempate é pela mais ANTIGA — A vence agora.
    expect(ordenarQueueOfWait(linhaDepois).map((l) => l.id)).toEqual([conversationA, conversationB]);
  });
});

describe('Isolate conversation SLA checks by tenant', () => {
  it('Never apply one tenant\'s SLA rule to another tenant\'s conversation', async () => {
    // Tenant novo, sem NENHUMA regra própria — `a` já acumulou regras dos testes
    // acima neste arquivo, e usá-lo aqui provaria menos que "sem regra cadastrada".
    const semRegra = await montarCenario(`sla-sem-regra-${randomUUID().slice(0, 8)}`);
    try {
      // Regra cadastrada SÓ no tenant B.
      await createRuleSla(b, { alvo: 'primeira_resposta', prazoSeg: 10, alertaSeg: 5 });

      const agora = new Date();
      // Estouraria fácil, SE a regra de B valesse para este tenant.
      const criadaEm = new Date(agora.getTime() - 100_000);
      const conversationWithoutRule = await createConversation(semRegra, { criadaEm, atribuidaEm: criadaEm });

      await checarSlaOfConversation(semRegra.tenantId, conversationWithoutRule, agora);

      // Sem regra cadastrada NESTE tenant: não muda nada, nenhuma linha em `sla_conversa`.
      expect(await slaConversationOf(semRegra, conversationWithoutRule)).toBeNull();
      expect(await contarEventos(semRegra, conversationWithoutRule, 'sla_alertado')).toBe(0);
      expect(await contarEventos(semRegra, conversationWithoutRule, 'sla_estourado')).toBe(0);
    } finally {
      await semRegra.encerrar();
    }
  });
});
