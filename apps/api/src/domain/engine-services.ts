import { sql } from 'drizzle-orm';
import type { ClosedBy, CommandRequest, ServicosDoMotor } from '@pipe/core';
import type { TransactionPipe } from '@pipe/db';
import { chamarComMtls } from './mtls.js';
import { runFlowScript, scriptFetch } from './script-sandbox.js';
import { confirmarUrlSegura } from './management/integrations.js';
import type { LoadedFlowFunction } from './management/flow-functions.js';
import { DESK_READ_COMMANDS } from './desk-commands.js';

/**
 * The engine services (`ServicosDoMotor`) that production (`flow.ts` `runFlowInInbound`) and the
 * Builder's Test panel (`management/builder-test-run.ts`) share. Both build theirs with
 * `engineServices`, which owns everything that must behave the same in both: the outbound HTTP
 * boundary, scripts and flow functions, the knowledge match, the routed commands and their
 * validation, the contact-field mapping and the SetBucket limit. What differs is only where the
 * writes land, passed in as `EngineEffects`: the real conversation and tables in production, an
 * in-memory store in a test run.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PIPE_TICKET_ROUTES = [
  'pipe.tickets.get',
  'pipe.tickets.changeTags',
  'pipe.tickets.transfer',
  'pipe.tickets.status',
  'pipe.tickets.priority',
] as const;

const PRIORITY_LEVELS = ['maxima', 'alta', 'media', 'baixa', 'sem_prioridade'] as const;
const CLOSED_BY_CUSTOMER: readonly ClosedBy[] = ['cliente', 'inatividade'];

/** Where the bot's `pipe.tickets.*` writes land: the current conversation, or the test run's memory. */
export interface TicketEffects {
  get(tx: TransactionPipe): Promise<unknown>;
  changeTags(tx: TransactionPipe, tags: string[]): Promise<void>;
  /** An existing, active queue of this tenant (already checked). */
  transfer(tx: TransactionPipe, queueId: string): Promise<void>;
  /** `/status na_fila`: enter a queue with no explicit one, so the attendance rules decide. */
  enqueue(tx: TransactionPipe): Promise<void>;
  close(tx: TransactionPipe, closedBy: ClosedBy): Promise<void>;
  setPriority(tx: TransactionPipe, priority: string): Promise<void>;
}

/** The side effects that differ between a real execution and a Builder test run. */
export type EngineEffects = Pick<
  ServicosDoMotor,
  | 'send'
  | 'forwardForAttendance'
  | 'registerEvent'
  | 'recordSatisfactionAnswer'
  | 'bucketSet'
  | 'bucketGet'
  | 'listManage'
  | 'setFlowState'
> & {
  tickets: TicketEffects;
  /** Persist the mapped `MergeContact` fields: Pipe columns plus extras merged into `atributos`. */
  saveContact(patch: ContactPatch): Promise<void>;
};

export interface EngineServicesOptions {
  tenantId: string;
  flowFunctions: Map<string, LoadedFlowFunction>;
  /**
   * Runs a database-touching service. Production isolates each one in a SAVEPOINT so an error
   * becomes an action failure instead of aborting the inbound transaction.
   */
  isolate: <T>(fn: (tx: TransactionPipe) => Promise<T>) => Promise<T>;
  effects: EngineEffects;
}

/** `MergeContact` fields in Pipe columns; `city`/`gender`/`extras` go to `atributos`. */
export interface ContactPatch {
  columns: Partial<Record<'nome' | 'email' | 'telefone_e164' | 'documento', unknown>>;
  extras: Record<string, unknown>;
}

const CONTACT_COLUMNS = { name: 'nome', email: 'email', phoneNumber: 'telefone_e164', taxDocument: 'documento' } as const;

export function contactPatch(fields: Record<string, unknown>): ContactPatch {
  const columns: ContactPatch['columns'] = {};
  const extras: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(CONTACT_COLUMNS)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) columns[column] = fields[key] ?? null;
  }
  for (const key of ['city', 'gender']) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) extras[key] = fields[key];
  }
  const more = fields['extras'];
  if (more && typeof more === 'object' && !Array.isArray(more)) Object.assign(extras, more);
  return { columns, extras };
}

export function assertBucketSize(value: unknown): void {
  if (JSON.stringify(value).length > 65_536) throw new Error('O documento da ação SetBucket excede 64 KB.');
}

/**
 * Runs a command the engine already routed (`COMMAND_ROUTES` in `@pipe/core`); arbitrary LIME is
 * never forwarded. Desk reads answer in Blip's shapes (`desk-commands.ts`) from real, read-only data;
 * `pipe.tickets.*` are validated here once and applied through `tickets`.
 */
export async function executeCommand(
  tx: TransactionPipe,
  tenantId: string,
  { uri, resource, command }: CommandRequest,
  waitForResponse: boolean,
  tickets: TicketEffects,
): Promise<unknown> {
  const deskRead = DESK_READ_COMMANDS[command.route];
  if (deskRead) {
    const response = await deskRead(tx, tenantId, command);
    return waitForResponse ? response : undefined;
  }
  const route = command.route;
  if (!(PIPE_TICKET_ROUTES as readonly string[]).includes(route)) throw new Error(`A URI '${uri}' não é executada no Pipe.`);
  const body = resource && typeof resource === 'object' ? (resource as Record<string, unknown>) : {};
  const text = (...keys: string[]): string | null => {
    for (const key of keys) if (typeof body[key] === 'string') return body[key] as string;
    return null;
  };
  const result: Record<string, unknown> = { status: 'success', reason: 'OK', resource: null };
  if (route === 'pipe.tickets.changeTags') {
    const tags = Array.isArray(body['tags']) ? body['tags'].filter((tag): tag is string => typeof tag === 'string') : [];
    await tickets.changeTags(tx, tags);
    result['resource'] = { tags };
  } else if (route === 'pipe.tickets.transfer') {
    const queueId = text('queueId', 'filaId');
    if (!queueId) throw new Error("O comando de transferência exige 'queueId'.");
    if (!UUID.test(queueId)) throw new Error(`O comando de transferência recebeu um 'queueId' inválido: '${queueId}'.`);
    // Explicit tenant filter: the foreign key alone accepts another tenant's queue (it ignores RLS).
    const { rows } = await tx.execute<{ id: string }>(sql`
      select id from fila where id = ${queueId}::uuid and tenant_id = ${tenantId}::uuid and ativa limit 1
    `);
    if (!rows[0]) throw new Error(`A fila '${queueId}' não existe neste Pipe.`);
    await tickets.transfer(tx, queueId);
    result['resource'] = { queueId };
  } else if (route === 'pipe.tickets.status') {
    const status = text('status');
    if (!status || !['na_fila', 'atribuida', 'em_atendimento', 'em_espera', 'encerrada'].includes(status)) {
      throw new Error('O comando de status exige um status do Pipe válido.');
    }
    if (status === 'na_fila') {
      await tickets.enqueue(tx);
    } else if (status === 'encerrada') {
      // The bot closes on the customer's side of the conversation (Blip `ClosedClient`); a flow that
      // closes for customer inactivity says so with `closedBy: 'inatividade'`.
      const closedBy = (text('closedBy', 'encerradaPor') ?? 'cliente') as ClosedBy;
      if (!CLOSED_BY_CUSTOMER.includes(closedBy)) {
        throw new Error("O comando de status aceita 'closedBy' igual a 'cliente' ou 'inatividade'.");
      }
      await tickets.close(tx, closedBy);
    } else {
      // The state machine only reaches these with an agent (`atribuida` → `em_atendimento` → `em_espera`).
      throw new Error(`O bot não pode colocar a conversa em '${status}': esse estado exige um atendente.`);
    }
    result['resource'] = { status };
  } else if (route === 'pipe.tickets.priority') {
    const priority = text('priority', 'prioridade');
    if (!priority || !(PRIORITY_LEVELS as readonly string[]).includes(priority)) {
      throw new Error('O comando de prioridade exige um nível do Pipe válido.');
    }
    await tickets.setPriority(tx, priority);
    result['resource'] = { priority };
  } else {
    result['resource'] = await tickets.get(tx);
  }
  return waitForResponse ? result : undefined;
}

/** `setFlowState` target check: a Blip id from an imported flow is not a flow of this tenant. */
export async function isFlowOfTenant(tx: TransactionPipe, tenantId: string, flowId: string): Promise<boolean> {
  if (!UUID.test(flowId)) return false;
  const { rows } = await tx.execute<{ id: string }>(sql`
    select id from fluxo where id = ${flowId}::uuid and tenant_id = ${tenantId}::uuid
  `);
  return rows.length > 0;
}

/** Read-only fuzzy match over the tenant's knowledge base; safe in a test run too. */
export async function knowledgeMatch(
  tx: TransactionPipe,
  tenantId: string,
  { text, minimumConfidence }: { text: string; minimumConfidence: number },
): Promise<{ answer: string | null; confidence: number }> {
  const words = text.toLowerCase().split(/\W+/).filter((word) => word.length > 2).slice(0, 12);
  const pattern = words.length > 0 ? `%${words[0]}%` : '%';
  const { rows } = await tx.execute<{ texto: string }>(sql`
    select t.texto from trecho_conhecimento t
    join documento_conhecimento d on d.id = t.documento_id and d.tenant_id = ${tenantId} and d.ativo = true
    join base_conhecimento b on b.id = d.base_id and b.tenant_id = ${tenantId} and b.ativa = true
    where t.tenant_id = ${tenantId} and t.texto ilike ${pattern}
    order by t.ordem asc limit 1
  `);
  if (!rows[0]) return { answer: null, confidence: 0 };
  const lower = rows[0].texto.toLowerCase();
  const hits = words.filter((word) => lower.includes(word)).length;
  const confidence = Math.min(1, Math.max(0.1, hits / Math.max(words.length, 1)));
  return confidence >= minimumConfidence ? { answer: rows[0].texto, confidence } : { answer: null, confidence };
}

/**
 * The full `ServicosDoMotor` minus the caller-specific `suspendHttp`/`redirect`, which only exist
 * for a real execution.
 */
export function engineServices({ tenantId, flowFunctions, isolate, effects }: EngineServicesOptions): ServicosDoMotor {
  const { tickets, saveContact, ...rest } = effects;
  return {
    ...rest,
    mergeContact: async (fields) => {
      const patch = contactPatch(fields);
      if (Object.keys(patch.columns).length === 0 && Object.keys(patch.extras).length === 0) return;
      await saveContact(patch);
    },
    callHttp: async (pedido, signal) => {
      confirmarUrlSegura(pedido.url);
      try {
        const resposta = await chamarComMtls(tenantId, pedido.url, {
          metodo: pedido.metodo,
          headers: pedido.cabecalhos,
          body: pedido.corpo,
          // Future work: in production this still runs INSIDE the inbound transaction, holding a
          // database connection; the engine caps it at the action's time limit and aborts it there.
          timeoutMs: pedido.timeoutMs,
          ...(signal ? { signal } : {}),
        });
        const corpo = await resposta.texto();
        const limite = Number(process.env['PIPE_PROCESS_HTTP_MAX_RESPOSTA_BYTES'] ?? 1_048_576);
        return { status: resposta.status, corpo: corpo.slice(0, limite) };
      } catch (erro) {
        // Source rule: network failure or timeout must not abort ProcessHttp; the flow receives a synthetic status.
        const message = erro instanceof Error ? erro.message : String(erro);
        const timeout = /timeout|aborted|timed out/i.test(message);
        return {
          status: timeout ? 504 : 503,
          corpo: JSON.stringify({ error: timeout ? 'timeout' : 'network_error', message }),
        };
      }
    },
    // Like callHttp, the script (up to 10 s) still runs inside the inbound transaction.
    runScript: (request) => runFlowScript(request, { fetch: scriptFetch(tenantId), library: flowFunctions.values() }),
    runFlowFunction: async ({ functionId, args }) => {
      const definition = flowFunctions.get(functionId);
      if (!definition) throw new Error(`A função '${functionId}' não existe neste fluxo.`);
      if (definition.parameters.length !== args.length) {
        throw new Error(`A função '${definition.name}' esperava ${definition.parameters.length} parâmetro(s).`);
      }
      return runFlowScript(
        { version: 2, source: definition.code, functionName: definition.name, args, timeoutMs: 10_000, localTimeZone: false },
        { fetch: scriptFetch(tenantId) },
      );
    },
    bucketSet: async (request) => {
      assertBucketSize(request.value);
      await effects.bucketSet?.(request);
    },
    sendCommand: async (request) => {
      await isolate((tx) => executeCommand(tx, tenantId, request, false, tickets));
    },
    processCommand: (request) => isolate((tx) => executeCommand(tx, tenantId, request, true, tickets)),
    respondWithKnowledge: (request) => isolate((tx) => knowledgeMatch(tx, tenantId, request)),
  };
}
