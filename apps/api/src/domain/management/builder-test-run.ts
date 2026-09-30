import { randomUUID } from 'node:crypto';
import {
  PROVEDOR_PADRAO,
  processInbound,
  createInbound,
  EngineError,
  SuspensaoDeProcessHttp,
} from '@pipe/core';
import type { Context, ServicosDoMotor, InboundTrace } from '@pipe/core';
import type { TransactionPipe } from '@pipe/db';
import type {
  TestRunDebug,
  TestRunMessage,
  TestRunReset,
  TestRunResult,
} from '@pipe/contracts';
import { PipeError } from '../../errors.js';
import { toChannelOutput, resolveDynamicContent, loadApplicationIdentity } from '../flow.js';
import { engineServices, isFlowOfTenant } from '../engine-services.js';
import { memoryMessagingEffects, type MemorySchedule } from '../scheduling-commands.js';
import { chooseQueue } from '../queue-entry.js';
import { loadFlowFunctions, type LoadedFlowFunction } from './flow-functions.js';
import { loadFlowResources } from './flow-resources.js';
import { assertAccessToBuilder, compiledDraftOfFlow } from './builder-of-flow.js';

/**
 * The Builder's Test panel (BUILDER-04, D-14): the same engine, the same action provider
 * `PROVEDOR_PADRAO` and the same engine services (`engineServices`) production uses, run over the
 * flow's CURRENT DRAFT with an isolated test contact, never a real one. Only the effects differ:
 * `send`, `forwardForAttendance` and every service that would write to a tenant table (lists,
 * memory, ticket commands, MergeContact, flow state) target an in-memory store, so a test run never
 * creates a row in `mensagem`, `outbox_mensagem`, `conversa` or `execucao_fluxo`. `ProcessHttp`,
 * scripts and reads go through the same guards and queries production uses.
 */

interface TestRunConversationState {
  estado: string;
  prioridade: string;
  filaId: string | null;
  etiquetas: string[];
}

interface TestRunBucketEntry {
  value: unknown;
  expiresAt: number | null;
}

interface TestRunStore {
  variables: Record<string, string>;
  contact: Record<string, unknown>;
  conversation: TestRunConversationState;
  lists: Map<string, Set<string>>;
  bucket: Map<string, TestRunBucketEntry>;
  /** Blocks set in other flows by `set /contexts/.../stateid@<flow>`. */
  flowStates: Map<string, string>;
  /** `set /schedules` and `set /event-track` of this run (P7): kept here, never sent or recorded. */
  schedules: Map<string, MemorySchedule>;
  events: { category: string; action: string; at: Date }[];
  expiresAt: number;
}

const TEST_RUN_STATE_TTL_MS = 30 * 60_000;
const TEST_CONTACT_ID = 'contato-de-teste';

/**
 * ponytail: process-local `Map` keyed by (tenant, user, flow); a second `api` instance would not
 * share test state. Move to a shared store (Redis) if the `api` gains replicas.
 */
const testRunStore = new Map<string, TestRunStore>();

function keyOfTestRun(tid: string, userId: string, flowId: string): string {
  return `${tid}:${userId}:${flowId}`;
}

function newTestRunStore(): TestRunStore {
  return {
    variables: {},
    contact: { identity: TEST_CONTACT_ID, name: 'Contato de teste', phoneNumber: null, email: null, extras: {} },
    conversation: { estado: 'na_fila', prioridade: 'sem_prioridade', filaId: null, etiquetas: [] },
    lists: new Map(),
    bucket: new Map(),
    flowStates: new Map(),
    schedules: new Map(),
    events: [],
    expiresAt: Date.now() + TEST_RUN_STATE_TTL_MS,
  };
}

function storeOfTestRun(tid: string, userId: string, flowId: string): TestRunStore {
  const key = keyOfTestRun(tid, userId, flowId);
  const atual = testRunStore.get(key);
  if (atual && atual.expiresAt > Date.now()) return atual;
  const novo = newTestRunStore();
  testRunStore.set(key, novo);
  return novo;
}

const WINDOW_OF_RATE_MS = 60_000;
const LIMIT_BY_WINDOW = 30;
const countByUser = new Map<string, { start: number; n: number }>();

/**
 * ponytail: same process-local fixed window as `rastreador-de-cliques.ts`; resets on deployment
 * and does not share state across replicas.
 */
function respeitaLimiteDeTaxa(userId: string): boolean {
  const agora = Date.now();
  const atual = countByUser.get(userId);
  if (!atual || agora - atual.start > WINDOW_OF_RATE_MS) {
    countByUser.set(userId, { start: agora, n: 1 });
    return true;
  }
  atual.n += 1;
  return atual.n <= LIMIT_BY_WINDOW;
}

function debugOf(rastro: InboundTrace, variables: Record<string, string>, error?: string): TestRunDebug {
  return {
    states: rastro.estados.map((e) => ({
      stateId: e.stateId,
      actions: e.actions,
      nextStateId: e.nextStateId ?? null,
      ...(e.error ? { error: e.error } : {}),
    })),
    actionsGlobal: rastro.actionsGlobal,
    currentStateId: rastro.stateFinalId,
    variables: { ...variables },
    ...(error ? { error } : {}),
  };
}

/**
 * The production engine services (`engineServices`) with the test run's effects: every write lands
 * in the in-memory store. Reads (Desk commands, queue and flow checks, attendance rules, knowledge)
 * run against the tenant's real data, read-only.
 */
function servicesOfTestRun(
  tx: TransactionPipe,
  tid: string,
  input: string,
  store: TestRunStore,
  messages: TestRunMessage[],
  flowFunctions: Map<string, LoadedFlowFunction>,
  flowId?: string,
): ServicosDoMotor {
  const conversation = store.conversation;
  /** The queue a real handoff would pick (`chooseQueue`; a test run has no inbox default). */
  const queueOf = async (sp: TransactionPipe, queueId: string | null): Promise<string | null> => {
    const contact = store.contact;
    const choice = await chooseQueue(sp, tid, {
      queueId,
      defaultQueueId: null,
      message: input,
      contact: {
        name: contact['name'] as string | null,
        email: contact['email'] as string | null,
        phone: contact['phoneNumber'] as string | null,
        extras: contact['extras'] as Record<string, unknown> | null,
      },
    });
    return choice.queueId;
  };
  const enqueue = async (queueId: string | null): Promise<void> => {
    conversation.filaId = await queueOf(tx, queueId);
    conversation.estado = 'na_fila';
  };
  return engineServices({
    tenantId: tid,
    flowFunctions,
    // `{{secret.*}}` resolves in the test run's HTTP actions too; the engine masks it in `debug`.
    ...(flowId ? { flowId } : {}),
    isolate: (fn) => tx.transaction(fn),
    effects: {
      tickets: {
        get: async () => ({ id: 'teste', ...conversation }),
        changeTags: async (_tx, tags) => {
          conversation.etiquetas = Array.from(new Set([...conversation.etiquetas, ...tags]));
        },
        transfer: (_tx, queueId) => enqueue(queueId),
        enqueue: () => enqueue(null),
        close: async () => {
          conversation.estado = 'encerrada';
        },
        setPriority: async (_tx, priority) => {
          conversation.prioridade = priority;
        },
      },
      send: async (m, signal) => {
        const saida = toChannelOutput(await resolveDynamicContent(m, tid, signal ? { signal } : {}));
        signal?.throwIfAborted();
        if (saida) messages.push(saida);
      },
      // Simulated: no real ticket and no real queue, but the queue a real handoff would choose. The
      // availability checks (`engineServices`) read the real queue's schedule and online agents.
      forwardForAttendance: async ({ settings }) => {
        await enqueue(typeof settings?.['filaId'] === 'string' ? settings['filaId'] : null);
        return { id: 'atendimento-de-teste', status: 'Waiting' };
      },
      queueOfHandoff: queueOf,
      messaging: memoryMessagingEffects({
        contactIdentity: TEST_CONTACT_ID,
        lists: store.lists,
        schedules: store.schedules,
        events: store.events,
      }),
      registerEvent: async () => {
        /* Kept only in memory for this run; a test run never feeds tenant analytics. */
      },
      saveContact: async ({ columns, extras }) => {
        const names = { nome: 'name', email: 'email', telefone_e164: 'phoneNumber', documento: 'taxDocument' } as const;
        for (const [column, value] of Object.entries(columns)) store.contact[names[column as keyof typeof names]] = value;
        Object.assign((store.contact['extras'] ??= {}) as Record<string, unknown>, extras);
      },
      recordSatisfactionAnswer: async () => {
        /* Test-run survey answers are not persisted: there is no real attendance session to attach them to. */
      },
      bucketSet: async ({ key, value, scope, expirationSeconds }) => {
        store.bucket.set(`${scope}:${key}`, {
          value,
          expiresAt: expirationSeconds ? Date.now() + expirationSeconds * 1000 : null,
        });
      },
      bucketGet: async ({ key, scope }) => {
        const entrada = store.bucket.get(`${scope}:${key}`);
        if (!entrada) return null;
        if (entrada.expiresAt && entrada.expiresAt <= Date.now()) {
          store.bucket.delete(`${scope}:${key}`);
          return null;
        }
        return entrada.value ?? null;
      },
      bucketDelete: async ({ key, scope }) => {
        store.bucket.delete(`${scope}:${key}`);
      },
      listManage: async ({ name, operation }) => {
        const membros = store.lists.get(name) ?? new Set<string>();
        if (operation === 'Remove') membros.delete(TEST_CONTACT_ID);
        else membros.add(TEST_CONTACT_ID);
        store.lists.set(name, membros);
      },
      // Same answer as production (false for a flow outside the tenant); the block is kept in memory.
      setFlowState: async ({ flowId, stateId }) => {
        if (!(await isFlowOfTenant(tx, tid, flowId))) return false;
        store.flowStates.set(flowId, stateId);
        return true;
      },
    },
  });
}

export interface RunBuilderTestOptions {
  input: string;
  testVariables?: Record<string, string>;
}

/**
 * Run one test message over the flow's current draft, with the same action provider
 * (`PROVEDOR_PADRAO`) production uses. The test contact's state persists in memory between calls,
 * exactly like a real contact's `execucao_fluxo.contexto` would, but nothing here is written to
 * the database.
 */
export async function runBuilderTest(
  tx: TransactionPipe,
  tid: string,
  userId: string,
  flowId: string,
  options: RunBuilderTestOptions,
): Promise<TestRunResult> {
  if (!respeitaLimiteDeTaxa(userId)) {
    throw new PipeError(429, 'limit_of_rate', 'Muitas mensagens de teste em pouco tempo. Tente de novo em instantes.');
  }
  const { flow } = await compiledDraftOfFlow(tx, tid, userId, flowId);
  const store = storeOfTestRun(tid, userId, flowId);
  if (options.testVariables) Object.assign(store.variables, options.testVariables);
  const flowFunctions = await loadFlowFunctions(tx, flowId);
  const resources = await loadFlowResources(tx, flowId);

  const messages: TestRunMessage[] = [];
  const context: Context = {
    user: TEST_CONTACT_ID,
    flow,
    inbound: createInbound({ id: randomUUID(), tipo: 'text/plain', conteudo: options.input }),
    variables: store.variables,
    inboundContext: new Map(),
    contact: store.contact,
    resources,
    application: await loadApplicationIdentity(tx, flowId),
    services: servicesOfTestRun(tx, tid, options.input, store, messages, flowFunctions, flowId),
  };

  try {
    const rastro = await processInbound(context, { actions: PROVEDOR_PADRAO });
    return { messages, debug: debugOf(rastro, store.variables) };
  } catch (erro) {
    if (erro instanceof SuspensaoDeProcessHttp) {
      return { messages, debug: debugOf(erro.rastro ?? { estados: [], actionsGlobal: [], stateFinalId: null }, store.variables) };
    }
    if (erro instanceof EngineError) {
      return { messages, debug: debugOf(erro.rastro, store.variables, erro.message) };
    }
    throw erro;
  }
}

/** Reset the test contact and its variables (D-14): the next message starts the draft from the root again. */
export async function resetBuilderTest(
  tx: TransactionPipe,
  tid: string,
  userId: string,
  flowId: string,
): Promise<TestRunReset> {
  await assertAccessToBuilder(tx, tid, userId, flowId);
  testRunStore.delete(keyOfTestRun(tid, userId, flowId));
  return { reset: true };
}
