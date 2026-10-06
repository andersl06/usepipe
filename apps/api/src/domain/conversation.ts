import { sql } from 'drizzle-orm';
import { TransitionInvalidError, closedStateOf, isClosedState, transitar } from '@pipe/core';
import type { ClosedBy, ClosedState, StateConversation } from '@pipe/core';
import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { registrarEvento } from './eventos.js';
import { PRESENCE_STATE_SQL } from './distribution.js';
import { lerConfigAtendimento } from './management/atendimento-config.js';
import { assertQueueOfFlow, enterQueue, flowOfConversation } from './queue-entry.js';
import { requirePermission } from '../session.js';
import { drenarEmSegundoPlano, emitir } from '../webhooks-saida.js';
import { evento, publicar } from '../realtime.js';

/**
 * Closing and pausing conversations belong in the domain, not the screen: events must not depend on the screen remembering them. Desk previously wrote state directly and recorded no `evento_atendimento`, leaving TMR, SLA, and effort reports blind to agent actions. Immutable `evento_atendimento` is the source of all metrics (data model §4); conversation state is a cache of those events. If they diverge, trust the event.
 */

export type LineConversation = {
  id: string;
  state: string;
  queueId: string | null;
  agentId: string | null;
  em_espera_desde: Date | string | null;
};

/** Requester context: null `atendenteId` denotes an integration, which does not own a conversation. */
export interface ActorOfConversation {
  tenantId: string;
  agentId: string | null;
  /** Require the conversation to be assigned to `atendenteId`; see `envio.ts`. */
  requireAssignment: boolean;
}

async function carregar(
  tx: Parameters<Parameters<typeof noTenant>[1]>[0],
  conversaId: string,
  ator: ActorOfConversation,
  permissionOfSupervisor?: string,
): Promise<LineConversation> {
  const { rows } = await tx.execute<LineConversation>(sql`
    select id, estado as state, fila_id as "queueId", atendente_id as "agentId", em_espera_desde
      from conversa where id = ${conversaId}::uuid limit 1
  `);
  const conversa = rows[0];
  if (!conversa) throw PipeError.naoEncontrado('Conversa');
  if (ator.requireAssignment && conversa.agentId !== ator.agentId) {
    if (ator.agentId && permissionOfSupervisor) {
      await requirePermission(tx, ator.agentId, permissionOfSupervisor);
      return conversa;
    }
    throw new PipeError(
      403,
      'conversation_of_other_agent',
      conversa.agentId
        ? 'Esta conversa está com outro atendente.'
        : 'Esta conversa não está atribuída a você.',
    );
  }
  return conversa;
}

/**
 * The closing writes, inside the caller's transaction: state + `encerrada_em`, the open waiting
 * interval, the `encerrada` event (metrics/SLA read events, not the state) and the webhook.
 * Shared by `closeConversation` (Desk/API) and the bot's `/tickets/{id}/status` command
 * (`flow.ts`), which runs inside the inbound transaction. Returns the closure reason (tag names).
 * `closedBy` is who ended it (`evento.dados.encerrada_por`, read by metrics and by the Blip ticket
 * status: `cliente` → `ClosedClient`, `inatividade` → `ClosedClientInactivity`); the default keeps
 * the Desk/API rule, `atendente`: `transferencia` belongs only to `transferConversation`, which closes the
 * ticket and opens a child; closing through an integration key is still an attendant closure.
 */
export async function closeInTransaction(
  tx: Parameters<Parameters<typeof noTenant>[1]>[0],
  tenantId: string,
  conversa: LineConversation,
  agentId: string | null,
  etiquetas: readonly { id: string; name: string }[],
  agora: Date,
  closedBy: ClosedBy = 'atendente',
  extraEventData: Record<string, unknown> = {},
): Promise<string> {
  const closedState = closedStateOf(closedBy);
  requireTransition(conversa.state, closedState);
  for (const etiqueta of etiquetas) {
    await tx.execute(sql`
      insert into conversa_etiqueta (tenant_id, conversa_id, etiqueta_id, por_usuario_id)
      values (${tenantId}, ${conversa.id}, ${etiqueta.id}, ${agentId})
      on conflict do nothing
    `);
  }
  const motivo = etiquetas.map((etiqueta) => etiqueta.name).join(', ');

  // Close an open waiting interval before closing its conversation; otherwise the
  // paused interval remains open and disappears from effort reporting.
  const pausaEmAberto = conversa.em_espera_desde !== null;
  const pausadoSeg = pausaEmAberto
    ? Math.round((agora.getTime() - comoData(conversa.em_espera_desde)!.getTime()) / 1000)
    : 0;

  await tx.execute(sql`
    update conversa
       set estado = ${closedState}, encerrada_em = ${agora}, encerrada_por = ${agentId},
           motivo_encerramento = ${motivo || null}, em_espera_desde = null,
           pausado_seg = pausado_seg + ${pausadoSeg}, atualizado_em = ${agora}
     where id = ${conversa.id}
  `);

  if (pausaEmAberto) {
    await registrarEvento(tx, {
      tenantId,
      conversationId: conversa.id,
      type: 'espera_encerrada',
      at: agora,
      userId: agentId,
      queueId: conversa.queueId,
      data: { motivo: 'encerramento', pausado_seg: pausadoSeg },
    });
  }

  await registrarEvento(tx, {
    tenantId,
    conversationId: conversa.id,
    type: 'encerrada',
    at: agora,
    userId: agentId,
    queueId: conversa.queueId,
    // `encerradaPor` in `@pipe/core` identifies WHO removed the conversation from the screen, not the clicker's ID.
    data: {
      encerrada_por: closedBy,
      ...(etiquetas.length === 1 ? { etiqueta: etiquetas[0]!.name } : {}),
      etiquetas: etiquetas.map((etiqueta) => etiqueta.name),
      ...extraEventData,
    },
  });

  await emitir(tx, tenantId, 'conversa.encerrada', {
    conversa_id: conversa.id,
    motivo: motivo || null,
    encerrada_por: agentId,
  });
  return motivo;
}

/** Convert a state-machine rejection to 409 without exposing `never` to the controller. */
function requireTransition(de: string, para: StateConversation): void {
  try {
    transitar(de as StateConversation, para);
  } catch (error) {
    if (error instanceof TransitionInvalidError) {
      throw PipeError.conflito('transition_invalid', error.message);
    }
    throw error;
  }
}

export interface RequestOfClosure {
  conversationId: string;
  /**
   * Blip (`close-modal-container.js`) sends a collection and blocks closure only when policy requires tags; in Pipe, the tags selected in Management are that collection.
   */
  etiquetaIds?: readonly string[];
  /** Compatibility with clients still sending the old shape. */
  labelId?: string;
}

export async function closeConversation(
  ator: ActorOfConversation,
  pedido: RequestOfClosure,
): Promise<{ state: ClosedState; reason: string }> {
  const agora = new Date();

  const resultado = await noTenant(ator.tenantId, async (tx) => {
    const conversa = await carregar(tx, pedido.conversationId, ator, 'conversa.encerrar');
    requireTransition(conversa.state, closedStateOf('atendente'));

    const etiquetaIds = [...new Set(pedido.etiquetaIds ?? (pedido.etiquetaIds ? [pedido.etiquetaIds] : []))];
    const { rows: etiquetas } = etiquetaIds.length
      ? await tx.execute<{ id: string; name: string; requiredInClosure: boolean }>(sql`
          select id, nome as name, obrigatoria_no_encerramento as "requiredInClosure" from etiqueta
           where id in (${sql.join(etiquetaIds.map((id) => sql`${id}::uuid`), sql`, `)})
        `)
      : { rows: [] as { id: string; name: string; obrigatoria_no_encerramento: boolean }[] };
    if (etiquetas.length !== etiquetaIds.length) throw PipeError.naoEncontrado('Etiqueta');

    const { rows: obrigatorias } = await tx.execute<{ id: string }>(sql`
      select id from etiqueta
       where obrigatoria_no_encerramento = true and escopo in ('conversa', 'ambos')
    `);
    if (obrigatorias.some((obrigatoria) => !etiquetaIds.includes(obrigatoria.id))) {
      throw PipeError.request('label_required', 'Escolha as tags obrigatórias para finalizar.');
    }

    // An integration key has no agent; its origin goes on the event, never into the ticket state.
    const motivo = await closeInTransaction(
      tx, ator.tenantId, conversa, ator.agentId, etiquetas, agora, 'atendente',
      ator.agentId ? {} : { origem: 'api' },
    );
    return { motivo };
  });

  drenarEmSegundoPlano(ator.tenantId);
  // Depois do commit. A conversa mudou e saiu da fila do atendente.
  await publicar(ator.tenantId, evento('conversation', pedido.conversationId));
  await publicar(ator.tenantId, evento('queue'));
  return { state: closedStateOf('atendente'), reason: resultado.motivo };
}

export interface EsperaAlternada {
  state: 'Open';
  emStandby: boolean;
  /** Segundos somados ao acumulado nesta virada. Zero ao entrar em espera. */
  pausadoSeg: number;
}

/**
 * Waiting mode pauses a conversation without counting client inactivity. Waiting time has its own report column; it is excluded from SLA, not from the count.
 */
export async function alternarEspera(
  ator: ActorOfConversation,
  conversationId: string,
): Promise<EsperaAlternada> {
  const agora = new Date();

  const resultado = await noTenant(ator.tenantId, async (tx) => {
    const conversation = await carregar(tx, conversationId, ator);
    // Standby is a flag on an Open ticket; the state never changes.
    if (conversation.state !== 'Open') {
      throw PipeError.conflito('transition_invalid', 'O Modo de Espera só vale para tickets em atendimento.');
    }

    if (conversation.em_espera_desde === null) {
      if (!(await lerConfigAtendimento(tx, ator.tenantId)).modoEspera.ativo) {
        throw PipeError.conflito('hold_mode_disabled', 'O Modo de Espera está desabilitado nas Configurações gerais.');
      }
      await tx.execute(sql`
        update conversa set em_espera_desde = ${agora},
                            atualizado_em = ${agora}
         where id = ${conversation.id}
      `);
      await registrarEvento(tx, {
        tenantId: ator.tenantId,
        conversationId: conversation.id,
        type: 'espera_iniciada',
        at: agora,
        userId: ator.agentId,
        queueId: conversation.queueId,
      });
      await emitir(tx, ator.tenantId, 'conversa.estado_alterado', {
        conversa_id: conversation.id,
        estado: 'Open',
        em_standby: true,
      });
      return { state: 'Open' as const, emStandby: true, pausadoSeg: 0 };
    }

    const inicio = comoData(conversation.em_espera_desde);
    const pausadoSeg = inicio ? Math.round((agora.getTime() - inicio.getTime()) / 1000) : 0;
    await tx.execute(sql`
      update conversa set em_espera_desde = null,
                          pausado_seg = pausado_seg + ${pausadoSeg}, atualizado_em = ${agora}
       where id = ${conversation.id}
    `);
    await registrarEvento(tx, {
      tenantId: ator.tenantId,
      conversationId: conversation.id,
      type: 'espera_encerrada',
      at: agora,
      userId: ator.agentId,
      queueId: conversation.queueId,
      data: { pausado_seg: pausadoSeg },
    });
    await emitir(tx, ator.tenantId, 'conversa.estado_alterado', {
      conversa_id: conversation.id,
      estado: 'Open',
      em_standby: false,
    });
    return { state: 'Open' as const, emStandby: false, pausadoSeg };
  });

  // Publish after commit, as for every domain action. See `tempo-real.ts`.
  await publicar(ator.tenantId, evento('conversation', conversationId));
  return resultado;
}

export interface PedidoDeTransferencia {
  conversationId: string;
  /** Set exactly ONE destination. A queue sends the conversation back to a queue; an agent receives it directly. */
  forQueueId?: string | null;
  forAgentId?: string | null;
  reason?: string | null;
}

export interface Transferida {

  ofConversationId: string;
  /** A conversa NOVA, no destino. */
  forConversationId: string;
  state: 'Waiting' | 'Assigned';
}

/**
 * Transfer a conversation to a queue or agent. A transfer is NOT a state transition: it closes the current conversation with `encerrada_por = transferencia` and opens another at the destination. `packages/core/src/conversa/maquina.ts` has no edge from `atribuida` back to `na_fila`, matching Blip's rule that the current ticket closes as transferred and a new one opens (`referencias-blip/pesquisa/blip-desk-funcoes.md` §3). The new conversation inherits the 24-hour window (`janela_expira_em` and the opening message) because the window belongs to the CONTACT, not the ticket; without it, the receiving agent could not send free text. It also inherits priority, as Blip does and as the issue requires, and the last message (`ultima_mensagem_em`/`_de`) so inactivity closing does not treat it as newly started. It does NOT inherit tags (also Blip's rule) or messages; the contact history joins both conversations on screen. The new conversation has `criada_em = agora` and `primeira_resposta_em` starts null: the receiving agent's TMR measures that agent, queue time starts again, and the `atribuicao` transfer report reconstructs the full client journey.
 */
export async function transferConversation(
  ator: ActorOfConversation,
  pedido: PedidoDeTransferencia,
): Promise<Transferida> {
  const forQueue = pedido.forQueueId ?? null;
  const forAgent = pedido.forAgentId ?? null;
  if ((forQueue && forAgent) || (!forQueue && !forAgent)) {
    throw PipeError.request(
      'destination_invalid',
      'Informe `para_fila_id` OU `para_atendente_id`, um só.',
    );
  }

  const agora = new Date();

  const resultado = await noTenant(ator.tenantId, async (tx) => {
    const { rows } = await tx.execute<
      LineConversation & {
        inbox_id: string;
        contactId: string;
        priority: string;
        windowExpiresAt: Date | string | null;
        windowOpenByMessageId: string | null;
        lastMessageAt: Date | string | null;
        lastMessageOf: string | null;
      }
    >(sql`
      select id, estado as "state", fila_id as "queueId", atendente_id as "agentId", em_espera_desde, inbox_id, contato_id as "contactId",
             prioridade as "priority", janela_expira_em as "windowExpiresAt", janela_aberta_por_mensagem_id as "windowOpenByMessageId",
             ultima_mensagem_em as "lastMessageAt", ultima_mensagem_de as "lastMessageOf"
        from conversa where id = ${pedido.conversationId}::uuid limit 1
    `);
    const conversa = rows[0];
    if (!conversa) throw PipeError.naoEncontrado('Conversa');
    if (isClosedState(conversa.state)) {
      throw PipeError.conflito('conversation_closed', 'A conversa já está encerrada.');
    }

    // Transferring ANOTHER agent's conversation is a supervisor action; that is why
    // `conversa.transferir` exists (data model §64). An agent transferring their
    // own conversation does not need it, as in Blip Desk where the action is on
    // the agent's own ticket header.
    const ehDono = conversa.agentId === ator.agentId && ator.agentId !== null;
    if (ator.requireAssignment && !ehDono) {
      if (!ator.agentId) throw PipeError.naoAutorizado();
      await requirePermission(tx, ator.agentId, 'conversa.transferir');
    }

    if (forQueue) {
      const { rows: f } = await tx.execute<{ id: string }>(
        sql`select id from fila where id = ${forQueue}::uuid and ativa limit 1`,
      );
      if (!f[0]) throw PipeError.naoEncontrado('Fila');
      // The destination must belong to the flow serving the conversation (`enterQueue` checks it again).
      const flowId = await flowOfConversation(tx, ator.tenantId, conversa.id);
      if (!flowId) throw PipeError.request('fila_de_outro_fluxo', 'A fila escolhida não pertence a este fluxo.');
      await assertQueueOfFlow(tx, ator.tenantId, flowId, forQueue);
      if (forQueue === conversa.queueId && !conversa.agentId) {
        throw PipeError.conflito('same_destination', 'A conversa já está nesta fila.');
      }
    } else {
      const { rows: u } = await tx.execute<{ id: string }>(
        sql`select id from usuario where id = ${forAgent}::uuid and ativo limit 1`,
      );
      if (!u[0]) throw PipeError.naoEncontrado('Atendente');
      if (forAgent === conversa.agentId) {
        throw PipeError.conflito('same_destination', 'A conversa já está com este atendente.');
      }
    }

    // Preferências globais da transferência pelo Desk: valem para a transferência feita no Desk por sessão de atendente (Monitoramento e chave de API não são o Desk).
    if (ator.requireAssignment && ator.agentId) {
      const { transferencia } = await lerConfigAtendimento(tx, ator.tenantId);
      if (!transferencia.habilitada) {
        throw PipeError.conflito('transfer_disabled', 'A transferência de tickets está desabilitada nas Configurações gerais.');
      }
      if (forAgent && !transferencia.atendentesEspecificos) {
        throw PipeError.conflito(
          'transfer_to_agent_disabled',
          'A transferência para atendentes específicos está desabilitada nas Configurações gerais.',
        );
      }
      if (!transferencia.offline) {
        const { rows: online } = await tx.execute<{ ok: number }>(
          forAgent
            ? sql`select 1 as ok from usuario u left join status_atendente s on s.usuario_id = u.id
                  where u.id = ${forAgent}::uuid and ${PRESENCE_STATE_SQL} = 'Online'`
            : sql`select 1 as ok from fila_atendente fa join usuario u on u.id = fa.usuario_id and u.ativo
                  left join status_atendente s on s.usuario_id = u.id
                  where fa.fila_id = ${forQueue}::uuid and ${PRESENCE_STATE_SQL} = 'Online' limit 1`,
        );
        if (!online[0]) {
          throw PipeError.conflito(
            'transfer_offline_disabled',
            'A transferência para filas e atendentes offline está desabilitada nas Configurações gerais.',
          );
        }
      }
    }

    // Close any open waiting period BEFORE closing the conversation, or the paused
    // interval remains open and disappears from effort reporting.
    const pausaEmAberto = conversa.em_espera_desde !== null;
    const pausadoSeg = pausaEmAberto
      ? Math.round((agora.getTime() - comoData(conversa.em_espera_desde)!.getTime()) / 1000)
      : 0;
    if (pausaEmAberto) {
      await registrarEvento(tx, {
        tenantId: ator.tenantId,
        conversationId: conversa.id,
        type: 'espera_encerrada',
        at: agora,
        userId: ator.agentId,
        queueId: conversa.queueId,
        data: { motivo: 'transferencia', pausado_seg: pausadoSeg },
      });
    }

    await tx.execute(sql`
      update conversa
         set estado = ${closedStateOf('transferencia')}, encerrada_em = ${agora}, encerrada_por = ${ator.agentId},
             motivo_encerramento = 'Transferida', em_espera_desde = null,
             pausado_seg = pausado_seg + ${pausadoSeg}, atualizado_em = ${agora}
       where id = ${conversa.id}
    `);
    await registrarEvento(tx, {
      tenantId: ator.tenantId,
      conversationId: conversa.id,
      type: 'encerrada',
      at: agora,
      userId: ator.agentId,
      queueId: conversa.queueId,
      // `encerrada_por = transferencia` distinguishes, in reports, a conversation that
      // ended from one that merely changed hands.
      data: { encerrada_por: 'transferencia', motivo: pedido.reason ?? null },
    });

    const queueDestination = forQueue ?? conversa.queueId;

    // A queue destination is born without a queue and enters it through `enterQueue`, like a bot
    // handoff: `criada` + `transferida_fila`, priority rules (an inherited priority is kept) and
    // distribution. An agent destination starts assigned.
    const { rows: nova } = await tx.execute<{ id: string }>(sql`
      insert into conversa (
        tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado, prioridade, conversa_pai_id,
        criada_em, atribuida_em, janela_expira_em, janela_aberta_por_mensagem_id,
        ultima_mensagem_em, ultima_mensagem_de
      ) values (
        ${ator.tenantId}, ${conversa.inbox_id}, ${conversa.contactId}, ${forAgent ? queueDestination : null},
        ${forAgent}, ${forAgent ? 'Assigned' : 'Waiting'}, ${conversa.priority}, ${conversa.id},
        ${agora}, ${forAgent ? agora : null},
        ${conversa.windowExpiresAt}, ${conversa.windowOpenByMessageId},
        ${conversa.lastMessageAt}, ${conversa.lastMessageOf}
      )
      returning id
    `);
    const novaId = nova[0]?.id;
    if (!novaId) throw new Error('não criou a conversa de destino');

    // `atribuicao` links the two conversations so the transfer dashboard can reconstruct the
    // client's journey after closure; it and the webhooks precede any assignment of the new one.
    const linkAndNotify = async (): Promise<void> => {
      await tx.execute(sql`
        insert into atribuicao (
          tenant_id, conversa_id, de_usuario_id, para_usuario_id,
          de_fila_id, para_fila_id, motivo, por_usuario_id, em
        ) values (
          ${ator.tenantId}, ${conversa.id}, ${conversa.agentId}, ${forAgent},
          ${conversa.queueId}, ${forQueue}, ${pedido.reason ?? null}, ${ator.agentId}, ${agora}
        )
      `);
      await emitir(tx, ator.tenantId, 'conversa.encerrada', {
        conversa_id: conversa.id,
        motivo: 'Transferida',
        encerrada_por: ator.agentId,
      });
      await emitir(tx, ator.tenantId, 'conversa.criada', {
        conversa_id: novaId,
        contato_id: conversa.contactId,
        fila_id: queueDestination,
        de_conversa_id: conversa.id,
      });
    };

    if (forAgent) {
      const base = { tenantId: ator.tenantId, conversationId: novaId, at: agora, queueId: queueDestination };
      await registrarEvento(tx, { ...base, type: 'criada', userId: ator.agentId });
      await registrarEvento(tx, { ...base, type: 'atribuida', userId: forAgent, data: { de_conversa_id: conversa.id } });
      await linkAndNotify();
      return { ofConversationId: conversa.id, forConversationId: novaId, state: 'Assigned' as const };
    }

    const entry = await enterQueue(tx, {
      tenantId: ator.tenantId,
      conversationId: novaId,
      // The flow of the ORIGIN conversation: the new one is born without a queue.
      flowId: await flowOfConversation(tx, ator.tenantId, conversa.id),
      queueId: forQueue,
      defaultQueueId: null,
      message: null,
      at: agora,
      origin: 'transferencia',
      userId: ator.agentId,
      eventData: { de_conversa_id: conversa.id },
      beforeDistribution: linkAndNotify,
    });
    const state: 'Waiting' | 'Assigned' = entry.agentId ? 'Assigned' : 'Waiting';
    return { ofConversationId: conversa.id, forConversationId: novaId, state };
  });

  drenarEmSegundoPlano(ator.tenantId);
  // Two conversations changed: the closed one and the new one at the destination.
  await publicar(ator.tenantId, evento('conversation', resultado.ofConversationId));
  await publicar(ator.tenantId, evento('conversation', resultado.forConversationId));
  await publicar(ator.tenantId, evento('queue'));
  return resultado;
}

function comoData(value: Date | string | null): Date | null {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}
