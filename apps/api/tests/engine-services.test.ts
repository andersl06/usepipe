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
