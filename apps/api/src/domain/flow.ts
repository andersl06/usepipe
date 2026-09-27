import { sql } from 'drizzle-orm';
import {
  EngineError,
  stateKey,
  classificarCusto,
  createInbound,
  ehExportDoEditor,
  contextEhVariable,
  stateSaved,
  blipReadFlow,
  processInbound,
  importReport,
  SuspensaoDeProcessHttp,
  validateFlow,
} from '@pipe/core';
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
import { distributeConversation } from './distribution.js';
import { registrarEvento } from './eventos.js';
import { evaluatePriority, loadRulesOfPriorityActive } from './management/priority-engine.js';
import { redirectInRouter, serviceOfRouter } from './router.js';
import { chamarComMtls } from './mtls.js';
import { confirmarUrlSegura } from './management/integrations.js';
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
 * The channel bot: a published router takes precedence over a directly connected flow (one bot per number) and resolves the contact's service. That is why the contact enters here.
 */
export async function flowPublishedOfChannel(
  tx: TransactionPipe,
  channelId: string,
  contatoId: string,
): Promise<FlowPublished | null> {
  const { rows: roteadores } = await tx.execute<{ id: string; tenant_id: string }>(sql`
    select id, tenant_id from fluxo
     where canal_id = ${channelId} and tipo = 'roteador' and estado = 'publicado'
     order by criado_em desc
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

type LineBlock = { id: string; code: string; content: Record<string, unknown> };
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
): Promise<{ flow: FlowBlip; blockByCode: Map<string, string> }> {
  const { rows: versions } = await tx.execute<{ global: Record<string, unknown> }>(
    sql`select global from fluxo_versao where id = ${publicado.versaoId}`,
  );
  const { rows: blocos } = await tx.execute<LineBlock>(
    sql`select id, codigo as code, conteudo as content from bloco where versao_id = ${publicado.versaoId}`,
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
  };
}

export interface InboundInFlow {
  tenantId: string;
  conversation: {
    id: string;
    /** Created by this message; only a new conversation starts a flow. */
    nova: boolean;
    queueId: string | null;
    agentId: string | null;
    queueDefaultId: string | null;
  };
  contactId: string;
  message: { id: string | null; idProvedor: string; type: string; content: string | null };
}

export interface ResultOfFlow {
  /** The bot handled the message; `false` follows the normal queue path. */
  tratou: boolean;
  /** Number of replies written to the outbox, used to nudge delivery after commit. */
  respostas: number;
  processHttpId?: string;
}

const NAO_TRATOU: ResultOfFlow = { tratou: false, respostas: 0 };

type LineExecution = {
  id: string;
  flowVersionId: string;
  flowId: string;
  context: Record<string, string>;
};

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
  if (conversation.agentId && !retomada) return NAO_TRATOU;

  // `for update`: duas mensagens do mesmo cliente ao mesmo tempo andam uma de cada vez.
  const { rows: executions } = await tx.execute<LineExecution>(sql`
    select e.id, e.fluxo_versao_id as "flowVersionId", v.fluxo_id as "flowId",
           e.contexto as context from execucao_fluxo e
      join fluxo_versao v on v.id = e.fluxo_versao_id
     where e.conversa_id = ${conversation.id}
     order by e.iniciada_em desc
     limit 1
     for update of e
  `);
  let execution = executions[0] ?? null;

  if (execution && !retomada) {
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
  if (conversation.queueId && !retomada) return NAO_TRATOU;
  if (!execution && (!conversation.nova || !publicado) && !retomada) return NAO_TRATOU;

  if (!publicado) {
    // If the conversation belonged to the bot but its flow was unpublished, move it to the queue rather than leave it silent.
    await transbordarSemFalhar(tx, e, execution?.context ?? {}, 'o fluxo do canal saiu do ar');
    return { tratou: true, respostas: 0 };
  }

  const roteador = publicado.router ?? null;
  if (execution && execution.flowId !== publicado.flowId) {
    // The router sent the contact to another service; end the prior execution here.
    await tx.execute(sql`
      update execucao_fluxo set estado = 'concluida', encerrada_em = now() where id = ${execution.id}
    `);
    execution = null;
  }

  // Only a new conversation receives the `Ticket` from the closed attendance session.
  const nova = execution === null && conversation.nova;
  if (!execution) {
    // Context belongs to the CONTACT, as in Blip: the new conversation inherits what the bot knew.
    const { rows: anteriores } = await tx.execute<{ contexto: Record<string, string> }>(sql`
      select e.contexto from execucao_fluxo e
        join fluxo_versao v on v.id = e.fluxo_versao_id
       where e.contato_id = ${e.contactId} and v.fluxo_id = ${publicado.flowId}
       order by e.iniciada_em desc
       limit 1
    `);
    const { rows: criada } = await tx.execute<LineExecution>(sql`
      insert into execucao_fluxo (tenant_id, fluxo_versao_id, conversa_id, contato_id, estado, contexto)
      values (
        ${e.tenantId}, ${publicado.versaoId}, ${conversation.id}, ${e.contactId}, 'executando',
        ${JSON.stringify(anteriores[0]?.contexto ?? {})}::jsonb
      )
      returning id, fluxo_versao_id as "flowVersionId",
                ${publicado.flowId}::uuid as "flowId", contexto as context
    `);
    execution = criada[0]!;
  } else if (execution.flowVersionId !== publicado.versaoId) {
    // If a new version is published during a conversation, retain the same context. A state
    // that no longer exists falls back to root, as `FlowManager` does.
    await tx.execute(
      sql`update execucao_fluxo set fluxo_versao_id = ${publicado.versaoId} where id = ${execution.id}`,
    );
  }
  const executionId = execution.id;

  const { flow, blockByCode } = await loadFlow(tx, publicado);
  // With shared router context, variables are scoped to the router-contact pair.
  const variables: Record<string, string> = {
    ...(roteador?.sharesContext ? roteador.contexto : execution.context),
  };
  if (roteador?.reiniciar) {
    // Apply Change-User-State after Master-State: the destination starts at the requested block or at root.
    if (roteador.blockInitial) variables[stateKey(flow.id)] = roteador.blockInitial;
    else delete variables[stateKey(flow.id)];
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
  const contact = await loadContact(tx, e.contactId);
  const relogio = relogioCrescente();
  const eventos: Record<string, unknown>[] = [];
  let respostas = 0;
  let transferida = false;
  let processHttpId: string | undefined;

  const servicos: ServicosDoMotor = {
    send: async (m) => {
      const saida = toChannelOutput(m);
      if (saida === null) return;
      await gravarRespostaDoBot(
        tx,
        e.tenantId,
        conversation.id,
        saida.texto,
        relogio(),
        saida.dados,
        saida.tipo,
      );
      respostas += 1;
    },
    forwardForAttendance: async ({ settings }) => {
      const queueId =
        typeof settings?.['filaId'] === 'string' ? settings['filaId'] : conversation.queueDefaultId;
      await transbordar(tx, e, queueId, variables, null, relogio());
      transferida = true;
      return { id: conversation.id, status: 'Waiting' };
    },
    registerEvent: async (evento) => {
      eventos.push(evento);
    },
    mergeContact: async (fields) => {
      const updates: ReturnType<typeof sql>[] = [];
      const extras: Record<string, unknown> = {};
      const textColumns: Record<string, string> = {
        name: 'nome',
        email: 'email',
        phoneNumber: 'telefone_e164',
        taxDocument: 'documento',
      };
      for (const [key, column] of Object.entries(textColumns)) {
        if (Object.prototype.hasOwnProperty.call(fields, key)) {
          updates.push(sql`${sql.raw(column)} = ${fields[key] ?? null}`);
        }
      }
      for (const key of ['city', 'gender']) {
        if (Object.prototype.hasOwnProperty.call(fields, key)) extras[key] = fields[key];
      }
      if (fields.extras && typeof fields.extras === 'object' && !Array.isArray(fields.extras)) {
        Object.assign(extras, fields.extras);
      }
      if (Object.keys(extras).length > 0) {
        updates.push(sql`atributos = coalesce(atributos, '{}'::jsonb) || ${JSON.stringify(extras)}::jsonb`);
      }
      if (updates.length === 0) return;
      // The execution is already inside noTenant; the id is deliberately the current
      // execution contact, so a flow setting contact_id cannot cross tenant boundaries.
      await tx.execute(sql`update contato set ${sql.join(updates, sql`, `)}, atualizado_em = now()
        where id = ${e.contactId}`);
    },
    recordSatisfactionAnswer: async (answer) => {
      const recent = await mostRecentClosedAttendance(tx, e.contactId, conversation.id);
      const blockId = variables[stateKey(flow.id)] ?? null;
      await tx.execute(sql`
        insert into pesquisa_satisfacao_resposta (
          tenant_id, conversa_id, conversa_atendimento_id, fluxo_bloco_id, fila_id,
          atendente_id, contato_id, nota, comentario, estado, respondida_em
        ) values (
          ${e.tenantId}, ${conversation.id}, ${recent?.id ?? null}, ${blockId},
          ${recent?.queueId ?? null}, ${recent?.agentId ?? null}, ${e.contactId},
          ${answer.rating}, ${answer.comment}, ${answer.status},
          ${answer.status === 'sem_resposta' ? null : relogio()}
        )
      `);
    },
    callHttp: async (pedido: PedidoDeHttp) => {
      confirmarUrlSegura(pedido.url);
      try {
        const resposta = await chamarComMtls(e.tenantId, pedido.url, {
          metodo: pedido.metodo,
          headers: pedido.cabecalhos,
          body: pedido.corpo,
          // Future work: this call still runs INSIDE the inbound transaction, holding a
          // database connection; outside the transaction, the source `requestTimeout` is 60 s.
          timeoutMs: pedido.timeoutMs,
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
          corpo: JSON.stringify({ error: timeout ? 'timeout' : 'network_error', message: message }),
        };
      }
    },
    suspendHttp: async (pedido, cursor) => {
      confirmarUrlSegura(pedido.url);
      const key = `${executionId}:${e.message.idProvedor}:${cursor.estadoId ?? 'global'}:${cursor.lista}:${cursor.indice}`;
      const { rows } = await tx.execute<{ id: string }>(sql`
        insert into process_http_execucao (
          tenant_id, execucao_id, chave, bloco_id, bloco_codigo, lista, indice,
          entrada, contexto, pedido, estado
        ) values (
          ${e.tenantId}, ${executionId}, ${key},
          ${cursor.estadoId ? (blockByCode.get(cursor.estadoId) ?? null) : null},
          ${cursor.estadoId ?? ''}, ${cursor.lista}, ${cursor.indice},
          ${JSON.stringify({
            id: e.message.id,
            id_provedor: e.message.idProvedor,
            tipo: e.message.type,
            conteudo: e.message.content,
          })}::jsonb,
          ${JSON.stringify(variables)}::jsonb, ${JSON.stringify(pedido)}::jsonb, 'pendente'
        )
        on conflict (execucao_id, chave) do nothing
        returning id
      `);
      processHttpId = rows[0]?.id;
      // O cursor fica committed antes de liberar a chamada externa.
      throw new SuspensaoDeProcessHttp(pedido, cursor);
    },
    // The Redirect `context` is not delivered as the destination's first input;
    // the destination starts on the next customer message. Delivering it immediately would require running the destination flow engine here.
    // destino aqui dentro, com o fluxo dele carregado.
    ...(roteador
      ? {
          redirect: async ({ endereco }: { endereco: string }) => {
            await redirectInRouter(tx, {
              tenantId: e.tenantId,
              routerId: roteador.id,
              contactId: e.contactId,
              service: endereco,
            });
          },
        }
      : {}),
  };

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
                 bloco_atual_id = ${erro.cursor.estadoId ? (blockByCode.get(erro.cursor.estadoId) ?? null) : null}
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
      if (!transferida)
        await transbordarSemFalhar(tx, e, variables, `o fluxo falhou: ${erro.message}`);
      return false;
    }
  };

  // Numa retomada a entrada é a MESMA da suspensão original — `execucao_passo` já
  // gravou aquele `id_provedor` (fluxo.ts:440-450). Repeti-lo aqui violaria
  // `execucao_passo_entrada_uk` (a proteção contra webhook duplicado da Meta,
  // migration 0014), então uma retomada nunca inclui `id_provedor` de novo.
  let idProvedorUsado = Boolean(retomada);
  const stateBefore = stateSaved(variables, flow.id);
  if (nova && stateBefore?.startsWith('desk:') && flow.states.some((s) => s.id === stateBefore)) {
    const ticket = await lastAttendance(tx, e.contactId, conversation.id);
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
    if (!certo) return { tratou: true, respostas };
    // The bot stopped after replying to the customer; the next customer message wakes it.
    // After returning to the root or leaving the flow, treat this message as the first input, as Blip does.
    const depois = stateSaved(variables, flow.id);
    if (depois !== null && depois !== flow.states.find((s) => s.root)?.id) {
      await saveExecution(tx, executionId, variables, flow.id, blockByCode, transferida);
      await saveContextOfRouter();
      return { tratou: true, respostas };
    }
  }

  const certo = await rodar(
    {
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
  return { tratou: true, respostas, ...(processHttpId ? { processHttpId } : {}) };
}

/** Perform HTTP outside the transaction, then resume the saved cursor in a second transaction. */
export async function executarProcessHttp(processoId: string): Promise<string[]> {
  type Linha = {
    id: string; tenant_id: string; executionId: string; state: string;
    pedido: PedidoDeHttp; inbound: Record<string, unknown>; blockCode: string;
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

  confirmarUrlSegura(encontrado.pedido.url);
  let resposta: RespostaDeHttp;
  try {
    const r = await chamarComMtls(encontrado.tenant_id, encontrado.pedido.url, {
      metodo: encontrado.pedido.metodo,
      headers: encontrado.pedido.cabecalhos,
      body: encontrado.pedido.corpo,
      timeoutMs: encontrado.pedido.timeoutMs,
    });
    const limite = Number(process.env['PIPE_PROCESS_HTTP_MAX_RESPOSTA_BYTES'] ?? 1_048_576);
    resposta = { status: r.status, corpo: (await r.texto()).slice(0, limite) };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
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
      conversationId: string; contactId: string; channelId: string; queueId: string | null;
      agentId: string | null; queueDefaultId: string | null;
    }>(sql`
      select p.execucao_id as "executionId", p.bloco_codigo, p.lista, p.indice, p.entrada, p.contexto,
             e.conversa_id as "conversationId", e.contato_id as "contactId", f.canal_id as "channelId", c.fila_id as "queueId", c.atendente_id as "agentId",
             i.fila_padrao_id as "queueDefaultId"
        from process_http_execucao p
        join execucao_fluxo e on e.id = p.execucao_id
        join conversa c on c.id = e.conversa_id
        join fluxo_versao v on v.id = e.fluxo_versao_id
        join fluxo f on f.id = v.fluxo_id
        join inbox i on i.id = c.inbox_id
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
      conversation: {
        id: p.conversationId, nova: false, queueId: p.queueId,
        agentId: p.agentId, queueDefaultId: p.queueDefaultId,
      },
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
       where m.conversa_id = ${p.conversationId} and m.direcao = 'entrada'
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
        conversation: {
          id: p.conversationId, nova: false, queueId: null,
          agentId: null, queueDefaultId: p.queueDefaultId,
        },
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
      ...(i === 0 && rastro.actionsGlobal.length > 0 ? { acoesGlobais: rastro.actionsGlobal } : {}),
      ...(ultimo && eventos.length > 0 ? { eventos } : {}),
    };
    const error =
      ('erro' in passo ? passo.erro : undefined) ?? (ultimo ? rastro.error : undefined) ?? null;
    await tx.execute(sql`
      insert into execucao_passo (tenant_id, execucao_id, bloco_id, entrada, saida, erro, em)
      values (
        ${tenantId}, ${execucaoId}, ${blocoPorCodigo.get(passo.stateId) ?? null},
        ${i === 0 ? JSON.stringify(entrada) : null}::jsonb, ${JSON.stringify(saida)}::jsonb,
        ${error}, ${relogio()}
      )
    `);
  }
}

/**
 * Move the conversation from bot control into a queue. This is when attendance begins: write `criada` and `enfileirada` NOW, not when the bot started. Queue time and first-response time start at `criada` (`@pipe/core`, `marcosDaConversa`); including bot time would charge the team for the robot conversation. In Blip too, the ticket is created only at handoff.
 */
async function transbordar(
  tx: TransactionPipe,
  e: InboundInFlow,
  queueId: string | null,
  variaveis: Record<string, string>,
  motivo: string | null,
  em: Date,
): Promise<void> {
  if (!queueId)
    throw new Error('A inbox do canal não tem fila padrão: o bot não tem para onde transferir.');
  const { rows } = await tx.execute<{ id: string }>(sql`
    update conversa set fila_id = ${queueId}, estado = 'na_fila', atualizado_em = now()
     where id = ${e.conversation.id} and atendente_id is null and fila_id is null
    returning id
  `);
  if (!rows[0]) return;

  // The conversation has just entered the queue; the `update` above changes a row only once
  // because its condition requires `fila_id is null`. This is the only time
  // to assess its priority. See the Pipe decision in `gestao/prioridade-motor.ts`.
  const rulesOfPriority = await loadRulesOfPriorityActive(tx);
  if (rulesOfPriority.length > 0) {
    const nivel = evaluatePriority(rulesOfPriority, {
      queueId,
      message: e.message.content,
    });
    if (nivel) {
      await tx.execute(sql`
        update conversa set prioridade = ${nivel}, atualizado_em = now() where id = ${e.conversation.id}
      `);
    }
  }

  const data = { origem: 'fluxo', ...(motivo ? { motivo } : {}) };
  await registrarEvento(tx, {
    tenantId: e.tenantId,
    conversationId: e.conversation.id,
    type: 'criada',
    at: em,
    queueId,
    data,
  });
  await registrarEvento(tx, {
    tenantId: e.tenantId,
    conversationId: e.conversation.id,
    type: 'enfileirada',
    at: em,
    queueId,
    data,
  });
  // Give the agent what the bot collected about the customer in the note shown by Desk.
  await tx.execute(sql`
    insert into nota_interna (tenant_id, conversa_id, corpo, em)
    values (${e.tenantId}, ${e.conversation.id}, ${summaryOfContext(variaveis, motivo)}, ${em})
  `);
  await emitir(tx, e.tenantId, 'conversa.estado_alterado', {
    conversa_id: e.conversation.id,
    estado: 'na_fila',
    fila_id: queueId,
  });
  await distributeConversation(tx, e.tenantId, e.conversation.id, queueId, em);
}

/** The emergency fallback must not abort the incoming message. */
async function transbordarSemFalhar(
  tx: TransactionPipe,
  e: InboundInFlow,
  variaveis: Record<string, string>,
  motivo: string,
): Promise<void> {
  try {
    await transbordar(tx, e, e.conversation.queueDefaultId, variaveis, motivo, new Date());
  } catch (erro) {
    console.error(`[fluxo] conversa ${e.conversation.id} ficou sem fila: ${(erro as Error).message}`);
  }
}

/** Variables collected by the bot, excluding engine control keys. */
export function summaryOfContext(variaveis: Record<string, string>, motivo: string | null): string {
  const linhas = Object.entries(variaveis)
    .filter(([k]) => !/^(previous-)?stateId@/.test(k) && !k.startsWith('desk_'))
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
  conversationId: string,
  texto: string | null,
  em: Date,
  /** `{ pergunta }` for a menu (the worker chooses buttons, a list, or text) or `{ midia }` for a media type. */
  data: Record<string, unknown> | null = null,
  tipo: TipoEnvio = 'texto',
): Promise<void> {
  const categoria = classificarCusto({
    conteudo: 'texto_livre',
    withinWindow: true,
    categoriaTemplate: null,
  });
  const { rows } = await tx.execute<{ id: string }>(sql`
    insert into mensagem (
      tenant_id, conversa_id, direcao, autor_tipo, tipo, conteudo, estado_entrega, criada_em,
      dentro_da_janela, categoria_cobranca, dados
    ) values (
      ${tenantId}, ${conversationId}, 'saida', 'bot', ${tipo}, ${texto}, 'pendente', ${em}, true, ${categoria},
      ${data ? JSON.stringify(data) : null}::jsonb
    )
    returning id
  `);
  const messageId = rows[0]?.id;
  if (!messageId) throw new Error('não gravou a resposta do bot');
  await tx.execute(sql`
    insert into outbox_mensagem (tenant_id, mensagem_id, estado) values (${tenantId}, ${messageId}, 'pendente')
  `);
  await tx.execute(sql`
    update conversa set ultima_mensagem_em = ${em}, ultima_mensagem_de = 'bot', atualizado_em = now()
     where id = ${conversationId}
  `);
  // A null `usuarioId` distinguishes bot output from agent output in metrics.
  await registrarEvento(tx, { tenantId, conversationId, type: 'mensagem_saida', at: em });
  await emitir(tx, tenantId, 'mensagem.criada', {
    mensagem_id: messageId,
    conversa_id: conversationId,
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

/**
 * Convert what the flow emits into what a channel worker sends. Text and menu delegate to `textForOChannel`/`perguntaDoSelect`, unchanged from before this type existed. `media-link` becomes the media category with the pointer in `dados.midia`; the URL passes through the same SSRF guard as every other outbound URL in this module before it is ever stored. Returns `null` for content that sends nothing (typing).
 */
export function toChannelOutput(m: OutputMessage): ChannelOutput | null {
  const tipo = m.tipo.toLowerCase();
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

async function loadContact(
  tx: TransactionPipe,
  contactId: string,
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
        identity: contactId,
        name: c.name,
        phoneNumber: c.phoneE164,
        email: c.email,
        extras: c.atributos ?? {},
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
};

/**
 * The contact's last closed attendance session (`RLS` already scopes every row here to the
 * current tenant, including the `sequentialId` count). Shared by `lastAttendance` (the `Ticket`
 * fed to the engine, D-12) and `recordSatisfactionAnswer` (which attendance the survey answer
 * evaluates, D-08.5).
 */
async function mostRecentClosedAttendance(
  tx: TransactionPipe,
  contatoId: string,
  conversationCurrentId: string,
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
           (select count(*)::int from conversa c2
             where (c2.criada_em, c2.id) <= (c.criada_em, c.id)) as "sequentialId"
      from conversa c
      left join fila q on q.id = c.fila_id
      left join usuario u on u.id = c.atendente_id
     where c.contato_id = ${contatoId} and c.estado = 'encerrada' and c.id <> ${conversationCurrentId}
     order by c.encerrada_em desc nulls last
     limit 1
  `);
  return rows[0] ?? null;
}

/** The contact's last closed attendance session, like the `Ticket` Blip sends to the bot. */
async function lastAttendance(
  tx: TransactionPipe,
  contatoId: string,
  conversationCurrentId: string,
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
}> {
  const recent = await mostRecentClosedAttendance(tx, contatoId, conversationCurrentId);
  return {
    id: recent?.id ?? conversationCurrentId,
    status: STATUS_DO_TICKET[recent?.by ?? ''] ?? 'ClosedAttendant',
    closed: true,
    tags: recent?.tags ?? [],
    team: recent?.queueName ?? null,
    agentIdentity: recent?.agentEmail ?? null,
    openDate: recent?.openDate ?? null,
    closeDate: recent?.closeDate ?? null,
    closedBy: recent?.by ?? null,
    sequentialId: recent?.sequentialId ?? null,
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
  },
): Promise<ImportOfFlow> {
  const { rows: existentes } = await tx.execute<{ id: string }>(sql`
    select id from fluxo where nome = ${pedido.name} and canal_id is not distinct from ${pedido.channelId} limit 1
  `);
  let flowId = existentes[0]?.id;
  if (!flowId) {
    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into fluxo (tenant_id, nome, canal_id) values (${pedido.tenantId}, ${pedido.name}, ${pedido.channelId})
      returning id
    `);
    flowId = rows[0]!.id;
  }

  const flow = blipReadFlow(pedido.json, flowId);
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
