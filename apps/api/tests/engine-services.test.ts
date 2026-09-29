import { describe, expect, it, vi } from 'vitest';
import { DeskUnavailable, matchCommand, type ClosedBy, type CommandRequest, type DeskUnavailableStatus } from '@pipe/core';
import type { TransactionPipe } from '@pipe/db';
import { contactPatch, engineServices, type EngineEffects, type TicketEffects } from '../src/domain/engine-services.js';

/**
 * `engineServices` is the one builder of engine services for production and the Builder's Test
 * panel; these checks run without a database because the ticket routes validate before any query
 * (except `/transfer`'s tenant check, covered by the DB suites).
 */

const tx = {} as TransactionPipe;

/** The queue checks read the schedule and online agents (DB suites); here they answer `closed`. */
const availability = vi.hoisted(() => ({ closed: null as DeskUnavailableStatus | null, queues: [] as (string | null)[] }));
vi.mock('../src/domain/queue-entry.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  queueUnavailability: async (_tx: unknown, _tenantId: string, queueId: string | null, _at: Date, checks: readonly string[]) => {
    availability.queues.push(queueId);
    return availability.closed && checks.includes(availability.closed) ? availability.closed : null;
  },
}));

function withEffects(): { calls: string[]; effects: EngineEffects } {
  const calls: string[] = [];
  const tickets: TicketEffects = {
    get: async () => ({ id: 'c1' }),
    changeTags: async (_tx, tags) => void calls.push(`tags:${tags.join(',')}`),
    transfer: async (_tx, queueId) => void calls.push(`transfer:${queueId}`),
    enqueue: async () => void calls.push('enqueue'),
    close: async (_tx, closedBy: ClosedBy) => void calls.push(`close:${closedBy}`),
    setPriority: async (_tx, priority) => void calls.push(`priority:${priority}`),
  };
  return {
    calls,
    effects: {
      tickets,
      send: async () => {},
      forwardForAttendance: async () => {
        calls.push('forward');
        return { id: 't', status: 'Waiting' };
      },
      queueOfHandoff: async (_tx, queueId) => queueId ?? 'fila-da-regra',
      registerEvent: async () => {},
      saveContact: async (patch) => void calls.push(`contact:${JSON.stringify(patch)}`),
      bucketSet: async () => void calls.push('bucket'),
    },
  };
}

function command(uri: string, resource: unknown): CommandRequest {
  return { uri, method: 'set', resource, command: matchCommand({ uri, method: 'set' })! };
}

function services(effects: EngineEffects) {
  return engineServices({ tenantId: 't1', flowFunctions: new Map(), isolate: (fn) => fn(tx), effects });
}

describe('engineServices', () => {
  it('closes on the customer side by default and accepts inactivity', async () => {
    const { calls, effects } = withEffects();
    const s = services(effects);
    await s.sendCommand!(command('/tickets/x/status', { status: 'encerrada' }));
    await s.sendCommand!(command('/tickets/x/status', { status: 'encerrada', closedBy: 'inatividade' }));
    await expect(s.sendCommand!(command('/tickets/x/status', { status: 'encerrada', closedBy: 'atendente' }))).rejects.toThrow(
      'closedBy',
    );
    expect(calls).toEqual(['close:cliente', 'close:inatividade']);
  });

  it('refuses agent-only states and routes na_fila to a rule-decided entry', async () => {
    const { calls, effects } = withEffects();
    const s = services(effects);
    await expect(s.sendCommand!(command('/tickets/x/status', { status: 'em_atendimento' }))).rejects.toThrow('exige um atendente');
    await s.sendCommand!(command('/tickets/x/status', { status: 'na_fila' }));
    expect(calls).toEqual(['enqueue']);
  });

  it('validates the transfer queue id before any effect', async () => {
    const { calls, effects } = withEffects();
    const s = services(effects);
    await expect(s.sendCommand!(command('/tickets/x/transfer', { queueId: 'fila-vendas' }))).rejects.toThrow('inválido');
    await expect(s.sendCommand!(command('/tickets/x/transfer', {}))).rejects.toThrow("exige 'queueId'");
    expect(calls).toEqual([]);
  });

  it('answers processCommand with the Pipe result and validates priority levels', async () => {
    const { calls, effects } = withEffects();
    const s = services(effects);
    expect(await s.processCommand!(command('/tickets/x/priority', { priority: 'alta' }))).toEqual({
      status: 'success',
      reason: 'OK',
      resource: { priority: 'alta' },
    });
    await expect(s.processCommand!(command('/tickets/x/priority', { priority: 'urgente' }))).rejects.toThrow('nível');
    expect(calls).toEqual(['priority:alta']);
  });

  it('maps MergeContact fields once for both sides and skips an empty merge', async () => {
    expect(contactPatch({ name: 'Ana', phoneNumber: '+55', city: 'Recife', extras: { plano: 'ouro' }, ignored: 1 })).toEqual({
      columns: { nome: 'Ana', telefone_e164: '+55' },
      extras: { city: 'Recife', plano: 'ouro' },
    });
    const { calls, effects } = withEffects();
    const s = services(effects);
    await s.mergeContact!({ ignored: true });
    await s.mergeContact!({ email: 'a@b.c' });
    expect(calls).toEqual([`contact:${JSON.stringify({ columns: { email: 'a@b.c' }, extras: {} })}`]);
  });

  it('enforces the SetBucket size limit before the effect', async () => {
    const { calls, effects } = withEffects();
    const s = services(effects);
    await expect(
      s.bucketSet!({ key: 'k', type: 'text/plain', value: 'x'.repeat(70_000), scope: 'contact' }),
    ).rejects.toThrow('64 KB');
    await s.bucketSet!({ key: 'k', type: 'text/plain', value: 'ok', scope: 'contact' });
    expect(calls).toEqual(['bucket']);
  });

  describe('ForwardToDesk availability checks', () => {
    it('without availability exits opens the ticket and checks nothing', async () => {
      availability.queues = [];
      availability.closed = 'NoAgentAvailable';
      const { calls, effects } = withEffects();
      await services(effects).forwardForAttendance({ origem: 'ForwardToDesk', settings: {} });
      expect(calls).toEqual(['forward']);
      expect(availability.queues).toEqual([]);
    });

    it('checks the queue the handoff would choose and opens nothing when it is unavailable', async () => {
      availability.queues = [];
      availability.closed = 'OutOfAttendanceHour';
      const { calls, effects } = withEffects();
      const s = services(effects);
      const pedido = { origem: 'ForwardToDesk', settings: {}, unavailableWhen: ['OutOfAttendanceHour', 'NoAgentAvailable'] as const };
      await expect(s.forwardForAttendance(pedido)).rejects.toBeInstanceOf(DeskUnavailable);
      await expect(s.forwardForAttendance(pedido)).rejects.toMatchObject({ status: 'OutOfAttendanceHour' });
      expect(calls).toEqual([]);
      expect(availability.queues).toEqual(['fila-da-regra', 'fila-da-regra']);
    });

    it('an explicit filaId is the queue checked; an available queue opens the ticket', async () => {
      availability.queues = [];
      availability.closed = null;
      const { calls, effects } = withEffects();
      await services(effects).forwardForAttendance({
        origem: 'ForwardToDesk',
        settings: { filaId: 'fila-x' },
        unavailableWhen: ['NoAgentAvailable'],
      });
      expect(availability.queues).toEqual(['fila-x']);
      expect(calls).toEqual(['forward']);
    });
  });
});

describe('Desk write commands (no database: the current ticket is not a real conversation)', () => {
  const DESK = 'postmaster@desk.msging.net';

  function deskCommand(uri: string, resource: unknown): CommandRequest {
    const match = matchCommand({ to: DESK, method: 'set', uri });
    if (!match) throw new Error(`sem rota: ${uri}`);
    return { uri, method: 'set', resource, command: match };
  }

  function withSurvey(): { calls: string[]; s: ReturnType<typeof services> } {
    const { calls, effects } = withEffects();
    effects.recordSatisfactionAnswer = async (answer) => void calls.push(`survey:${JSON.stringify(answer)}`);
    return { calls, s: services(effects) };
  }

  it('change-status maps Blip statuses to the closing actor or the queue, answering the ticket', async () => {
    const { calls, s } = withSurvey();
    const ok = await s.processCommand!(deskCommand('/tickets/change-status', { id: '42', status: 'ClosedClient' }));
    expect(ok).toMatchObject({ method: 'set', status: 'success', type: 'application/vnd.iris.ticket+json', resource: { id: 'c1' } });
    await s.processCommand!(deskCommand('/tickets/change-status-without-redirect', { status: 'ClosedClientInactivity' }));
    await s.processCommand!(deskCommand('/tickets/change-status', { status: 'closedattendant' }));
    await s.processCommand!(deskCommand('/tickets/change-status', { status: 'Waiting' }));
    expect(calls).toEqual(['close:cliente', 'close:inatividade', 'close:atendente', 'enqueue']);
  });

  it('change-status answers LIME failures instead of throwing, without effects', async () => {
    const { calls, s } = withSurvey();
    expect(await s.processCommand!(deskCommand('/tickets/change-status', { status: 'Open', agentIdentity: 'a%40b.c@blip.ai' })))
      .toMatchObject({ status: 'failure', reason: { code: 66 } });
    expect(await s.processCommand!(deskCommand('/tickets/change-status', { status: 'Fechado' })))
      .toMatchObject({ status: 'failure', reason: { code: 64 } });
    expect(await s.processCommand!(deskCommand('/tickets/change-status', {})))
      .toMatchObject({ status: 'failure', reason: { code: 64 } });
    expect(calls).toEqual([]);
  });

  it('/close applies the tags, then closes as the customer unless the status says otherwise', async () => {
    const { calls, s } = withSurvey();
    await s.processCommand!(deskCommand('/tickets//close', { status: 'ClosedClient', tags: ['Encerrado pelo Cliente', 3] }));
    await s.processCommand!(deskCommand('/tickets/c1/close', { status: 'ClosedClientInactivity' }));
    expect(await s.processCommand!(deskCommand('/tickets/c1/close', { status: 'Open' })))
      .toMatchObject({ status: 'failure', reason: { code: 64 } });
    expect(calls).toEqual(['tags:Encerrado pelo Cliente', 'close:cliente', 'close:inatividade']);
  });

  it('/transfer needs a team name; set /tickets opens the ticket; sendCommand answers nothing', async () => {
    const { calls, s } = withSurvey();
    expect(await s.processCommand!(deskCommand('/tickets/c1/transfer', { queueId: 'x' })))
      .toMatchObject({ status: 'failure', reason: { code: 64 } });
    expect(await s.processCommand!(deskCommand('/tickets/5511999%40wa.gw.msging.net', 'Preciso de ajuda')))
      .toMatchObject({ status: 'success', type: 'application/vnd.iris.ticket+json' });
    expect(await s.sendCommand!(deskCommand('/tickets', {}))).toBeUndefined();
    expect(calls).toEqual(['enqueue', 'enqueue']);
  });

  it('/attendance-survey-answer records a 1-5 answer like the native survey block', async () => {
    const { calls, s } = withSurvey();
    await s.processCommand!(deskCommand('/attendance-survey-answer', { rating: 4, comment: 'bom' }));
    await s.processCommand!(deskCommand('/attendance-survey-answer', { value: '5' }));
    await s.processCommand!(deskCommand('/attendance-survey-answer', {}));
    expect(await s.processCommand!(deskCommand('/attendance-survey-answer', { rating: 9 })))
      .toMatchObject({ status: 'failure', reason: { code: 64 } });
    expect(calls).toEqual([
      'survey:{"rating":4,"comment":"bom","status":"completa"}',
      'survey:{"rating":5,"comment":null,"status":"so_nota"}',
      'survey:{"rating":null,"comment":null,"status":"sem_resposta"}',
    ]);
  });
});
