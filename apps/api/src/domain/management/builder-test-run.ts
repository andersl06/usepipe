import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
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
import { chamarComMtls } from '../mtls.js';
import { runFlowScript, scriptFetch } from '../script-sandbox.js';
import { toChannelOutput, resolveDynamicContent } from '../flow.js';
import { confirmarUrlSegura } from './integrations.js';
import { loadFlowFunctions } from './flow-functions.js';
import { assertAccessToBuilder, compiledDraftOfFlow } from './builder-of-flow.js';

/**
 * The Builder's Test panel (BUILDER-04, D-14): the owner unblocked simulation local — the same
 * engine and the same action provider `PROVEDOR_PADRAO` production uses, run over the flow's
 * CURRENT DRAFT with an isolated test contact, never a real one. `send`, `forwardForAttendance`
 * and every service that would otherwise write to a tenant table (lists, memory, platform
 * commands, MergeContact) target an in-memory store instead, so a test run never creates a row in
 * `mensagem`, `outbox_mensagem`, `conversa` or `execucao_fluxo`, and never mixes with real
 * conversations. `ProcessHttp` and scripts still call out through the same guards production uses
 * (`confirmarUrlSegura`, the script sandbox) because those never touch Pipe's own tables.
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

/** Closed subset of Desk commands (D-20), run against the test run's own in-memory conversation instead of a real one. */
async function executeNativeCommandTest(
  conversation: TestRunConversationState,
  uri: string,
  resource: unknown,
  waitForResponse: boolean,
): Promise<unknown> {
  const body = resource && typeof resource === 'object' ? (resource as Record<string, unknown>) : {};
  const match = uri.match(/^\/tickets\/[^/]+(\/.*)?$/);
  const route = match?.[1] ?? '';
  if (!match || !['', '/change-tags', '/transfer', '/status', '/priority'].includes(route)) {
    throw new Error(`A URI '${uri}' não é executada no Pipe.`);
  }
  const result: Record<string, unknown> = { status: 'success', reason: 'OK', resource: null };
  if (route === '/change-tags') {
    const tags = Array.isArray(body['tags'])
      ? body['tags'].filter((tag): tag is string => typeof tag === 'string')
      : [];
    conversation.etiquetas = Array.from(new Set([...conversation.etiquetas, ...tags]));
    result['resource'] = { tags };
  } else if (route === '/transfer') {
    const queueId =
      typeof body['queueId'] === 'string' ? body['queueId'] : typeof body['filaId'] === 'string' ? body['filaId'] : null;
    if (!queueId) throw new Error("O comando de transferência exige 'queueId'.");
    conversation.filaId = queueId;
    result['resource'] = { queueId };
  } else if (route === '/status') {
    const status = typeof body['status'] === 'string' ? body['status'] : null;
    if (!status || !['na_fila', 'atribuida', 'em_atendimento', 'em_espera', 'encerrada'].includes(status)) {
      throw new Error("O comando de status exige um status do Pipe válido.");
    }
    conversation.estado = status;
    result['resource'] = { status };
  } else if (route === '/priority') {
    const priority =
      typeof body['priority'] === 'string' ? body['priority'] : typeof body['prioridade'] === 'string' ? body['prioridade'] : null;
    if (!priority || !['maxima', 'alta', 'media', 'baixa', 'sem_prioridade'].includes(priority)) {
      throw new Error("O comando de prioridade exige um nível do Pipe válido.");
    }
    conversation.prioridade = priority;
    result['resource'] = { priority };
  } else {
    result['resource'] = { id: 'teste', ...conversation };
  }
  return waitForResponse ? result : undefined;
}

/** Same fuzzy match `respondWithKnowledge` uses in production — read-only, so it is safe against the tenant's real base. */
async function respondWithKnowledgeTest(
  tx: TransactionPipe,
  tid: string,
  request: { text: string; minimumConfidence: number },
): Promise<{ answer: string | null; confidence: number }> {
  const words = request.text.toLowerCase().split(/\W+/).filter((word) => word.length > 2).slice(0, 12);
  const pattern = words.length > 0 ? `%${words[0]}%` : '%';
  const { rows } = await tx.execute<{ texto: string }>(sql`
    select t.texto from trecho_conhecimento t
    join documento_conhecimento d on d.id = t.documento_id and d.tenant_id = ${tid} and d.ativo = true
    join base_conhecimento b on b.id = d.base_id and b.tenant_id = ${tid} and b.ativa = true
    where t.tenant_id = ${tid} and t.texto ilike ${pattern}
    order by t.ordem asc limit 1
  `);
  if (!rows[0]) return { answer: null, confidence: 0 };
  const lower = rows[0].texto.toLowerCase();
  const hits = words.filter((word) => lower.includes(word)).length;
  const confidence = Math.min(1, Math.max(0.1, hits / Math.max(words.length, 1)));
  return request.minimumConfidence <= confidence
    ? { answer: rows[0].texto, confidence }
    : { answer: null, confidence };
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

function servicesOfTestRun(
  tx: TransactionPipe,
  tid: string,
  store: TestRunStore,
  messages: TestRunMessage[],
  flowFunctions: Map<string, { id: string; name: string; parameters: string[]; code: string }>,
): ServicosDoMotor {
  return {
    send: async (m, signal) => {
      const saida = toChannelOutput(await resolveDynamicContent(m, tid, signal ? { signal } : {}));
      signal?.throwIfAborted();
      if (saida) messages.push(saida);
    },
    // Simulated: the test panel never opens a real ticket nor moves a real conversation to a queue.
    forwardForAttendance: async () => ({ id: 'atendimento-de-teste', status: 'Waiting' }),
    registerEvent: async () => {
      /* Kept only in memory for this run; a test run never feeds tenant analytics. */
    },
    mergeContact: async (fields) => {
      const textFields = ['name', 'email', 'phoneNumber', 'taxDocument'] as const;
      for (const key of textFields) {
        if (Object.prototype.hasOwnProperty.call(fields, key)) store.contact[key] = fields[key] ?? null;
      }
      const extras = (store.contact['extras'] ??= {}) as Record<string, unknown>;
      for (const key of ['city', 'gender']) {
        if (Object.prototype.hasOwnProperty.call(fields, key)) extras[key] = fields[key];
      }
      if (fields['extras'] && typeof fields['extras'] === 'object' && !Array.isArray(fields['extras'])) {
        Object.assign(extras, fields['extras'] as Record<string, unknown>);
      }
    },
    recordSatisfactionAnswer: async () => {
      /* Test-run survey answers are not persisted: there is no real attendance session to attach them to. */
    },
    callHttp: async (pedido, signal) => {
      confirmarUrlSegura(pedido.url);
      try {
        const resposta = await chamarComMtls(tid, pedido.url, {
          metodo: pedido.metodo,
          headers: pedido.cabecalhos,
          body: pedido.corpo,
          timeoutMs: pedido.timeoutMs,
          ...(signal ? { signal } : {}),
        });
        const corpo = await resposta.texto();
        const limite = Number(process.env['PIPE_PROCESS_HTTP_MAX_RESPOSTA_BYTES'] ?? 1_048_576);
        return { status: resposta.status, corpo: corpo.slice(0, limite) };
      } catch (erro) {
        const message = erro instanceof Error ? erro.message : String(erro);
        const timeout = /timeout|aborted|timed out/i.test(message);
        return {
          status: timeout ? 504 : 503,
          corpo: JSON.stringify({ error: timeout ? 'timeout' : 'network_error', message }),
        };
      }
    },
    runScript: (request) => runFlowScript(request, { fetch: scriptFetch(tid), library: flowFunctions.values() }),
    runFlowFunction: async ({ functionId, args }) => {
      const definition = flowFunctions.get(functionId);
      if (!definition) throw new Error(`A função '${functionId}' não existe neste fluxo.`);
      if (definition.parameters.length !== args.length) {
        throw new Error(`A função '${definition.name}' esperava ${definition.parameters.length} parâmetro(s).`);
      }
      return runFlowScript(
        { version: 2, source: definition.code, functionName: definition.name, args, timeoutMs: 10_000, localTimeZone: false },
        { fetch: scriptFetch(tid) },
      );
    },
    bucketSet: async ({ key, value, scope, expirationSeconds }) => {
      if (JSON.stringify(value).length > 65_536) throw new Error('O documento da ação SetBucket excede 64 KB.');
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
    listManage: async ({ name, operation }) => {
      const membros = store.lists.get(name) ?? new Set<string>();
      if (operation === 'Remove') membros.delete(TEST_CONTACT_ID);
      else membros.add(TEST_CONTACT_ID);
      store.lists.set(name, membros);
    },
    sendCommand: async ({ uri, resource }) => {
      await executeNativeCommandTest(store.conversation, uri, resource, false);
    },
    processCommand: async ({ uri, resource }) => executeNativeCommandTest(store.conversation, uri, resource, true),
    respondWithKnowledge: async ({ text, minimumConfidence }) =>
      respondWithKnowledgeTest(tx, tid, { text, minimumConfidence }),
  };
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

  const messages: TestRunMessage[] = [];
  const context: Context = {
    user: TEST_CONTACT_ID,
    flow,
    inbound: createInbound({ id: randomUUID(), tipo: 'text/plain', conteudo: options.input }),
    variables: store.variables,
    inboundContext: new Map(),
    contact: store.contact,
    services: servicesOfTestRun(tx, tid, store, messages, flowFunctions),
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
