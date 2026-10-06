import { sql } from 'drizzle-orm';
import {
  EngineError,
  stateKey,
  classificarCusto,
  createInbound,
  ehExportDoEditor,
  contextEhVariable,
  stateSaved,
  activeFlowSession,
  blipReadSubflows,
  blipReadFlow,
  processInbound,
  importReport,
  inputExpirationMessage,
  maskSecrets,
  SuspensaoDeProcessHttp,
  SURVEY_CONTENT_TYPE,
  validateFlow,
  contactRegisterMessage,
  channelIdentity,
  tunnelIdentity,
  isClosedState,
  SQL_STATES_ACTIVE,
  SQL_STATES_CLOSED,
} from '@pipe/core';
import { nomeCurto } from './management/regras-de-nome.js';
import type {
  Context,
  State,
  FlowBlip,
  InboundMessage,
  OutputMessage,
  PedidoDeHttp,
  CursorDeProcessHttp,
  RespostaDeHttp,
  InboundTrace,
  ImportReport,
  Saida,
  ServicosDoMotor,
} from '@pipe/core';
import type { TransactionPipe } from '@pipe/db';
import { databaseOwner, noTenant } from '../database.js';
import { emitir } from '../webhooks-saida.js';
import { registrarEvento } from './eventos.js';
import { redirectInRouter, serviceOfRouter } from './router.js';
import { chamarComMtls } from './mtls.js';
import { confirmarUrlSegura } from './management/integrations.js';
import { loadFlowFunctions } from './management/flow-functions.js';
import { loadFlowResources } from './management/flow-resources.js';
import { openHttpRequest, sealHttpRequest, type StoredHttpRequest } from './management/flow-secrets.js';
import { closeInTransaction, type LineConversation } from './conversation.js';
import { engineServices, isFlowOfTenant, type TicketEffects } from './engine-services.js';
import { databaseMessagingEffects } from './scheduling-commands.js';
import { syncInputExpiration } from './input-expiration.js';
import { chooseQueueOfContact, chooseQueueOfConversation, enterQueue } from './queue-entry.js';
import type { TipoEnvio } from './envio.js';

/**
 * The automated flow (bot) connected to WhatsApp intake uses the Blip `FlowManager` port in `@pipe/core`. This module handles Pipe-specific work: load the channel's published flow, store context in `execucao_fluxo`, record visited states in `execucao_passo`, put replies in the outbox, and hand a conversation to a queue. Run inside the transaction that records the incoming message, in the `pipe-entrada` consumer; the webhook only responds 200 and enqueues. Keeping input and bot reply in one transaction makes them commit together, while Meta redelivery is caught by `id_provedor` and `execucao_passo_entrada_uk`. `ProcessHttp` uses the same HTTPS/SSRF and mTLS outbound boundary, but persists a cursor and leaves the transaction before contacting the client API. Human ownership takes precedence: Blip parks a user in `desk:`, while Pipe lets the conversation own this decision. With an agent or queue, the bot stays silent; it responds only when neither is assigned. After attendance closes, the next message opens a new conversation with the bot context, which belongs to the contact as in Blip. If paused in `desk:`, feed the closed `Ticket` to the engine first so the attendance block's outputs determine the next state (the Blip editor's "bloco configur?vel"). For a channel with a published router, run the contact's current SERVICE from `roteador.ts`. Changing service closes the old execution and starts a new one; returning from human attendance resumes in the contact's service, because position belongs to the contact.
 */

export interface FlowPublished {
  flowId: string;
  versaoId: string;
  /** Present when the channel belongs to a router: the flow above is the current service. */
  router?: {
    id: string;
    /** This service uses the router context (`usa_contexto_do_roteador`). */
    sharesContext: boolean;
    /** O contexto do par (roteador, contato). */
    contexto: Record<string, string>;
    /** Pending Change-User-State from the last `Redirect`. */
    reiniciar: boolean;
    blockInitial: string | null;
  };
}

/**
 * The channel bot: a router takes precedence over a directly connected flow (one bot per number) and resolves the contact's service. That is why the contact enters here. Like Blip, a router has no publish step: it routes while it is not archived, and `serviceOfRouter` still only picks services with a published version.
 */
export async function flowPublishedOfChannel(
  tx: TransactionPipe,
  channelId: string,
  contatoId: string,
): Promise<FlowPublished | null> {
  const { rows: roteadores } = await tx.execute<{ id: string; tenant_id: string }>(sql`
    select f.id, f.tenant_id from fluxo f
     where f.tipo = 'roteador' and f.estado <> 'arquivado'
       and (f.canal_id = ${channelId} or exists (
         select 1 from roteador_canal rc
          where rc.roteador_id = f.id and rc.canal_id = ${channelId}
       ))
     order by f.criado_em desc
     limit 1
  `);
  const router = roteadores[0];
  if (router) {
    return serviceOfRouter(tx, { id: router.id, tenantId: router.tenant_id }, contatoId);
  }
  const { rows } = await tx.execute<{ flowId: string; versao_id: string }>(sql`
    select f.id as "flowId", v.id as versao_id
      from fluxo f
      join fluxo_versao v on v.fluxo_id = f.id
     where f.canal_id = ${channelId} and f.estado = 'publicado' and v.estado = 'publicada'
     order by v.versao desc
     limit 1
  `);
  const linha = rows[0];
  return linha ? { flowId: linha.flowId, versaoId: linha.versao_id } : null;
}

type LineBlock = { id: string; code: string; name: string; content: Record<string, unknown> };
type LineTransition = {
  ofBlockId: string;
  para_codigo: string | null;
  forVariable: string | null;
  condition: { conditions?: unknown } | null;
  order: number;
};

/**
 * Rebuild Blip `Flow` from `bloco` and `transicao`. Current cost is three queries per inbound message; a published version does not change, so cache by `versaoId` if profiling justifies it.
 */
export async function loadFlow(
  tx: TransactionPipe,
  publicado: FlowPublished,
): Promise<{ flow: FlowBlip; blockByCode: Map<string, string>; blockNameByCode: Map<string, string> }> {
  const { rows: versions } = await tx.execute<{ global: Record<string, unknown> }>(
    sql`select global from fluxo_versao where id = ${publicado.versaoId}`,
  );
  const { rows: blocos } = await tx.execute<LineBlock>(
    sql`select id, codigo as code, nome as name, conteudo as content from bloco where versao_id = ${publicado.versaoId}`,
  );
  const { rows: transitions } = await tx.execute<LineTransition>(sql`
    select t.de_bloco_id as "ofBlockId", b.codigo as para_codigo,
           t.para_variavel as "forVariable", t.condicao as condition, t.ordem as "order"
      from transicao t
      left join bloco b on b.id = t.para_bloco_id
     where t.versao_id = ${publicado.versaoId}
     order by t.ordem
  `);

  const saidas = new Map<string, Saida[]>();
  for (const t of transitions) {
    const conditions = t.condition?.conditions;
    const lista = saidas.get(t.ofBlockId) ?? [];
    lista.push({
      order: t.order,
      stateId: t.para_codigo ?? t.forVariable ?? '',
      ...(Array.isArray(conditions) ? { conditions: conditions } : {}),
    });
    saidas.set(t.ofBlockId, lista);
  }

  const states = blocos.map((b) => {
    const state: Record<string, unknown> = { ...b.content };
    // `original` is the editor state saved during import; the engine does not read it.
    delete state['original'];
    return { ...state, id: b.code, outputs: saidas.get(b.id) ?? [] } as State;
  });
  const global = versions[0]?.global ?? {};
  return {
    flow: { ...global, id: publicado.flowId, states } as FlowBlip,
    blockByCode: new Map(blocos.map((b) => [b.code, b.id])),
    blockNameByCode: new Map(blocos.map((b) => [b.code, b.name])),
  };
}

export interface InboundInFlow {
  tenantId: string;
  inboxId: string;
  /** The bot session (`botSessionOf`) the message belongs to. */
  executionId: string;
  /** The session was created by this message; only a new session receives the closed `Ticket`. */
  newExecution: boolean;
  /** The open ticket, or null while the contact only talks to the bot. */
  conversation: {
    id: string;
    queueId: string | null;
    agentId: string | null;
  } | null;
  queueDefaultId: string | null;
  contactId: string;
  message: { id: string | null; idProvedor: string; type: string; content: string | null };
  /** P8: this "message" is the expiration of the block the contact waited in (`input-expiration-job.ts`). */
  inputExpiration?: { stateId: string };
  /** How many Redirect context deliveries led to this run; 0 for a customer message. */
  redirectDepth?: number;
}

/** A Redirect chain (A to B to A ...) inside one customer message stops after this many deliveries. */
export const REDIRECT_MAX_DEPTH = 3;

/** Contact attributes of a service that does not share the router context, kept in its own context. */
const CONTACT_EXTRAS = 'pipe.contato.extras';

/** Text of a Redirect `context` (a string or a document with a text `content`); null when empty. */
function redirectText(context: unknown): string | null {
  const text = typeof context === 'string' ? context : (context as { content?: unknown } | null)?.content;
  return typeof text === 'string' && text.trim() !== '' ? text : null;
}

export interface ResultOfFlow {
  /** The bot handled the message; `false` follows the normal queue path. */
  tratou: boolean;
  /** Number of replies written to the outbox, used to nudge delivery after commit. */
  respostas: number;
  processHttpId?: string;
  /** The ticket the handoff created during this run. */
  ticketId?: string;
}

const NAO_TRATOU: ResultOfFlow = { tratou: false, respostas: 0 };

type LineExecution = {
  id: string;
  flowVersionId: string;
  flowId: string;
  context: Record<string, string>;
};

/** What the bot set for the ticket before the handoff creates it, kept in the execution context. */
const PENDING_PRIORITY = 'pipe.ticket.prioridade';
const PENDING_TAGS = 'pipe.ticket.etiquetas';
/**
 * Instante (ISO) em que a passagem atual do contato pelo bot começou: a mensagem que o encontrou no bloco raiz ou sem estado salvo.
 * Só as mensagens desde esse instante vão para o ticket; as passagens anteriores, que terminaram sem pedir atendimento, ficam só na execução.
 */
const PASS_START = 'pipe.passagem.inicio';

async function createExecution(
  tx: TransactionPipe,
  p: { tenantId: string; versaoId: string; flowId: string; contactId: string; inboxId: string; conversationId: string | null },
): Promise<LineExecution> {
  // Context belongs to the CONTACT, as in Blip: the new session inherits what the bot knew.
  const { rows: anteriores } = await tx.execute<{ contexto: Record<string, string> }>(sql`
    select e.contexto from execucao_fluxo e
      join fluxo_versao v on v.id = e.fluxo_versao_id
     where e.contato_id = ${p.contactId} and v.fluxo_id = ${p.flowId}
     order by e.iniciada_em desc
     limit 1
  `);
  const { rows } = await tx.execute<LineExecution>(sql`
    insert into execucao_fluxo (tenant_id, fluxo_versao_id, conversa_id, contato_id, inbox_id, estado, contexto)
    values (
      ${p.tenantId}, ${p.versaoId}, ${p.conversationId}, ${p.contactId}, ${p.inboxId}, 'executando',
      ${JSON.stringify(anteriores[0]?.contexto ?? {})}::jsonb
    )
    returning id, fluxo_versao_id as "flowVersionId",
              ${p.flowId}::uuid as "flowId", contexto as context
  `);
  return rows[0]!;
}

/**
 * The bot session of a contact in an inbox: the latest execution, unless its ticket is already closed
 * (then the next message starts a new session that inherits the contact context). The conversation with
 * the bot lives here, not in `conversa`. Serialised per contact and inbox so two simultaneous messages
 * never open two sessions.
 */
export async function botSessionOf(
  tx: TransactionPipe,
  p: { tenantId: string; contactId: string; inboxId: string; publicado: FlowPublished },
): Promise<LineExecution & { created: boolean }> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`bot:${p.contactId}:${p.inboxId}`}))`);
  const { rows } = await tx.execute<LineExecution & { ticketState: string | null }>(sql`
    select e.id, e.fluxo_versao_id as "flowVersionId", v.fluxo_id as "flowId",
           e.contexto as context, c.estado as "ticketState"
      from execucao_fluxo e
      join fluxo_versao v on v.id = e.fluxo_versao_id
      left join conversa c on c.id = e.conversa_id
     where e.tenant_id = ${p.tenantId} and e.contato_id = ${p.contactId} and e.inbox_id = ${p.inboxId}
     order by e.iniciada_em desc
     limit 1
     for update of e
  `);
  const latest = rows[0];
  if (latest && !(latest.ticketState && isClosedState(latest.ticketState))) {
    return { id: latest.id, flowVersionId: latest.flowVersionId, flowId: latest.flowId, context: latest.context, created: false };
  }
  const created = await createExecution(tx, {
    tenantId: p.tenantId,
    versaoId: p.publicado.versaoId,
    flowId: p.publicado.flowId,
    contactId: p.contactId,
    inboxId: p.inboxId,
    conversationId: null,
  });
  return { ...created, created: true };
}

/** Map Pipe's closing actor to Blip `Ticket.Status`. */
const STATUS_DO_TICKET: Readonly<Record<string, string>> = {
  atendente: 'ClosedAttendant',
  cliente: 'ClosedClient',
  inatividade: 'ClosedClientInactivity',
  transferencia: 'Transferred',
};

export async function runFlowInInbound(
  tx: TransactionPipe,
  publicado: FlowPublished | null,
  e: InboundInFlow,
  retomada?: { executionId: string; cursor: CursorDeProcessHttp; resposta: RespostaDeHttp },
): Promise<ResultOfFlow> {
  const { conversation } = e;
  // Human ownership wins: the bot does not speak while an agent is assigned.
  if (conversation?.agentId && !retomada) return NAO_TRATOU;

  // `for update`: duas mensagens do mesmo cliente ao mesmo tempo andam uma de cada vez.
  const { rows: executions } = await tx.execute<LineExecution>(sql`
    select e.id, e.fluxo_versao_id as "flowVersionId", v.fluxo_id as "flowId",
           e.contexto as context from execucao_fluxo e
      join fluxo_versao v on v.id = e.fluxo_versao_id
     where e.id = ${e.executionId}
     for update of e
  `);
  let execution = executions[0] ?? null;
  if (!execution) return NAO_TRATOU;
  // The ticket the bot works on: open at the start, or created by the handoff during this run.
  let ticketId: string | null = conversation?.id ?? null;
  let ticketCreated: string | undefined;

  if (!retomada) {
    const { rows: pendentes } = await tx.execute<{ id: string }>(sql`
      select id from process_http_execucao
       where execucao_id = ${execution.id} and estado in ('pendente', 'chamando')
       limit 1
    `);
    // Pipe decision: while HTTP is pending, the message remains stored and waits
    // for resumption so one conversation never runs two engine executions concurrently.
    if (pendentes[0]) return { tratou: true, respostas: 0 };
  }

  // Already queued and waiting for a person is also human-owned.
  if (conversation?.queueId && !retomada) return NAO_TRATOU;

  if (!publicado) {
    // If the conversation belonged to the bot but its flow was unpublished, move it to the queue rather than leave it silent.
    await transbordarSemFalhar(tx, e, execution.id, execution.flowId, execution.context, 'o fluxo do canal saiu do ar');
    return { tratou: true, respostas: 0 };
  }

  const roteador = publicado.router ?? null;
  // Only a new session receives the `Ticket` from the closed attendance session.
  const nova = e.newExecution;
  if (execution.flowId !== publicado.flowId) {
    // The router sent the contact to another service; end the prior execution and start the service's own.
    await tx.execute(sql`
      update execucao_fluxo set estado = 'concluida', encerrada_em = now() where id = ${execution.id}
    `);
    execution = await createExecution(tx, {
      tenantId: e.tenantId,
      versaoId: publicado.versaoId,
      flowId: publicado.flowId,
      contactId: e.contactId,
      inboxId: e.inboxId,
      conversationId: ticketId,
    });
  } else if (execution.flowVersionId !== publicado.versaoId) {
    // If a new version is published during a conversation, retain the same context. A state
    // that no longer exists falls back to root, as `FlowManager` does.
    await tx.execute(
      sql`update execucao_fluxo set fluxo_versao_id = ${publicado.versaoId} where id = ${execution.id}`,
    );
  }
  const executionId = execution.id;

  const { flow, blockByCode, blockNameByCode } = await loadFlow(tx, publicado);
  const flowFunctions = await loadFlowFunctions(tx, publicado.flowId);
  // Powers the engine's `resource` variable source (Context.resources); resources belong to THIS
  // flow's own recurso_do_fluxo rows, never the router's, even when `sharesContext` shares
  // `variables` below — Blip's resource store is per bot, and each service here is its own bot.
  const resources = await loadFlowResources(tx, publicado.flowId);
  // With shared router context, variables are scoped to the router-contact pair.
  const variables: Record<string, string> = {
    ...(roteador?.sharesContext ? roteador.contexto : execution.context),
  };
  if (roteador?.reiniciar) {
    // Apply Change-User-State after Master-State: the destination starts at the requested block or at root.
    // ponytail: ASSUMPTION (03.1-ENSAIOS.md roteador.retorno_bloco_anterior is nao_verificado): without
    // an explicit block the destination keeps its saved block, so returning to a visited service resumes
    // the block it left; a first visit has no saved block and starts at root. Not verified Blip behavior.
    if (roteador.blockInitial) variables[stateKey(flow.id)] = roteador.blockInitial;
    await tx.execute(sql`
      update posicao_no_roteador set reiniciar = false, bloco_inicial = null
       where roteador_id = ${roteador.id} and contato_id = ${e.contactId}
    `);
  }
  /** Persist router context whenever the execution is saved. */
  const saveContextOfRouter = async (): Promise<void> => {
    if (!roteador?.sharesContext) return;
    await tx.execute(sql`
      update posicao_no_roteador set contexto = ${JSON.stringify(variables)}::jsonb
       where roteador_id = ${roteador.id} and contato_id = ${e.contactId}
    `);
  };
  const application = await loadApplicationIdentity(tx, publicado.flowId, roteador?.id ?? null);
  // ponytail: ASSUMPTION (03.1-ENSAIOS.md roteador.contexto_desligado_isola_contato is nao_verificado):
  // a service under a router that does not share its context has an isolated contact context, so its
  // contact attributes (`extras`) live in this overlay, starting empty. Name/e-mail/phone stay on the
  // tenant contact (D-14, no second contact). Not verified Blip behavior.
  const isolatesContact = roteador !== null && !roteador.sharesContext;
  // ponytail: ASSUMPTION mantido; se cair na verificação humana, remover `extrasOverlay` junto.
  const extrasOverlay = (): Record<string, unknown> | null => (isolatesContact ? (JSON.parse(variables[CONTACT_EXTRAS] ?? '{}') as Record<string, unknown>) : null);
  const contact = await loadContact(
    tx,
    e.contactId,
    application.routerIdentifier !== null,
    isolatesContact ? (JSON.parse(variables[CONTACT_EXTRAS] ?? '{}') as Record<string, unknown>) : null,
  );
  const relogio = relogioCrescente();
  // A customer message that finds the contact with no saved state, waiting at the root block, in a new session or just routed here opens a new pass through the bot.
  if (!retomada && !e.inputExpiration && (nova || roteador?.reiniciar || startsAtRoot(variables, flow))) {
    variables[PASS_START] = (await passStartOf(tx, e.message.id)).toISOString();
  }
  const eventos: Record<string, unknown>[] = [];
  let respostas = 0;
  let transferida = false;
  let processHttpId: string | undefined;

  // Postgres aborts the whole transaction on any error, so a DB error inside an action would
  // take the inbound message down with it. Every service that touches the database runs in a
  // SAVEPOINT (a nested drizzle transaction on the same connection): its error becomes an action
  // failure (`EngineError` → overflow to the queue) and the inbound transaction stays usable.
  const emSavepoint = <T>(fn: (sp: TransactionPipe) => Promise<T>): Promise<T> => tx.transaction(fn);
  /** The bot's attendance handoff, shared by `forwardForAttendance` and the `/transfer` command. */
  const transferirPeloBot = async (sp: TransactionPipe, queueId: string | null): Promise<string> => {
    const id = await transbordar(sp, e, execution.id, publicado.flowId, queueId, variables, null, relogio(), false, extrasOverlay());
    if (ticketId !== id) ticketCreated = id;
    ticketId = id;
    transferida = true;
    return id;
  };
  const NO_TICKET = 'Não há ticket aberto para esta conversa.';

  const tickets: TicketEffects = {
    get: async (sp) => {
      if (!ticketId) return null;
      const { rows } = await sp.execute<{ id: string; estado: string; prioridade: string; fila_id: string | null }>(sql`
        select id, estado, prioridade, fila_id from conversa where id = ${ticketId} and tenant_id = ${e.tenantId}
      `);
      return rows[0] ?? null;
    },
    changeTags: async (sp, tags) => {
      if (!ticketId) {
        // No ticket yet: the handoff applies them when it creates it.
        const pending = new Set<string>(JSON.parse(variables[PENDING_TAGS] ?? '[]') as string[]);
        for (const name of tags) pending.add(name);
        variables[PENDING_TAGS] = JSON.stringify([...pending]);
        return;
      }
      for (const name of tags) {
        const { rows } = await sp.execute<{ id: string }>(sql`
          insert into etiqueta (tenant_id, nome, escopo, atualizado_em)
          values (${e.tenantId}, ${name}, 'conversa', now())
          on conflict (tenant_id, nome) do update set atualizado_em = now()
          returning id
        `);
        await sp.execute(sql`
          insert into conversa_etiqueta (tenant_id, conversa_id, etiqueta_id, em)
          values (${e.tenantId}, ${ticketId}, ${rows[0]!.id}, now()) on conflict do nothing
        `);
      }
    },
    transfer: async (sp, queueId) => { await transferirPeloBot(sp, queueId); },
    enqueue: async (sp) => { await transferirPeloBot(sp, null); },
    close: async (sp, closedBy) => {
      if (!ticketId) throw new Error(NO_TICKET);
      const { rows } = await sp.execute<LineConversation>(sql`
        select id, estado as state, fila_id as "queueId", atendente_id as "agentId", em_espera_desde
          from conversa where id = ${ticketId} and tenant_id = ${e.tenantId}::uuid limit 1
      `);
      if (!rows[0]) throw new Error('A conversa não existe.');
      await closeInTransaction(sp, e.tenantId, rows[0], null, [], new Date(), closedBy);
    },
    setPriority: async (sp, priority) => {
      if (!ticketId) {
        variables[PENDING_PRIORITY] = priority;
        return;
      }
      await sp.execute(sql`update conversa set prioridade = ${priority}, atualizado_em = now() where id = ${ticketId} and tenant_id = ${e.tenantId}`);
    },
  };

  const servicos: ServicosDoMotor = engineServices({
    tenantId: e.tenantId,
    flowFunctions,
    // Secrets belong to this flow, never the router's, like resources above.
    flowId: publicado.flowId,
    isolate: emSavepoint,
    effects: {
      tickets,
      send: async (m, signal) => {
        const saida = toChannelOutput(await resolveDynamicContent(m, e.tenantId, signal ? { signal } : {}));
        if (saida === null) return;
        // An action past its time limit must not record a reply (CR-06).
        signal?.throwIfAborted();
        await emSavepoint((sp) => gravarRespostaDoBot(
          sp,
          e.tenantId,
          { conversationId: ticketId, executionId: execution.id },
          saida.texto,
          relogio(),
          saida.dados,
          saida.tipo,
          blockStamp(variables, flow, blockByCode, blockNameByCode),
        ));
        respostas += 1;
      },
      // The ticket, in the queue `chooseQueue` decides (`enterQueue`).
      forwardForAttendance: async ({ settings }) => {
        const queueId = typeof settings?.['filaId'] === 'string' ? settings['filaId'] : null;
        return emSavepoint(async (sp) => ticketOfConversation(sp, await transferirPeloBot(sp, queueId)));
      },
      queueOfHandoff: async (sp, queueId) => (ticketId
        ? await chooseQueueOfConversation(sp, {
            tenantId: e.tenantId,
            conversationId: ticketId,
            flowId: publicado.flowId,
            extrasOverlay: extrasOverlay(),
            queueId,
            defaultQueueId: e.queueDefaultId,
            message: e.message.content,
          })
        : await chooseQueueOfContact(sp, {
            tenantId: e.tenantId,
            contactId: e.contactId,
            flowId: publicado.flowId,
            extrasOverlay: extrasOverlay(),
            queueId,
            defaultQueueId: e.queueDefaultId,
            message: e.message.content,
          })).queueId,
      messaging: databaseMessagingEffects({ tenantId: e.tenantId, flowId: publicado.flowId, contactId: e.contactId }),
      registerEvent: async (evento) => {
        eventos.push(evento);
      },
      // The execution is already inside noTenant; the id is deliberately the current execution
      // contact, so a flow setting contact_id cannot cross tenant boundaries.
      saveContact: async ({ columns, extras }) => {
        const updates = Object.entries(columns).map(([column, value]) => sql`${sql.raw(column)} = ${value ?? null}`);
        if (isolatesContact && Object.keys(extras).length > 0) {
          variables[CONTACT_EXTRAS] = JSON.stringify({
            ...(JSON.parse(variables[CONTACT_EXTRAS] ?? '{}') as Record<string, unknown>),
            ...extras,
          });
        } else if (Object.keys(extras).length > 0) {
          updates.push(sql`atributos = coalesce(atributos, '{}'::jsonb) || ${JSON.stringify(extras)}::jsonb`);
        }
        if (updates.length === 0) return;
        await emSavepoint((sp) => sp.execute(sql`update contato set ${sql.join(updates, sql`, `)}, atualizado_em = now()
          where id = ${e.contactId}`));
      },
      recordSatisfactionAnswer: (answer) => emSavepoint(async (tx) => {
        const recent = await mostRecentClosedAttendance(tx, e.contactId, ticketId);
        // The answer evaluates a closed attendance; without one there is nothing to evaluate.
        if (!recent) {
          console.warn('[fluxo] pesquisa sem atendimento para avaliar');
          return;
        }
        const blockId = variables[stateKey(flow.id)] ?? null;
        await tx.execute(sql`
          insert into pesquisa_satisfacao_resposta (
            tenant_id, conversa_id, conversa_atendimento_id, fluxo_bloco_id, fila_id,
            atendente_id, contato_id, nota, comentario, estado, respondida_em
          ) values (
            ${e.tenantId}, ${recent.id}, ${recent.id}, ${blockId},
            ${recent.queueId}, ${recent.agentId}, ${e.contactId},
            ${answer.rating}, ${answer.comment}, ${answer.status},
            ${answer.status === 'sem_resposta' ? null : relogio()}
          )
        `);
      }),
      bucketSet: ({ key, type, value, scope, expirationSeconds }) => emSavepoint(async (tx) => {
        const contactId = scope === 'contact' ? e.contactId : null;
        const expiresAt = expirationSeconds ? new Date(Date.now() + expirationSeconds * 1000) : null;
        if (scope === 'global') {
          await tx.execute(sql`
            insert into gravar_memoria (tenant_id, contato_id, escopo, chave, valor, expira_em, atualizado_em)
            values (${e.tenantId}, null, 'global', ${key}, ${JSON.stringify({ type, value })}::jsonb, ${expiresAt}, now())
            on conflict (tenant_id, chave) where escopo = 'global'
            do update set valor = excluded.valor, expira_em = excluded.expira_em, atualizado_em = now()
          `);
        } else {
          await tx.execute(sql`
            insert into gravar_memoria (tenant_id, contato_id, escopo, chave, valor, expira_em, atualizado_em)
            values (${e.tenantId}, ${contactId}, 'contact', ${key}, ${JSON.stringify({ type, value })}::jsonb, ${expiresAt}, now())
            on conflict (tenant_id, contato_id, chave) where escopo = 'contact'
            do update set valor = excluded.valor, expira_em = excluded.expira_em, atualizado_em = now()
          `);
        }
      }),
      bucketGet: ({ key, scope }) => emSavepoint(async (tx) => {
        const { rows } = await tx.execute<{ valor: { value?: unknown } }>(sql`
          select valor from gravar_memoria
           where tenant_id = ${e.tenantId} and chave = ${key}
             and escopo = ${scope} and (${scope === 'global' ? sql`true` : sql`contato_id = ${e.contactId}`})
             and (expira_em is null or expira_em > now())
           limit 1
        `);
        return rows[0]?.valor?.value ?? null;
      }),
      bucketDelete: ({ key, scope }) => emSavepoint(async (tx) => {
        await tx.execute(sql`
          delete from gravar_memoria
           where tenant_id = ${e.tenantId} and chave = ${key}
             and escopo = ${scope} and (${scope === 'global' ? sql`true` : sql`contato_id = ${e.contactId}`})
        `);
      }),
      listManage: ({ name, operation }) => emSavepoint(async (tx) => {
        const { rows } = await tx.execute<{ id: string }>(sql`
          insert into lista_distribuicao (tenant_id, nome, atualizado_em)
          values (${e.tenantId}, ${name}, now())
          on conflict (tenant_id, nome) do update set atualizado_em = now()
          returning id
        `);
        if (operation === 'Remove') {
          await tx.execute(sql`
            delete from lista_distribuicao_contato c using lista_distribuicao l
             where c.lista_id = l.id and c.tenant_id = ${e.tenantId} and l.tenant_id = ${e.tenantId}
               and l.nome = ${name} and c.contato_id = ${e.contactId}
          `);
        } else {
          await tx.execute(sql`
            insert into lista_distribuicao_contato (tenant_id, lista_id, contato_id, atualizado_em)
            values (${e.tenantId}, ${rows[0]!.id}, ${e.contactId}, now())
            on conflict (tenant_id, lista_id, contato_id) do nothing
          `);
        }
      }),
      // Blip `set /contexts/{contact}/stateid@{flow}`: the flow's saved block lives in the contact's
      // latest execution context of that flow (`stateId@<flowId>`), which the next execution inherits.
      setFlowState: ({ flowId, stateId }) => emSavepoint(async (sp) => {
        if (!(await isFlowOfTenant(sp, e.tenantId, flowId))) return false;
        await sp.execute(sql`
          update execucao_fluxo
             set contexto = coalesce(contexto, '{}'::jsonb) || jsonb_build_object(${stateKey(flowId)}::text, ${stateId}::text)
           where id = (
             select ex.id from execucao_fluxo ex
               join fluxo_versao v on v.id = ex.fluxo_versao_id
              where ex.contato_id = ${e.contactId} and v.fluxo_id = ${flowId}::uuid
              order by ex.iniciada_em desc
              limit 1
           )
        `);
        return true;
      }),
    },
  });
  servicos.suspendHttp = async (pedido, cursor) => {
    confirmarUrlSegura(pedido.url);
    const key = `${executionId}:${e.message.idProvedor}:${cursor.estadoId ?? 'global'}:${cursor.lista}:${cursor.indice}`;
    const blockOfCursor = blockOfFlowState(variables, flow, blockByCode, cursor.estadoId);
    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into process_http_execucao (
        tenant_id, execucao_id, chave, bloco_id, bloco_codigo, lista, indice,
        entrada, contexto, pedido, estado
      ) values (
        ${e.tenantId}, ${executionId}, ${key},
        ${blockOfCursor},
        ${cursor.estadoId ?? ''}, ${cursor.lista}, ${cursor.indice},
        ${JSON.stringify({
          id: e.message.id,
          id_provedor: e.message.idProvedor,
          tipo: e.message.type,
          conteudo: e.message.content,
        })}::jsonb,
        ${JSON.stringify(variables)}::jsonb, ${JSON.stringify(sealHttpRequest(pedido))}::jsonb, 'pendente'
      )
      on conflict (execucao_id, chave) do nothing
      returning id
    `);
    processHttpId = rows[0]?.id;
    // O cursor fica committed antes de liberar a chamada externa.
    throw new SuspensaoDeProcessHttp(pedido, cursor);
  };
  // A Redirect with a `context` message runs the destination service on that text in this same
  // transaction, after the current run ends (never nested inside the action). ponytail: ASSUMPTION
  // (03.1-ENSAIOS.md roteador.redirect_entrega_contexto is nao_verificado): delivery per Blip docs
  // (Redirect accepts content.context). A Redirect without context starts on the next customer message.
  let pendingRedirect: string | null = null;
  if (roteador) {
    servicos.redirect = async ({ endereco, context }) => {
      if ((e.redirectDepth ?? 0) >= REDIRECT_MAX_DEPTH) {
        throw new Error(`Redirect em cadeia excedeu o limite de ${REDIRECT_MAX_DEPTH} entregas.`);
      }
      await redirectInRouter(tx, { tenantId: e.tenantId, routerId: roteador.id, contactId: e.contactId, service: endereco });
      pendingRedirect = redirectText(context);
    };
  }

  /** Run one engine input. A flow failure must not abort the message; route it to a queue. */
  const rodar = async (
    message: InboundMessage,
    inbound: Record<string, unknown>,
  ): Promise<boolean> => {
    const context: Context = {
      user: e.contactId,
      flow,
      inbound: createInbound(message),
      variables,
      inboundContext: new Map(),
      contact,
      resources,
      application,
      services: servicos,
    };
    try {
      const rastro = await processInbound(
        context,
        retomada ? { retomarProcessHttp: retomada.cursor } : {},
      );
      await gravarPassos(
        tx,
        e.tenantId,
        executionId,
        rastro,
        blockByCode,
        inbound,
        eventos.splice(0),
        relogio,
      );
      return true;
    } catch (erro) {
      if (erro instanceof SuspensaoDeProcessHttp) {
        await gravarPassos(
          tx,
          e.tenantId,
          executionId,
          erro.rastro ?? { estados: [], actionsGlobal: [], stateFinalId: erro.cursor.estadoId },
          blockByCode,
          inbound,
          eventos.splice(0),
          relogio,
        );
        await tx.execute(sql`
          update execucao_fluxo
             set estado = 'aguardando', contexto = ${JSON.stringify(variables)}::jsonb,
                 bloco_atual_id = ${blockOfFlowState(variables, flow, blockByCode, erro.cursor.estadoId)},
                 bloco_anterior_id = ${blockOfFlowState(variables, flow, blockByCode, variables[`previous-stateId@${flow.id}`])},
                 bloco_anterior_codigo = ${variables[`previous-stateId@${flow.id}`] ?? null}
           where id = ${executionId}
        `);
        await saveContextOfRouter();
        return true;
      }
      if (!(erro instanceof EngineError)) throw erro;
      await gravarPassos(
        tx,
        e.tenantId,
        executionId,
        erro.rastro,
        blockByCode,
        inbound,
        eventos.splice(0),
        relogio,
      );
      await tx.execute(sql`
        update execucao_fluxo
           set estado = 'falhou', contexto = ${JSON.stringify(variables)}::jsonb, encerrada_em = now()
         where id = ${executionId}
      `);
      await saveContextOfRouter();
      // Blip would leave the user waiting without a reply; here the conversation goes to the queue.
      if (!transferida) {
        ticketCreated = (await transbordarSemFalhar(tx, e, executionId, publicado.flowId, variables, `o fluxo falhou: ${erro.message}`)) ?? ticketCreated;
      }
      return false;
    }
  };

  // Numa retomada a entrada é a MESMA da suspensão original — `execucao_passo` já
  // gravou aquele `id_provedor` (fluxo.ts:440-450). Repeti-lo aqui violaria
  // `execucao_passo_entrada_uk` (a proteção contra webhook duplicado da Meta,
  // migration 0014), então uma retomada nunca inclui `id_provedor` de novo.
  let idProvedorUsado = Boolean(retomada);
  // The contact may be inside a subflow (P12): its `desk:` block lives there.
  const sessionBefore = activeFlowSession(variables, flow);
  const stateBefore = sessionBefore.stateId;
  if (
    nova &&
    stateBefore?.startsWith('desk:') &&
    sessionBefore.flow.states.some((s) => s.id === stateBefore)
  ) {
    const ticket = await lastAttendance(tx, e.contactId, ticketId, executionId);
    idProvedorUsado = true;
    const certo = await rodar(
      {
        id: `ticket:${ticket.id}`,
        tipo: 'application/vnd.iris.ticket+json',
        conteudo: ticket,
        de: e.contactId,
      },
      { ticket, id_provedor: e.message.idProvedor, mensagem_id: e.message.id },
    );
    if (!certo) return { tratou: true, respostas, ...(ticketCreated ? { ticketId: ticketCreated } : {}) };
    // The bot stopped after replying to the customer; the next customer message wakes it.
    // After returning to the root or leaving the flow, treat this message as the first input, as Blip does.
    const sessionAfter = activeFlowSession(variables, flow);
    const depois = sessionAfter.stateId;
    if (depois !== null && depois !== sessionAfter.flow.states.find((s) => s.root)?.id) {
      await saveExecution(tx, executionId, variables, flow.id, blockByCode, transferida);
      await saveContextOfRouter();
      await syncInputExpiration(tx, e.tenantId, executionId, flow, transferida ? null : depois);
      return { tratou: true, respostas, ...(ticketCreated ? { ticketId: ticketCreated } : {}) };
    }
  }

  const certo = await rodar(
    e.inputExpiration
      ? inputExpirationMessage(e.inputExpiration.stateId, e.message.idProvedor, e.contactId)
      : {
          id: e.message.idProvedor,
          tipo: MIME_DO_TIPO[e.message.type] ?? 'text/plain',
          conteudo: e.message.content ?? '',
          de: e.contactId,
        },
    {
      mensagem_id: e.message.id,
      ...(idProvedorUsado ? {} : { id_provedor: e.message.idProvedor }),
    },
  );
  if (certo) {
    await saveExecution(tx, executionId, variables, flow.id, blockByCode, transferida);
    await saveContextOfRouter();
  }
  // P8: arm the expiration of the block the contact now waits in, or clear it (failure, handoff,
  // a ProcessHttp still pending: its resume runs this again).
  await syncInputExpiration(
    tx,
    e.tenantId,
    executionId,
    flow,
    certo && !transferida && !processHttpId ? stateSaved(variables, flow.id) : null,
  );
  const resultado: ResultOfFlow = {
    tratou: true,
    respostas,
    ...(processHttpId ? { processHttpId } : {}),
    ...(ticketCreated ? { ticketId: ticketCreated } : {}),
  };
  const contexto = pendingRedirect as string | null;
  if (contexto && roteador && certo && !transferida && !processHttpId) {
    const depth = (e.redirectDepth ?? 0) + 1;
    const destino = await serviceOfRouter(tx, { id: roteador.id, tenantId: e.tenantId }, e.contactId);
    if (destino) {
      // Same switch the next customer message would make, done here: end this execution and open the
      // destination's. Not `botSessionOf`: executions of one transaction share `iniciada_em`, so
      // "the latest" would be ambiguous inside a chain.
      await tx.execute(sql`update execucao_fluxo set estado = 'concluida', encerrada_em = now() where id = ${executionId}`);
      const sessao = await createExecution(tx, {
        tenantId: e.tenantId,
        versaoId: destino.versaoId,
        flowId: destino.flowId,
        contactId: e.contactId,
        inboxId: e.inboxId,
        conversationId: ticketId,
      });
      const { inputExpiration: _expiracao, ...base } = e;
      const interno = await runFlowInInbound(tx, destino, {
        ...base,
        executionId: sessao.id,
        newExecution: false,
        redirectDepth: depth,
        message: { id: null, idProvedor: `redirect:${executionId}:${depth}`, type: 'texto', content: contexto },
      });
      resultado.respostas += interno.respostas;
      if (interno.processHttpId) resultado.processHttpId = interno.processHttpId;
      if (interno.ticketId) resultado.ticketId = interno.ticketId;
    }
  }
  return resultado;
}

/** Perform HTTP outside the transaction, then resume the saved cursor in a second transaction. */
export async function executarProcessHttp(processoId: string): Promise<string[]> {
  type Linha = {
    id: string; tenant_id: string; executionId: string; state: string;
    pedido: StoredHttpRequest; inbound: Record<string, unknown>; blockCode: string;
    lista: CursorDeProcessHttp['lista']; indice: number;
  };
  const dono = await databaseOwner().execute<Linha>(sql`
    select id, tenant_id, execucao_id as "executionId", estado as "state", pedido,
           entrada as "inbound", bloco_codigo as "blockCode", lista, indice
      from process_http_execucao where id = ${processoId} limit 1
  `);
  const encontrado = dono.rows[0];
  if (!encontrado || encontrado.state !== 'pendente') return [];

  const tomou = await noTenant(encontrado.tenant_id, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      update process_http_execucao set estado = 'chamando', atualizado_em = now()
       where id = ${processoId} and estado = 'pendente' returning id
    `);
    return rows.length > 0;
  });
  if (!tomou) return [];

  // A request carrying `{{secret.*}}` was stored encrypted (`sealHttpRequest`); decrypt it only here.
  const pedido: PedidoDeHttp = openHttpRequest(encontrado.pedido);
  confirmarUrlSegura(pedido.url);
  let resposta: RespostaDeHttp;
  try {
    const r = await chamarComMtls(encontrado.tenant_id, pedido.url, {
      metodo: pedido.metodo,
      headers: pedido.cabecalhos,
      body: pedido.corpo,
      timeoutMs: pedido.timeoutMs,
    });
    const limite = Number(process.env['PIPE_PROCESS_HTTP_MAX_RESPOSTA_BYTES'] ?? 1_048_576);
    resposta = { status: r.status, corpo: (await r.texto()).slice(0, limite) };
  } catch (erro) {
    const bruta = erro instanceof Error ? erro.message : String(erro);
    // The stored response must not quote a secret the URL or a header carried.
    const mensagem = pedido.sensivel
      ? maskSecrets(bruta, new Set([pedido.url, ...Object.values(pedido.cabecalhos)]))
      : bruta;
    const timeout = /timeout|aborted|timed out/i.test(mensagem);
    resposta = {
      status: timeout ? 504 : 503,
      corpo: JSON.stringify({ error: timeout ? 'timeout' : 'network_error', message: mensagem }),
    };
  }

  const { novos } = await resumeCallOfProcessHttp(processoId, encontrado.tenant_id, resposta);
  return novos;
}

/**
 * Shared second half of a ProcessHttp round trip: claim the `chamando` row, store the response,
 * resume the suspended cursor, catch up any inbound messages that arrived while the row was
 * pending, and close the row as `retomada`. `executarProcessHttp` calls this after a real HTTP
 * response; `recoverStuckProcessHttp` calls it with a synthetic timeout response for a row a
 * failure left stuck in `chamando` past its timeout.
 */
async function resumeCallOfProcessHttp(
  processoId: string,
  tenantId: string,
  resposta: RespostaDeHttp,
): Promise<{ recovered: boolean; novos: string[] }> {
  const novosProcessos: string[] = [];
  let recovered = false;
  await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{
      executionId: string; bloco_codigo: string; lista: CursorDeProcessHttp['lista'];
      indice: number; entrada: Record<string, unknown>; contexto: Record<string, string>;
      conversationId: string | null; contactId: string; channelId: string; inboxId: string; queueId: string | null;
      agentId: string | null; queueDefaultId: string | null;
    }>(sql`
      select p.execucao_id as "executionId", p.bloco_codigo, p.lista, p.indice, p.entrada, p.contexto,
             e.conversa_id as "conversationId", e.contato_id as "contactId", i.canal_id as "channelId", i.id as "inboxId", c.fila_id as "queueId", c.atendente_id as "agentId",
             i.fila_padrao_id as "queueDefaultId"
        from process_http_execucao p
        join execucao_fluxo e on e.id = p.execucao_id
        left join conversa c on c.id = e.conversa_id
        join fluxo_versao v on v.id = e.fluxo_versao_id
        join fluxo f on f.id = v.fluxo_id
        join inbox i on i.id = coalesce(c.inbox_id, e.inbox_id)
       where p.id = ${processoId} and p.estado = 'chamando'
       for update of p
    `);
    const p = rows[0];
    if (!p) return;
    recovered = true;
    await tx.execute(sql`
      update process_http_execucao set resposta = ${JSON.stringify(resposta)}::jsonb,
             estado = 'respondida', atualizado_em = now() where id = ${processoId}
    `);
    const publicado = await flowPublishedOfChannel(tx, p.channelId, p.contactId);
    if (!publicado) return;
    const retomada = await runFlowInInbound(tx, publicado, {
      tenantId,
      inboxId: p.inboxId,
      executionId: p.executionId,
      newExecution: false,
      queueDefaultId: p.queueDefaultId,
      conversation: p.conversationId
        ? { id: p.conversationId, queueId: p.queueId, agentId: p.agentId }
        : null,
      contactId: p.contactId,
      message: {
        id: typeof p.entrada['id'] === 'string' ? p.entrada['id'] : null,
        idProvedor: String(p.entrada['id_provedor'] ?? ''),
        type: String(p.entrada['tipo'] ?? 'texto'),
        content: typeof p.entrada['conteudo'] === 'string' ? p.entrada['conteudo'] : null,
      },
    }, {
      executionId: p.executionId,
      cursor: { lista: p.lista, estadoId: p.bloco_codigo || null, indice: p.indice, resposta },
      resposta,
    });
    if (retomada.processHttpId) novosProcessos.push(retomada.processHttpId);

    const { rows: messagesPending } = await tx.execute<{
      id: string; idProvider: string; type: string; content: string | null;
    }>(sql`
      select m.id, m.id_provedor as "idProvider", m.tipo as "type", m.conteudo as "content"
        from mensagem m
       where (m.execucao_id = ${p.executionId} or m.conversa_id = ${p.conversationId}::uuid) and m.direcao = 'entrada'
         and not exists (
           select 1 from execucao_passo ep
            where ep.execucao_id = ${p.executionId}
              and ep.entrada ->> 'id_provedor' = m.id_provedor
         )
       order by m.criada_em, m.id
    `);
    for (const mensagem of messagesPending) {
      const atual = await runFlowInInbound(tx, publicado, {
        tenantId,
        inboxId: p.inboxId,
        executionId: p.executionId,
        newExecution: false,
        queueDefaultId: p.queueDefaultId,
        conversation: p.conversationId
          ? { id: p.conversationId, queueId: null, agentId: null }
          : null,
        contactId: p.contactId,
        message: {
          id: mensagem.id,
          idProvedor: mensagem.idProvider,
          type: mensagem.type,
          content: mensagem.content,
        },
      });
      if (atual.processHttpId) novosProcessos.push(atual.processHttpId);
    }
    await tx.execute(sql`
      update process_http_execucao set estado = 'retomada', atualizado_em = now()
       where id = ${processoId}
    `);
  });
  return { recovered, novos: novosProcessos };
}

/** A new `ProcessHttp` suspension the sweep's resume produced, ready for `enfileirarProcessHttp`. */
export interface NewProcessHttp {
  tenantId: string;
  processoId: string;
}

/**
 * Periodic BullMQ sweep (D-26): a failure between claiming `process_http_execucao` (`chamando`)
 * and finishing the resume — network crash, worker restart, an unrelated bug — otherwise leaves
 * that row stuck forever, and `runFlowInInbound` blocks every new message from the same contact
 * while a `pendente`/`chamando` row exists (line ~210 above). Recover rows stuck past `limiteMs`
 * with a synthetic 408 timeout response, the same shape `executarProcessHttp` writes for a real
 * one, and return `{tenantId, processoId}` for any new `ProcessHttp` suspension the resume
 * produced (a sweep can recover rows from several tenants in one pass, so a bare id is not
 * enough for the caller to enqueue it correctly), the same way `consumirProcessHttp` chains a
 * normal resume.
 */
export async function recoverStuckProcessHttp(limiteMs: number): Promise<NewProcessHttp[]> {
  const { rows: presas } = await databaseOwner().execute<{
    id: string; tenant_id: string; atualizado_em: string;
  }>(sql`
    select id, tenant_id, atualizado_em from process_http_execucao
     where estado = 'chamando' and atualizado_em < now() - ${limiteMs}::bigint * interval '1 millisecond'
     order by atualizado_em
     limit 100
     for update skip locked
  `);

  const novosProcessos: NewProcessHttp[] = [];
  for (const linha of presas) {
    try {
      const { recovered, novos } = await resumeCallOfProcessHttp(linha.id, linha.tenant_id, {
        status: 408,
        corpo: '',
      });
      if (recovered) {
        for (const processoId of novos) novosProcessos.push({ tenantId: linha.tenant_id, processoId });
        console.error('[alert] process_http_stuck', {
          tenantId: linha.tenant_id,
          processoId: linha.id,
          desde: linha.atualizado_em,
        });
      }
    } catch (erro) {
      // A varredura não pode travar por causa de uma linha; registra e segue, como as demais varreduras.
      console.error(
        `[process-http-sweep] falhou ao recuperar ${linha.id}: ${(erro as Error).message}`,
      );
    }
  }
  return novosProcessos;
}

/** Map Pipe `mensagem.tipo` to the MIME value Blip places in `{{input.type}}`. */
const MIME_DO_TIPO: Readonly<Record<string, string>> = {
  texto: 'text/plain',
  template: 'text/plain',
  imagem: 'application/vnd.lime.media-link+json',
  audio: 'application/vnd.lime.media-link+json',
  video: 'application/vnd.lime.media-link+json',
  documento: 'application/vnd.lime.media-link+json',
  localizacao: 'application/vnd.lime.location+json',
};

/**
 * The `bloco` row of `stateId` when the contact is in the flow itself; null inside a subflow
 * (P12), whose blocks have no rows and whose ids (`onboarding`, `fallback`) repeat the flow's.
 */
function blockOfFlowState(
  variables: Record<string, string>,
  flow: FlowBlip,
  blockByCode: Map<string, string>,
  stateId: string | null | undefined,
): string | null {
  if (!stateId || activeFlowSession(variables, flow).subflow) return null;
  return blockByCode.get(stateId) ?? null;
}

/** The contact is not inside a subflow and has no saved state, or waits at the root block: its next message starts over. */
function startsAtRoot(variables: Record<string, string>, flow: FlowBlip): boolean {
  if (activeFlowSession(variables, flow).subflow) return false;
  const saved = stateSaved(variables, flow.id);
  return saved === null || saved === flow.states.find((s) => s.root)?.id;
}

/**
 * Start of a pass: the earlier of the opening message's own time (the channel's clock) and now (ours), so skew between the two never leaves the pass's first bot reply out. Without a stored message (redirect), now.
 */
async function passStartOf(tx: TransactionPipe, messageId: string | null): Promise<Date> {
  const now = new Date();
  if (!messageId) return now;
  const { rows } = await tx.execute<{ em: Date }>(sql`select criada_em as em from mensagem where id = ${messageId} limit 1`);
  const em = rows[0] ? new Date(rows[0].em) : null;
  return em && em < now ? em : now;
}

function parsePassStart(value: string | undefined): Date | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Bloco atual e anterior de uma mensagem do bot, para agrupar por bloco e achar onde a pessoa
 * travou. A Blip (`stateTrack`) é só régua de comportamento. Em subfluxo não há linha em `bloco`:
 * o id fica nulo e o nome guarda o código do estado.
 */
interface BlockStamp {
  currentId: string | null;
  currentName: string | null;
  /** Código (stateId do Builder): estável entre versões publicadas e gravado também dentro de subfluxo. */
  currentCode: string | null;
  previousId: string | null;
  previousName: string | null;
  previousCode: string | null;
}

function blockStamp(
  variables: Record<string, string>,
  flow: FlowBlip,
  blockByCode: Map<string, string>,
  blockNameByCode: Map<string, string>,
): BlockStamp {
  const name = (code: string | undefined): string | null =>
    code ? (activeFlowSession(variables, flow).subflow ? code : (blockNameByCode.get(code) ?? code)) : null;
  const current = variables[`stateId@${flow.id}`];
  const previous = variables[`previous-stateId@${flow.id}`];
  return {
    currentId: blockOfFlowState(variables, flow, blockByCode, current),
    currentName: name(current),
    currentCode: current ?? null,
    previousId: blockOfFlowState(variables, flow, blockByCode, previous),
    previousName: name(previous),
    previousCode: previous ?? null,
  };
}

async function saveExecution(
  tx: TransactionPipe,
  executionId: string,
  variables: Record<string, string>,
  flowId: string,
  blockByCode: Map<string, string>,
  transferida: boolean,
): Promise<void> {
  const estado = stateSaved(variables, flowId);
  // Without saved state, the next contact starts at the root; after transfer, the conversation belongs to a human.
  const concluida = transferida || estado === null;
  await tx.execute(sql`
    update execucao_fluxo
       set contexto = ${JSON.stringify(variables)}::jsonb,
           bloco_atual_id = ${estado ? (blockByCode.get(estado) ?? null) : null},
           bloco_anterior_id = ${(blockByCode.get(variables[`previous-stateId@${flowId}`] ?? '') ?? null)},
           bloco_anterior_codigo = ${variables[`previous-stateId@${flowId}`] ?? null},
           estado = ${concluida ? 'concluida' : 'aguardando'},
           encerrada_em = ${concluida ? sql`now()` : null}
     where id = ${executionId}
  `);
}

/** Cada estado visitado vira um passo; o primeiro leva a entrada (e o `id_provedor`). */
async function gravarPassos(
  tx: TransactionPipe,
  tenantId: string,
  execucaoId: string,
  rastro: InboundTrace,
  blocoPorCodigo: Map<string, string>,
  entrada: Record<string, unknown>,
  eventos: Record<string, unknown>[],
  relogio: () => Date,
): Promise<void> {
  const estados = rastro.estados.length > 0 ? rastro.estados : [{ stateId: '', actions: [] }];
  for (const [i, passo] of estados.entries()) {
    const ultimo = i === estados.length - 1;
    const saida = {
      acoes: passo.actions,
      proximo: 'proximoEstadoId' in passo ? (passo.proximoEstadoId ?? null) : null,
      // A subflow block (P12) has no `bloco` row: the step names its block and subflow here.
      ...(passo.subflow ? { subfluxo: passo.subflow, estado: passo.stateId } : {}),
      ...(i === 0 && rastro.actionsGlobal.length > 0 ? { acoesGlobais: rastro.actionsGlobal } : {}),
      ...(ultimo && eventos.length > 0 ? { eventos } : {}),
    };
    const error =
      ('erro' in passo ? passo.erro : undefined) ?? (ultimo ? rastro.error : undefined) ?? null;
    await tx.execute(sql`
      insert into execucao_passo (tenant_id, execucao_id, bloco_id, entrada, saida, erro, em)
      values (
        ${tenantId}, ${execucaoId}, ${passo.subflow ? null : (blocoPorCodigo.get(passo.stateId) ?? null)},
        ${i === 0 ? JSON.stringify(entrada) : null}::jsonb, ${JSON.stringify(saida)}::jsonb,
        ${error}, ${relogio()}
      )
    `);
  }
}

/**
 * Move the conversation from bot control into a queue (`enterQueue`; `queueId` null lets the attendance rules, then the inbox default, decide). This is when attendance begins: write `criada` and `enfileirada` NOW, not when the bot started. Queue time and first-response time start at `criada` (`@pipe/core`, `marcosDaConversa`); including bot time would charge the team for the robot conversation. In Blip too, the ticket is created only at handoff.
 */
async function transbordar(
  tx: TransactionPipe,
  e: InboundInFlow,
  executionId: string,
  flowId: string | null,
  queueId: string | null,
  variaveis: Record<string, string>,
  motivo: string | null,
  em: Date,
  requireQueue = false,
  extrasOverlay: Record<string, unknown> | null = null,
): Promise<string> {
  // The ticket is born here (D-15). An open one (existing, or created earlier in this run) is reused.
  let ticketId = e.conversation?.id ?? null;
  if (!ticketId) {
    const { rows } = await tx.execute<{ id: string }>(sql`
      select c.id from execucao_fluxo x join conversa c on c.id = x.conversa_id
       where x.id = ${executionId} and x.tenant_id = ${e.tenantId} and c.estado in ${sql.raw(SQL_STATES_ACTIVE)}
    `);
    ticketId = rows[0]?.id ?? null;
  }
  const tags = variaveis[PENDING_TAGS] ? (JSON.parse(variaveis[PENDING_TAGS]) as string[]) : [];
  if (!ticketId) {
    const { rows: ultima } = await tx.execute<{ id: string; em: Date; autor: string; entrada: Date | null; entradaId: string | null }>(sql`
      select id, criada_em as em, autor_tipo as autor,
             (select max(criada_em) from mensagem where execucao_id = ${executionId} and direcao = 'entrada') as entrada,
             (select id from mensagem where execucao_id = ${executionId} and direcao = 'entrada' order by criada_em desc limit 1) as "entradaId"
        from mensagem where execucao_id = ${executionId} and tenant_id = ${e.tenantId}
       order by criada_em desc limit 1
    `);
    const last = ultima[0];
    const window = last?.entrada ? contactRegisterMessage(new Date(last.entrada), last.entradaId ?? undefined) : null;
    const priority = variaveis[PENDING_PRIORITY] ?? 'sem_prioridade';
    const { rows: criada } = await tx.execute<{ id: string }>(sql`
      insert into conversa (
        tenant_id, inbox_id, contato_id, fila_id, estado, prioridade, criada_em,
        ultima_mensagem_em, ultima_mensagem_de, janela_expira_em, janela_aberta_por_mensagem_id
      ) values (
        ${e.tenantId}, ${e.inboxId}, ${e.contactId}, null, 'Waiting', ${priority}, ${em},
        ${last ? new Date(last.em) : null}, ${last?.autor ?? null},
        ${window?.expiraEm ?? null}, ${window?.openByMessageId ?? null}
      )
      returning id
    `);
    ticketId = criada[0]!.id;
    await tx.execute(sql`update execucao_fluxo set conversa_id = ${ticketId} where id = ${executionId} and tenant_id = ${e.tenantId}`);
    // Adopt the bot history: only this pass's messages (since the contact entered at the root block) of this tenant that have no ticket yet. Earlier passes stay on the execution alone.
    const passStart = parsePassStart(variaveis[PASS_START]);
    await tx.execute(sql`
      update mensagem set conversa_id = ${ticketId}
       where execucao_id = ${executionId} and conversa_id is null and tenant_id = ${e.tenantId}
         ${passStart ? sql`and criada_em >= ${passStart}` : sql``}
    `);
    for (const name of tags) {
      const { rows } = await tx.execute<{ id: string }>(sql`
        insert into etiqueta (tenant_id, nome, escopo, atualizado_em)
        values (${e.tenantId}, ${name}, 'conversa', now())
        on conflict (tenant_id, nome) do update set atualizado_em = now()
        returning id
      `);
      await tx.execute(sql`
        insert into conversa_etiqueta (tenant_id, conversa_id, etiqueta_id, em)
        values (${e.tenantId}, ${ticketId}, ${rows[0]!.id}, now()) on conflict do nothing
      `);
    }
    await emitir(tx, e.tenantId, 'conversa.criada', { conversa_id: ticketId, contato_id: e.contactId, fila_id: null });
  }
  const id = ticketId;
  await enterQueue(tx, {
    tenantId: e.tenantId,
    conversationId: id,
    flowId,
    queueId,
    defaultQueueId: e.queueDefaultId,
    message: e.message.content,
    at: em,
    origin: 'fluxo',
    requireQueue: requireQueue,
    extrasOverlay,
    eventData: { origem: 'fluxo', ...(motivo ? { motivo } : {}) },
    beforeDistribution: async (destination) => {
      // Give the agent what the bot collected about the customer in the note shown by Desk.
      await tx.execute(sql`
        insert into nota_interna (tenant_id, conversa_id, corpo, em)
        values (${e.tenantId}, ${id}, ${summaryOfContext(variaveis, motivo)}, ${em})
      `);
      await emitir(tx, e.tenantId, 'conversa.estado_alterado', {
        conversa_id: id,
        estado: 'Waiting',
        fila_id: destination,
      });
    },
  });
  delete variaveis[PENDING_TAGS];
  delete variaveis[PENDING_PRIORITY];
  return id;
}

/** The emergency fallback must not abort the incoming message. Returns the ticket it created, if any. */
async function transbordarSemFalhar(
  tx: TransactionPipe,
  e: InboundInFlow,
  executionId: string,
  flowId: string | null,
  variaveis: Record<string, string>,
  motivo: string,
): Promise<string | undefined> {
  // Each attempt in a savepoint: a failed attempt leaves no half-created ticket behind.
  try {
    return await tx.transaction((sp) => transbordar(sp, e, executionId, flowId, null, variaveis, motivo, new Date(), true));
  } catch (erro) {
    console.error(`[fluxo] execução ${executionId} ficou sem fila: ${(erro as Error).message}`);
  }
  // No queue to go to (no rule, no inbox default): the ticket waits queueless for any agent.
  try {
    return await tx.transaction((sp) => transbordar(sp, e, executionId, flowId, null, variaveis, motivo, new Date(), false));
  } catch (falha) {
    console.error(`[fluxo] execução ${executionId} ficou com o bot: ${(falha as Error).message}`);
    return undefined;
  }
}

/** Variables collected by the bot, excluding engine control keys. */
export function summaryOfContext(variaveis: Record<string, string>, motivo: string | null): string {
  const linhas = Object.entries(variaveis)
    .filter(([k]) => !/^(previous-)?stateId@/.test(k) && !k.startsWith('desk_') && !k.startsWith('#') && !k.startsWith('pipe.ticket.') && k !== PASS_START && k !== CONTACT_EXTRAS)
    .map(([k, v]) => `- ${k}: ${v}`);
  return [
    motivo ? `Transferida pelo bot (${motivo}).` : 'Transferida pelo bot.',
    linhas.length > 0 ? 'O que ele coletou:' : 'O bot não coletou nenhuma informação.',
    ...linhas,
  ].join('\n');
}

/**
 * Bot reply: pending `mensagem` plus an outbox row, like every Pipe outbound message. The worker delivers it. The bot always speaks inside the service window because it replies only to the customer.
 */
async function gravarRespostaDoBot(
  tx: TransactionPipe,
  tenantId: string,
  where: { conversationId: string | null; executionId: string },
  texto: string | null,
  em: Date,
  /** `{ pergunta }` for a menu (the worker chooses buttons, a list, or text) or `{ midia }` for a media type. */
  data: Record<string, unknown> | null = null,
  tipo: TipoEnvio = 'texto',
  stamp: BlockStamp | null = null,
): Promise<void> {
  const categoria = classificarCusto({
    conteudo: 'texto_livre',
    withinWindow: true,
    categoriaTemplate: null,
  });
  const { rows } = await tx.execute<{ id: string }>(sql`
    insert into mensagem (
      tenant_id, conversa_id, execucao_id, direcao, autor_tipo, tipo, conteudo, estado_entrega, criada_em,
      dentro_da_janela, categoria_cobranca, dados,
      bloco_atual_id, bloco_atual_nome, bloco_atual_codigo,
      bloco_anterior_id, bloco_anterior_nome, bloco_anterior_codigo
    ) values (
      ${tenantId}, ${where.conversationId}, ${where.executionId}, 'saida', 'bot', ${tipo}, ${texto}, 'pendente', ${em}, true, ${categoria},
      ${data ? JSON.stringify(data) : null}::jsonb,
      ${stamp?.currentId ?? null}, ${stamp?.currentName ?? null}, ${stamp?.currentCode ?? null},
      ${stamp?.previousId ?? null}, ${stamp?.previousName ?? null}, ${stamp?.previousCode ?? null}
    )
    returning id
  `);
  const messageId = rows[0]?.id;
  if (!messageId) throw new Error('não gravou a resposta do bot');
  await tx.execute(sql`
    insert into outbox_mensagem (tenant_id, mensagem_id, estado) values (${tenantId}, ${messageId}, 'pendente')
  `);
  if (where.conversationId) {
    await tx.execute(sql`
      update conversa set ultima_mensagem_em = ${em}, ultima_mensagem_de = 'bot', atualizado_em = now()
       where id = ${where.conversationId}
    `);
    // A null `usuarioId` distinguishes bot output from agent output in metrics.
    await registrarEvento(tx, { tenantId, conversationId: where.conversationId, type: 'mensagem_saida', at: em });
  }
  await emitir(tx, tenantId, 'mensagem.criada', {
    mensagem_id: messageId,
    conversa_id: where.conversationId,
    execucao_id: where.executionId,
    direcao: 'saida',
    tipo,
    conteudo: texto,
  });
}

/**
 * Convert LIME content emitted by the flow into the text Pipe sends on WhatsApp today. A `select` menu becomes numbered options; the typing indicator is omitted. An unsupported type is an error: the engine action fails rather than sending a partial message.
 */
/**
 * Represent a `select` menu as a structured question so the worker can send buttons or a list (`interativo.ts` in `@pipe/workers/whatsapp`). Numbered `textoParaOCanal` remains the stored content and fallback.
 */
export function perguntaDoSelect(m: OutputMessage): { texto: string; opcoes: string[] } | null {
  if (m.tipo.toLowerCase() !== 'application/vnd.lime.select+json') return null;
  let conteudo = m.conteudo;
  if (typeof conteudo === 'string') {
    try {
      conteudo = JSON.parse(conteudo);
    } catch {
      return null;
    }
  }
  const menu = conteudo as { text?: string; options?: { text?: string }[] } | null;
  const opcoes = (menu?.options ?? []).map((o) => o.text ?? '');
  if (opcoes.length === 0) return null;
  return { texto: menu?.text ?? '', opcoes };
}

export function textForOChannel(m: OutputMessage): string | null {
  const tipo = m.tipo.toLowerCase();
  if (tipo === 'application/vnd.lime.chatstate+json') return null;
  let conteudo = m.conteudo;
  if (m.bruto && typeof conteudo === 'string' && tipo !== 'text/plain') {
    try {
      conteudo = JSON.parse(conteudo);
    } catch {
      // segue como texto; o tipo decide abaixo
    }
  }
  // The native satisfaction block (`newSurveyBlock`): the question goes to the customer as text
  // with the fixed 1-5 scale (D-06); the engine reads the reply in the block's input
  // (`interpretSatisfactionAnswer`).
  if (tipo === SURVEY_CONTENT_TYPE) {
    const pergunta = (conteudo as { question?: unknown } | null)?.question;
    if (typeof pergunta !== 'string' || !pergunta.trim()) {
      throw new Error("O campo 'question' é obrigatório na pesquisa de satisfação.");
    }
    return `${pergunta.trim()}\n1 2 3 4 5`;
  }
  if (tipo === 'text/plain')
    return typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo);
  if (tipo === 'application/vnd.lime.select+json') {
    const menu = conteudo as { text?: string; options?: { text?: string; order?: number }[] };
    const opcoes = (menu.options ?? []).map((o, i) => `${o.order ?? i + 1}. ${o.text ?? ''}`);
    return [menu.text ?? '', ...opcoes].filter((l) => l !== '').join('\n');
  }
  if (tipo === 'application/vnd.lime.input+json') {
    return ((conteudo as { text?: string } | null)?.text ?? 'Envie sua localização.');
  }
  if (tipo === 'application/vnd.lime.web-link+json') {
    const link = conteudo as { uri?: string; text?: string } | null;
    if (!link?.uri) throw new Error("O campo 'uri' é obrigatório no web link.");
    confirmarUrlSegura(link.uri);
    return [link.text ?? '', link.uri].filter(Boolean).join('\n');
  }
  throw new Error(`O canal do Pipe ainda não envia conteúdo do tipo '${m.tipo}'.`);
}

const MEDIA_LINK = 'application/vnd.lime.media-link+json';

/**
 * `media-link` (figurinha/áudio/imagem/vídeo/documento, `ref/inventario-conteudo.md`) does not carry a category field: Blip does not distinguish them beyond the file's real MIME either, so this reads the same category the engine's `engineContentErrors` (`@pipe/core`) uses to validate at publish time.
 */
function categoryOfMedia(mime: string): 'imagem' | 'audio' | 'video' | 'documento' {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'imagem';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  return 'documento';
}

export interface ChannelOutput {
  tipo: TipoEnvio;
  texto: string | null;
  dados: Record<string, unknown> | null;
}

const HTTP_CONTENT_TYPE = 'application/vnd.pipe.http-content+json';
const DYNAMIC_CONTENT_TYPE = 'application/vnd.pipe.dynamic-content+json';
const MAX_DYNAMIC_CONTENT_BYTES = 1_048_576;
const CHANNEL_CONTENT_TYPES = new Set([
  'text/plain',
  'application/vnd.lime.select+json',
  'application/vnd.lime.media-link+json',
  'application/vnd.lime.chatstate+json',
  'application/vnd.lime.input+json',
  'application/vnd.lime.location+json',
  'application/vnd.lime.web-link+json',
]);

type DynamicResolverOptions = {
  callHttp?: typeof chamarComMtls;
  /** The sending action's deadline: the HTTP content request is aborted with it. */
  signal?: AbortSignal;
};
type DynamicLimeDocument = { type?: unknown; content?: unknown; metadata?: unknown };

/** Resolve the two Pipe-only Builder envelopes before the normal channel serializer sees them. */
export async function resolveDynamicContent(
  message: OutputMessage,
  tenantId: string,
  options: DynamicResolverOptions = {},
): Promise<OutputMessage> {
  const type = message.tipo.toLowerCase();
  if (type === HTTP_CONTENT_TYPE) {
    const content = (message.conteudo ?? {}) as {
      uri?: unknown;
      type?: unknown;
      headers?: unknown;
      requestTimeout?: unknown;
    };
    const uri = typeof content.uri === 'string' ? content.uri.trim() : '';
    const resolvedType = typeof content.type === 'string' ? content.type.trim().toLowerCase() : '';
    if (!uri) throw new Error("O campo 'uri' é obrigatório no Conteúdo HTTP.");
    if (!CHANNEL_CONTENT_TYPES.has(resolvedType)) {
      throw new Error(`O Conteúdo HTTP resolveu um tipo que o canal não envia: '${resolvedType || '(vazio)'}'.`);
    }
    confirmarUrlSegura(uri);
    const headers: Record<string, string> = {};
    if (content.headers && typeof content.headers === 'object' && !Array.isArray(content.headers)) {
      for (const [key, value] of Object.entries(content.headers)) {
        if (typeof value === 'string') headers[key] = value;
      }
    }
    const seconds = Number(content.requestTimeout);
    const timeoutMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : 60_000;
    try {
      const response = await (options.callHttp ?? chamarComMtls)(tenantId, uri, {
        metodo: 'GET', headers, timeoutMs, ...(options.signal ? { signal: options.signal } : {}),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.texto();
      if (Buffer.byteLength(body, 'utf8') > MAX_DYNAMIC_CONTENT_BYTES) {
        throw new Error('A resposta ultrapassa o limite de 1 MB.');
      }
      return { tipo: resolvedType, conteudo: body, bruto: true };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Conteúdo HTTP não pôde ser resolvido: ${detail}`);
    }
  }
  if (type !== DYNAMIC_CONTENT_TYPE) return message;
  if (typeof message.conteudo !== 'string') {
    throw new Error('O Conteúdo dinâmico precisa conter um JSON LIME válido.');
  }
  let resolved: DynamicLimeDocument;
  try {
    resolved = JSON.parse(message.conteudo) as DynamicLimeDocument;
  } catch {
    throw new Error('O Conteúdo dinâmico precisa conter um JSON LIME válido.');
  }
  const resolvedType = typeof resolved.type === 'string' ? resolved.type.toLowerCase() : '';
  if (!CHANNEL_CONTENT_TYPES.has(resolvedType)) {
    throw new Error(`O Conteúdo dinâmico resolveu um tipo que o canal não envia: '${resolvedType || '(vazio)'}'.`);
  }
  return {
    tipo: resolvedType,
    conteudo: resolved.content,
    metadados: resolved.metadata && typeof resolved.metadata === 'object' && !Array.isArray(resolved.metadata)
      ? resolved.metadata as Record<string, string>
      : null,
    bruto: true,
  };
}

/**
 * Convert what the flow emits into what a channel worker sends. Text and menu delegate to `textForOChannel`/`perguntaDoSelect`, unchanged from before this type existed. `media-link` becomes the media category with the pointer in `dados.midia`; the URL passes through the same SSRF guard as every other outbound URL in this module before it is ever stored. Returns `null` for content that sends nothing (typing).
 */
export function toChannelOutput(message: OutputMessage): ChannelOutput | null {
  const tipo = message.tipo.toLowerCase();
  // `SendRawMessage` carries any LIME document as serialized text: parse it once so every type
  // below (location, web-link, …) sees the same object a `SendMessage` would.
  let m = message;
  if (m.bruto && typeof m.conteudo === 'string' && tipo !== 'text/plain') {
    try {
      m = { ...m, conteudo: JSON.parse(m.conteudo) as unknown };
    } catch {
      // Not JSON: the type-specific checks below reject it with their own message.
    }
  }
  if (tipo === 'application/vnd.lime.location+json') {
    const content = m.conteudo as { latitude?: unknown; longitude?: unknown } | null;
    if (typeof content?.latitude !== 'number' || typeof content.longitude !== 'number') {
      throw new Error("Os campos 'latitude' e 'longitude' são obrigatórios na localização.");
    }
    return { tipo: 'localizacao', texto: null, dados: { localizacao: { latitude: content.latitude, longitude: content.longitude } } };
  }
  if (m.tipo.toLowerCase() === MEDIA_LINK) {
    let conteudo = m.conteudo;
    if (typeof conteudo === 'string') {
      try {
        conteudo = JSON.parse(conteudo);
      } catch {
        throw new Error('O conteúdo de mídia do bot não é um JSON válido.');
      }
    }
    const c = (conteudo ?? {}) as {
      uri?: unknown;
      type?: unknown;
      title?: unknown;
      text?: unknown;
    };
    const uri = typeof c.uri === 'string' ? c.uri : '';
    if (!uri) throw new Error("O campo 'uri' é obrigatório no conteúdo de mídia.");
    confirmarUrlSegura(uri);
    const mimeReal = typeof c.type === 'string' && c.type ? c.type : 'application/octet-stream';
    return {
      tipo: categoryOfMedia(mimeReal),
      texto: null,
      dados: {
        midia: {
          url: uri,
          mime: mimeReal,
          titulo: typeof c.title === 'string' ? c.title : null,
          nomeArquivo: typeof c.text === 'string' ? c.text : null,
        },
      },
    };
  }
  const texto = textForOChannel(m);
  if (texto === null) return null;
  const pergunta = perguntaDoSelect(m);
  const webLink = tipo === 'application/vnd.lime.web-link+json'
    ? { uri: (m.conteudo as { uri?: string } | null)?.uri ?? '' }
    : null;
  return { tipo: 'texto', texto, dados: pergunta ? { pergunta } : webLink ? { webLink } : null };
}

/**
 * The engine's `application.*`/`tunnel.*` identity: the flow's short name (Blip's bot identifier) and,
 * for a router service, the router's. Scoped by id and RLS, like `loadFlowResources`.
 */
export async function loadApplicationIdentity(
  tx: TransactionPipe,
  flowId: string,
  routerId: string | null = null,
): Promise<NonNullable<Context['application']>> {
  const { rows } = await tx.execute<{ identifier: string; routerIdentifier: string | null }>(sql`
    select f.short_name as identifier,
           (select r.short_name from fluxo r where r.id = ${routerId}::uuid) as "routerIdentifier"
      from fluxo f
     where f.id = ${flowId}::uuid
  `);
  return rows[0] ?? { identifier: flowId, routerIdentifier: null };
}

async function loadContact(
  tx: TransactionPipe,
  contactId: string,
  behindRouter: boolean,
  extrasOverlay: Record<string, unknown> | null = null,
): Promise<Record<string, unknown> | null> {
  const { rows } = await tx.execute<{
    name: string | null;
    phoneE164: string | null;
    email: string | null;
    atributos: Record<string, unknown> | null;
  }>(
    sql`select nome as "name", telefone_e164 as "phoneE164", email, atributos from contato where id = ${contactId} limit 1`,
  );
  const c = rows[0];
  // Use Blip `Contact` vocabulary because the imported flow expects it.
  return c
    ? {
        // Behind a router the subbot sees the tunnel form (03.1-ENSAIOS.md roteador.contact_identity_no_subbot).
        identity: behindRouter ? tunnelIdentity(contactId) : channelIdentity({ contactId, phone: c.phoneE164 }),
        name: c.name,
        phoneNumber: c.phoneE164,
        email: c.email,
        extras: extrasOverlay ?? c.atributos ?? {},
      }
    : null;
}

type RecentAttendance = {
  id: string;
  by: string | null;
  queueId: string | null;
  queueName: string | null;
  agentId: string | null;
  agentEmail: string | null;
  openDate: Date | null;
  closeDate: Date | null;
  tags: string[];
  sequentialId: number;
  parentSequentialId: number | null;
};

/**
 * The contact's last closed attendance session (`RLS` already scopes every row here to the
 * current tenant). Shared by `lastAttendance` (the `Ticket`
 * fed to the engine, D-12) and `recordSatisfactionAnswer` (which attendance the survey answer
 * evaluates, D-08.5).
 */
async function mostRecentClosedAttendance(
  tx: TransactionPipe,
  contatoId: string,
  conversationCurrentId: string | null,
): Promise<RecentAttendance | null> {
  const { rows } = await tx.execute<RecentAttendance>(sql`
    select c.id,
           (select ev.dados->>'encerrada_por' from evento_atendimento ev
             where ev.conversa_id = c.id and ev.tipo = 'encerrada'
             order by ev.em desc limit 1) as "by",
           c.fila_id as "queueId", q.nome as "queueName",
           c.atendente_id as "agentId", u.email as "agentEmail",
           c.criada_em as "openDate", c.encerrada_em as "closeDate",
           coalesce(
             (select array_agg(et.nome order by et.nome) from conversa_etiqueta ce
               join etiqueta et on et.id = ce.etiqueta_id where ce.conversa_id = c.id),
             '{}'
           ) as "tags",
           c.numero_sequencial::int as "sequentialId",
           (select p.numero_sequencial::int from conversa p
             where p.id = c.conversa_pai_id and p.tenant_id = c.tenant_id) as "parentSequentialId"
      from conversa c
      left join fila q on q.id = c.fila_id
      left join usuario u on u.id = c.atendente_id
     where c.contato_id = ${contatoId} and c.estado in ${sql.raw(SQL_STATES_CLOSED)} and (${conversationCurrentId}::uuid is null or c.id <> ${conversationCurrentId}::uuid)
     order by c.encerrada_em desc nulls last
     limit 1
  `);
  return rows[0] ?? null;
}

/** The contact's last closed attendance session, like the `Ticket` Blip sends to the bot. */
export async function lastAttendance(
  tx: TransactionPipe,
  contatoId: string,
  conversationCurrentId: string | null,
  executionId: string,
): Promise<{
  id: string;
  status: string;
  closed: true;
  tags: string[];
  team: string | null;
  agentIdentity: string | null;
  openDate: Date | null;
  closeDate: Date | null;
  closedBy: string | null;
  sequentialId: number | null;
  parentSequentialId: number | null;
}> {
  const recent = await mostRecentClosedAttendance(tx, contatoId, conversationCurrentId);
  return {
    id: recent?.id ?? executionId,
    status: STATUS_DO_TICKET[recent?.by ?? ''] ?? 'ClosedAttendant',
    closed: true,
    tags: recent?.tags ?? [],
    team: recent?.queueName ?? null,
    agentIdentity: recent?.agentEmail ?? null,
    openDate: recent?.openDate ?? null,
    closeDate: recent?.closeDate ?? null,
    closedBy: recent?.by ?? null,
    sequentialId: recent?.sequentialId ?? null,
    parentSequentialId: recent?.parentSequentialId ?? null,
  };
}

/**
 * The conversation as Blip's `Ticket` document (`blip-api-schemas.md`, Ticket), which the engine
 * exposes as `{{ticket.*}}` after `ForwardToDesk`/`CreateTicket`. Identities are Pipe ids (contact
 * id for the customer, agent e-mail for the agent); `sequentialId` is the tenant's `numero_sequencial`
 * (the number the Desk and the bridge show) and `parentSequentialId` the origin ticket of a transfer.
 */
export async function ticketOfConversation(
  tx: TransactionPipe,
  conversationId: string,
): Promise<{ id: string; [field: string]: unknown }> {
  const { rows } = await tx.execute<{
    id: string; state: string; contactId: string; team: string | null; agentIdentity: string | null;
    storageDate: string; statusDate: string; openDate: string | null; firstResponseDate: string | null; closeDate: string | null;
    priority: string; tags: string[]; sequentialId: number; parentSequentialId: number | null;
  }>(sql`
    select c.id, c.estado as state, c.contato_id as "contactId", q.nome as team,
           u.email as "agentIdentity",
           to_char(coalesce(
             (select min(ev.em) from evento_atendimento ev where ev.conversa_id = c.id and ev.tipo = 'criada'),
             c.criada_em) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "storageDate",
           to_char(coalesce(c.atualizado_em, c.criada_em) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "statusDate",
           to_char(c.atribuida_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "openDate",
           to_char(c.primeira_resposta_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "firstResponseDate",
           to_char(c.encerrada_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "closeDate",
           c.prioridade as priority,
           coalesce(
             (select array_agg(et.nome order by et.nome) from conversa_etiqueta ce
               join etiqueta et on et.id = ce.etiqueta_id where ce.conversa_id = c.id),
             '{}'
           ) as tags,
           c.numero_sequencial::int as "sequentialId",
           (select p.numero_sequencial::int from conversa p
             where p.id = c.conversa_pai_id and p.tenant_id = c.tenant_id) as "parentSequentialId"
      from conversa c
      left join fila q on q.id = c.fila_id
      left join usuario u on u.id = c.atendente_id
     where c.id = ${conversationId}
  `);
  const t = rows[0];
  if (!t) throw new Error('A conversa do atendimento não foi encontrada.');
  const status = t.state; // the stored state is already Blip's `TicketStatusEnum`
  return {
    id: t.id,
    sequentialId: t.sequentialId,
    parentSequentialId: t.parentSequentialId,
    customerIdentity: t.contactId,
    agentIdentity: t.agentIdentity,
    provider: 'Lime',
    status,
    team: t.team,
    storageDate: t.storageDate,
    openDate: t.openDate,
    statusDate: t.statusDate,
    firstResponseDate: t.firstResponseDate,
    closeDate: t.closeDate,
    closed: isClosedState(status),
    priority: t.priority,
    tags: t.tags,
    unreadMessages: 0,
  };
}

/** A timestamp that only moves forward: reply order follows `criada_em`. */
function relogioCrescente(): () => Date {
  let ultimo = 0;
  return () => {
    ultimo = Math.max(Date.now(), ultimo + 1);
    return new Date(ultimo);
  };
}


export interface ImportOfFlow {
  flowId: string;
  versaoId: string;
  version: number;
  publicado: boolean;
  report: ImportReport;
  /** The flow was stored, but the engine would refuse to run it; do not publish. */
  errorOfValidation: string | null;
}

/**
 * Pipe block type. Blip has no block type; this label serves only the screen and report, and the engine does not read it.
 */
export function classifyState(e: State): string {
  const tipos = [...(e.inputActions ?? []), ...(e.outputActions ?? [])].map((a) => a.type);
  if (
    e.id.startsWith('desk:') ||
    tipos.some((t) => t === 'ForwardToDesk' || t === 'CreateTicket')
  ) {
    return 'transferencia';
  }
  if (e.root) return 'inicio';
  if (e.input && !e.input.bypass) return 'pergunta';
  if (tipos.some((t) => t === 'SendMessage' || t === 'SendRawMessage')) return 'mensagem';
  if (tipos.includes('ProcessHttp')) return 'chamada_externa';
  if (tipos.some((t) => t.startsWith('ExecuteScript'))) return 'script';
  return 'condicao';
}

/**
 * Store a Blip flow, exported from the editor or published, as a new version. Preserve the editor's original state in `bloco.conteudo.original`, and report unsupported engine features by type. Publishing archives the previous published version and any other published flow on the same channel: one bot per number.
 */
export async function importFlowOfBlip(
  tx: TransactionPipe,
  pedido: {
    tenantId: string;
    name: string;
    channelId: string | null;
    json: unknown;
    publicar: boolean;
    /**
     * Blip exports each subflow separately (P12): each export here, keyed by the
     * `shortNameOfSubflow` its `subflow:` blocks use, is stored with the flow in the same version.
     * An export bundle may also carry them as `json.subflows`.
     */
    subflows?: Record<string, unknown>;
  },
): Promise<ImportOfFlow> {
  const { rows: existentes } = await tx.execute<{ id: string }>(sql`
    select id from fluxo where nome = ${pedido.name} and canal_id is not distinct from ${pedido.channelId} limit 1
  `);
  let flowId = existentes[0]?.id;
  if (!flowId) {
    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into fluxo (tenant_id, nome, canal_id, short_name)
      values (${pedido.tenantId}, ${pedido.name}, ${pedido.channelId}, ${nomeCurto(pedido.name)})
      returning id
    `);
    flowId = rows[0]!.id;
  }

  const flow = blipReadFlow(pedido.json, flowId);
  if (pedido.subflows && Object.keys(pedido.subflows).length > 0) {
    // Subflows live in `fluxo_versao.global.subflows`, written below with the rest of `global`.
    flow.subflows = { ...(flow.subflows ?? {}), ...blipReadSubflows(pedido.subflows) };
  }
  const original = ehExportDoEditor(pedido.json) ? pedido.json.flow : null;
  let errorOfValidation: string | null = null;
  try {
    validateFlow(flow);
  } catch (error) {
    errorOfValidation = (error as Error).message;
  }
  if (pedido.publicar && errorOfValidation) {
    throw new Error(`O fluxo não pode ser publicado: ${errorOfValidation}`);
  }

  const { rows: numero } = await tx.execute<{ version: number }>(
    sql`select coalesce(max(versao), 0) + 1 as version from fluxo_versao where fluxo_id = ${flowId}`,
  );
  const versao = Number(numero[0]?.version ?? 1);
  if (pedido.publicar) {
    await tx.execute(
      sql`update fluxo_versao set estado = 'arquivada' where fluxo_id = ${flowId} and estado = 'publicada'`,
    );
    await tx.execute(sql`
      update fluxo set estado = 'arquivado', atualizado_em = now()
       where canal_id = ${pedido.channelId} and id <> ${flowId} and estado = 'publicado'
    `);
    await tx.execute(
      sql`update fluxo set estado = 'publicado', atualizado_em = now() where id = ${flowId}`,
    );
  }

  // These belong to `Flow`, not a state: global actions, `configuration`, and version.
  const global: Record<string, unknown> = { ...flow };
  delete global['states'];
  delete global['id'];
  const { rows: criada } = await tx.execute<{ id: string }>(sql`
    insert into fluxo_versao (tenant_id, fluxo_id, versao, estado, publicada_em, global)
    values (
      ${pedido.tenantId}, ${flowId}, ${versao}, ${pedido.publicar ? 'publicada' : 'rascunho'},
      ${pedido.publicar ? new Date() : null}, ${JSON.stringify(global)}::jsonb
    )
    returning id
  `);
  const versaoId = criada[0]!.id;

  const blockByCode = new Map<string, string>();
  for (const state of flow.states) {
    const codigo = state.id;
    // ID and outputs have their own column and table (`codigo`, `transicao`); the remaining fields are state data.
    const conteudo: Record<string, unknown> = { ...state };
    delete conteudo['id'];
    delete conteudo['outputs'];
    const originalState = original?.[codigo];
    const nome =
      typeof state['name'] === 'string' && state['name'].trim() ? state['name'] : codigo;
    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into bloco (tenant_id, versao_id, codigo, nome, tipo, conteudo, posicao)
      values (
        ${pedido.tenantId}, ${versaoId}, ${codigo}, ${nome}, ${classifyState(state)},
        ${JSON.stringify(originalState ? { ...conteudo, original: originalState } : conteudo)}::jsonb,
        ${JSON.stringify(state['$position'] ?? {})}::jsonb
      )
      returning id
    `);
    blockByCode.set(codigo, rows[0]!.id);
  }

  for (const estado of flow.states) {
    for (const [i, saida] of (estado.outputs ?? []).entries()) {
      const variable = contextEhVariable(saida.stateId) ? saida.stateId : null;
      const para = variable ? null : (blockByCode.get(saida.stateId) ?? null);
      // An unknown destination is allowed only for an unpublished flow and already appears in validation errors.
      if (!variable && !para) continue;
      await tx.execute(sql`
        insert into transicao (tenant_id, versao_id, de_bloco_id, para_bloco_id, para_variavel, condicao, ordem)
        values (
          ${pedido.tenantId}, ${versaoId}, ${blockByCode.get(estado.id)!}, ${para}, ${variable},
          ${JSON.stringify(saida.conditions ? { conditions: saida.conditions } : {})}::jsonb, ${saida.order ?? i}
        )
      `);
    }
  }

  return {
    flowId,
    versaoId,
    version: versao,
    publicado: pedido.publicar,
    report: importReport(flow),
    errorOfValidation,
  };
}
