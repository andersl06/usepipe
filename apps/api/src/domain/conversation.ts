import { sql } from 'drizzle-orm';
import { TransitionInvalidError, transitar } from '@pipe/core';
import type { StateConversation } from '@pipe/core';
import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { registrarEvento } from './eventos.js';
import { exigirPermission } from '../session.js';
import { drenarEmSegundoPlano, emitir } from '../webhooks-saida.js';
import { evento, publicar } from '../realtime.js';

/**
 * Closing and pausing conversations belong in the domain, not the screen: events must not depend on the screen remembering them. Desk previously wrote state directly and recorded no `evento_atendimento`, leaving TMR, SLA, and effort reports blind to agent actions. Immutable `evento_atendimento` is the source of all metrics (data model §4); conversation state is a cache of those events. If they diverge, trust the event.
 */

type LineConversation = {
  id: string;
  state: string;
  queueId: string | null;
  agentId: string | null;
  em_espera_desde: Date | string | null;
};

/** Requester context: null `atendenteId` denotes an integration, which does not own a conversation. */
export interface AtorOfConversation {
  tenantId: string;
  agentId: string | null;
  /** Require the conversation to be assigned to `atendenteId`; see `envio.ts`. */
  exigirAssignment: boolean;
}

async function carregar(
  tx: Parameters<Parameters<typeof noTenant>[1]>[0],
  conversaId: string,
  ator: AtorOfConversation,
  permissionOfSupervisor?: string,
): Promise<LineConversation> {
  const { rows } = await tx.execute<LineConversation>(sql`
    select id, estado, fila_id, atendente_id, em_espera_desde
      from conversa where id = ${conversaId}::uuid limit 1
  `);
  const conversa = rows[0];
  if (!conversa) throw PipeError.naoEncontrado('Conversa');
  if (ator.exigirAssignment && conversa.agentId !== ator.agentId) {
    if (ator.agentId && permissionOfSupervisor) {
      await exigirPermission(tx, ator.agentId, permissionOfSupervisor);
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

/** Convert a state-machine rejection to 409 without exposing `never` to the controller. */
function exigirTransition(de: string, para: StateConversation): void {
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
  ator: AtorOfConversation,
  pedido: RequestOfClosure,
): Promise<{ state: 'encerrada'; reason: string }> {
  const agora = new Date();

  const resultado = await noTenant(ator.tenantId, async (tx) => {
    const conversa = await carregar(tx, pedido.conversationId, ator, 'conversa.encerrar');
    exigirTransition(conversa.state, 'encerrada');

    const etiquetaIds = [...new Set(pedido.etiquetaIds ?? (pedido.etiquetaIds ? [pedido.etiquetaIds] : []))];
    const { rows: etiquetas } = etiquetaIds.length
      ? await tx.execute<{ id: string; name: string; requiredInClosure: boolean }>(sql`
          select id, nome, obrigatoria_no_encerramento from etiqueta
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

    for (const etiqueta of etiquetas) {
      await tx.execute(sql`
        insert into conversa_etiqueta (tenant_id, conversa_id, etiqueta_id, por_usuario_id)
        values (${ator.tenantId}, ${conversa.id}, ${etiqueta.id}, ${ator.agentId})
        on conflict do nothing
      `);
    }
    const motivo = etiquetas.map((etiqueta) => etiqueta.name).join(', ');

    // Close an open waiting interval before closing its conversation; otherwise the
    // paused interval remains open and disappears from effort reporting.
    const pausaEmAberto = conversa.state === 'em_espera' && conversa.em_espera_desde !== null;
    const pausadoSeg = pausaEmAberto
      ? Math.round((agora.getTime() - comoData(conversa.em_espera_desde)!.getTime()) / 1000)
      : 0;

    await tx.execute(sql`
      update conversa
         set estado = 'encerrada', encerrada_em = ${agora}, encerrada_por = ${ator.agentId},
             motivo_encerramento = ${motivo || null}, em_espera_desde = null,
             pausado_seg = pausado_seg + ${pausadoSeg}, atualizado_em = ${agora}
       where id = ${conversa.id}
    `);

    if (pausaEmAberto) {
      await registrarEvento(tx, {
        tenantId: ator.tenantId,
        conversationId: conversa.id,
        type: 'espera_encerrada',
        at: agora,
        userId: ator.agentId,
        queueId: conversa.queueId,
        data: { motivo: 'encerramento', pausado_seg: pausadoSeg },
      });
    }

    await registrarEvento(tx, {
      tenantId: ator.tenantId,
      conversationId: conversa.id,
      type: 'encerrada',
      at: agora,
      userId: ator.agentId,
      queueId: conversa.queueId,
      // `encerradaPor` in `@pipe/core` identifies WHO removed the conversation from the screen, not the clicker's ID.
      data: {
        encerrada_por: ator.agentId ? 'atendente' : 'transferencia',
        ...(etiquetas.length === 1 ? { etiqueta: etiquetas[0]!.name } : {}),
        etiquetas: etiquetas.map((etiqueta) => etiqueta.name),
      },
    });

    await emitir(tx, ator.tenantId, 'conversa.encerrada', {
      conversa_id: conversa.id,
      motivo: motivo || null,
      encerrada_por: ator.agentId,
    });

    return { motivo };
  });

  drenarEmSegundoPlano(ator.tenantId);
  // Depois do commit. A conversa mudou e saiu da fila do atendente.
  await publicar(ator.tenantId, evento('conversation', pedido.conversationId));
  await publicar(ator.tenantId, evento('queue'));
  return { state: 'encerrada', reason: resultado.motivo };
}

export interface EsperaAlternada {
  state: 'em_espera' | 'em_atendimento';
  /** Segundos somados ao acumulado nesta virada. Zero ao entrar em espera. */
  pausadoSeg: number;
}

/**
 * Waiting mode pauses a conversation without counting client inactivity. Waiting time has its own report column; it is excluded from SLA, not from the count.
 */
export async function alternarEspera(
  ator: AtorOfConversation,
  conversationId: string,
): Promise<EsperaAlternada> {
  const agora = new Date();

  const resultado = await noTenant(ator.tenantId, async (tx) => {
    const conversation = await carregar(tx, conversationId, ator);
    const destination: StateConversation = conversation.state === 'em_espera' ? 'em_atendimento' : 'em_espera';
    exigirTransition(conversation.state, destination);

    if (destination === 'em_espera') {
      await tx.execute(sql`
        update conversa set estado = 'em_espera', em_espera_desde = ${agora},
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
        estado: 'em_espera',
      });
      return { state: destination, pausadoSeg: 0 };
    }

    const inicio = comoData(conversation.em_espera_desde);
    const pausadoSeg = inicio ? Math.round((agora.getTime() - inicio.getTime()) / 1000) : 0;
    await tx.execute(sql`
      update conversa set estado = 'em_atendimento', em_espera_desde = null,
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
      estado: 'em_atendimento',
    });
    return { state: destination, pausadoSeg };
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
  state: 'na_fila' | 'atribuida';
}

/**
 * Transfer a conversation to a queue or agent. A transfer is NOT a state transition: it closes the current conversation with `encerrada_por = transferencia` and opens another at the destination. `packages/core/src/conversa/maquina.ts` has no edge from `atribuida` back to `na_fila`, matching Blip's rule that the current ticket closes as transferred and a new one opens (`referencias-blip/pesquisa/blip-desk-funcoes.md` §3). The new conversation inherits the 24-hour window (`janela_expira_em` and the opening message) because the window belongs to the CONTACT, not the ticket; without it, the receiving agent could not send free text. It also inherits priority, as Blip does and as the issue requires, and the last message (`ultima_mensagem_em`/`_de`) so inactivity closing does not treat it as newly started. It does NOT inherit tags (also Blip's rule) or messages; the contact history joins both conversations on screen. The new conversation has `criada_em = agora` and `primeira_resposta_em` starts null: the receiving agent's TMR measures that agent, queue time starts again, and the `atribuicao` transfer report reconstructs the full client journey.
 */
export async function transferConversation(
  ator: AtorOfConversation,
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
      select id, estado, fila_id, atendente_id, em_espera_desde, inbox_id, contato_id,
             prioridade, janela_expira_em, janela_aberta_por_mensagem_id,
             ultima_mensagem_em, ultima_mensagem_de
        from conversa where id = ${pedido.conversationId}::uuid limit 1
    `);
    const conversa = rows[0];
    if (!conversa) throw PipeError.naoEncontrado('Conversa');
    if (conversa.state === 'encerrada') {
      throw PipeError.conflito('conversation_closed', 'A conversa já está encerrada.');
    }

    // Transferring ANOTHER agent's conversation is a supervisor action; that is why
    // `conversa.transferir` exists (data model §64). An agent transferring their
    // own conversation does not need it, as in Blip Desk where the action is on
    // the agent's own ticket header.
    const ehDono = conversa.agentId === ator.agentId && ator.agentId !== null;
    if (ator.exigirAssignment && !ehDono) {
      if (!ator.agentId) throw PipeError.naoAutorizado();
      await exigirPermission(tx, ator.agentId, 'conversa.transferir');
    }

    if (forQueue) {
      const { rows: f } = await tx.execute<{ id: string }>(
        sql`select id from fila where id = ${forQueue}::uuid and ativa limit 1`,
      );
      if (!f[0]) throw PipeError.naoEncontrado('Fila');
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

    // Close any open waiting period BEFORE closing the conversation, or the paused
    // interval remains open and disappears from effort reporting.
    const pausaEmAberto = conversa.state === 'em_espera' && conversa.em_espera_desde !== null;
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
         set estado = 'encerrada', encerrada_em = ${agora}, encerrada_por = ${ator.agentId},
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
    const stateNew: 'na_fila' | 'atribuida' = forAgent ? 'atribuida' : 'na_fila';

    const { rows: nova } = await tx.execute<{ id: string }>(sql`
      insert into conversa (
        tenant_id, inbox_id, contato_id, fila_id, atendente_id, estado, prioridade,
        criada_em, atribuida_em, janela_expira_em, janela_aberta_por_mensagem_id,
        ultima_mensagem_em, ultima_mensagem_de
      ) values (
        ${ator.tenantId}, ${conversa.inbox_id}, ${conversa.contactId}, ${queueDestination},
        ${forAgent}, ${stateNew}, ${conversa.priority},
        ${agora}, ${forAgent ? agora : null},
        ${conversa.windowExpiresAt}, ${conversa.windowOpenByMessageId},
        ${conversa.lastMessageAt}, ${conversa.lastMessageOf}
      )
      returning id
    `);
    const novaId = nova[0]?.id;
    if (!novaId) throw new Error('não criou a conversa de destino');

    await registrarEvento(tx, {
      tenantId: ator.tenantId,
      conversationId: novaId,
      type: 'criada',
      at: agora,
      userId: ator.agentId,
      queueId: queueDestination,
    });
    await registrarEvento(tx, {
      tenantId: ator.tenantId,
      conversationId: novaId,
      // A queue destination uses `transferida_fila`; for an agent the new conversation starts assigned.
      type: forAgent ? 'atribuida' : 'transferida_fila',
      at: agora,
      userId: forAgent ?? ator.agentId,
      queueId: queueDestination,
      data: { de_conversa_id: conversa.id },
    });

    // `atribuicao` links the two conversations so the transfer dashboard can
    // reconstruct the client's journey after closure.
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

    return { ofConversationId: conversa.id, forConversationId: novaId, state: stateNew };
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
