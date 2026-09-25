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
 * Encerrar e pausar conversa.
 *
 * Existem aqui, e não na tela, porque **o evento não pode depender de a tela lembrar**.
 * O Desk encerrava e pausava escrevendo direto na tabela e não gravava
 * `evento_atendimento` nenhum — o resultado era TMR, SLA e esforço cegos para tudo o
 * que o atendente fazia, com a Gestão mostrando número errado com cara de certo.
 *
 * `evento_atendimento` é a fonte de toda métrica e é imutável (modelo de dados §4).
 * Estado da conversa é cache do que os eventos já dizem; se os dois divergirem, quem
 * está certo é o evento.
 */

type LineConversation = {
  id: string;
  state: string;
  queueId: string | null;
  agentId: string | null;
  em_espera_desde: Date | string | null;
};

/** Quem está pedindo. `atendenteId` nulo é integração — não é dono de conversa. */
export interface AtorOfConversation {
  tenantId: string;
  agentId: string | null;
  /** Exige que a conversa esteja atribuída ao `atendenteId`. Ver `envio.ts`. */
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
  if (ator.exigirAssignment && conversa.atendente_id !== ator.agentId) {
    if (ator.agentId && permissionOfSupervisor) {
      await exigirPermission(tx, ator.agentId, permissionOfSupervisor);
      return conversa;
    }
    throw new PipeError(
      403,
      'conversation_of_other_agent',
      conversa.atendente_id
        ? 'Esta conversa está com outro atendente.'
        : 'Esta conversa não está atribuída a você.',
    );
  }
  return conversa;
}

/** Traduz a recusa da máquina de estados em 409, sem vazar `never` para o controlador. */
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
   * A Blip (`close-modal-container.js`) envia uma coleção e bloqueia só quando
   * a política exige tags; no Pipe, as etiquetas marcadas na Gestão são essa lista.
   */
  etiquetaIds?: readonly string[];
  /** Compatibilidade com clientes que ainda enviam a forma antiga. */
  labelId?: string;
}

export async function closeConversation(
  ator: AtorOfConversation,
  pedido: RequestOfClosure,
): Promise<{ state: 'encerrada'; reason: string }> {
  const agora = new Date();

  const resultado = await noTenant(ator.tenantId, async (tx) => {
    const conversa = await carregar(tx, pedido.conversaId, ator, 'conversa.encerrar');
    exigirTransition(conversa.estado, 'encerrada');

    const etiquetaIds = [...new Set(pedido.etiquetaIds ?? (pedido.etiquetaId ? [pedido.etiquetaId] : []))];
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
    const motivo = etiquetas.map((etiqueta) => etiqueta.nome).join(', ');

    // Uma conversa encerrada em espera tem de fechar a espera antes, senão o intervalo
    // pausado fica aberto para sempre e some do relatório de esforço.
    const pausaEmAberto = conversa.estado === 'em_espera' && conversa.em_espera_desde !== null;
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
        tipo: 'espera_encerrada',
        em: agora,
        userId: ator.agentId,
        queueId: conversa.queueId,
        data: { motivo: 'encerramento', pausado_seg: pausadoSeg },
      });
    }

    await registrarEvento(tx, {
      tenantId: ator.tenantId,
      conversationId: conversa.id,
      tipo: 'encerrada',
      em: agora,
      userId: ator.agentId,
      queueId: conversa.queueId,
      // `encerradaPor` do `@pipe/core` é QUEM tirou da tela, não o id de quem clicou.
      data: {
        encerrada_por: ator.agentId ? 'atendente' : 'transferencia',
        ...(etiquetas.length === 1 ? { etiqueta: etiquetas[0]!.nome } : {}),
        etiquetas: etiquetas.map((etiqueta) => etiqueta.nome),
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
  await publicar(ator.tenantId, evento('conversation', pedido.conversaId));
  await publicar(ator.tenantId, evento('queue'));
  return { estado: 'encerrada', motivo: resultado.motivo };
}

export interface EsperaAlternada {
  state: 'em_espera' | 'em_atendimento';
  /** Segundos somados ao acumulado nesta virada. Zero ao entrar em espera. */
  pausadoSeg: number;
}

/**
 * Modo de espera: pausa a conversa sem que a inatividade do cliente conte.
 *
 * O intervalo em espera vira coluna própria no relatório — some do SLA, não do número.
 */
export async function alternarEspera(
  ator: AtorOfConversation,
  conversationId: string,
): Promise<EsperaAlternada> {
  const agora = new Date();

  const resultado = await noTenant(ator.tenantId, async (tx) => {
    const conversation = await carregar(tx, conversationId, ator);
    const destination: StateConversation = conversation.estado === 'em_espera' ? 'em_atendimento' : 'em_espera';
    exigirTransition(conversation.estado, destination);

    if (destination === 'em_espera') {
      await tx.execute(sql`
        update conversa set estado = 'em_espera', em_espera_desde = ${agora},
                            atualizado_em = ${agora}
         where id = ${conversation.id}
      `);
      await registrarEvento(tx, {
        tenantId: ator.tenantId,
        conversationId: conversation.id,
        tipo: 'espera_iniciada',
        em: agora,
        userId: ator.agentId,
        queueId: conversation.queueId,
      });
      await emitir(tx, ator.tenantId, 'conversa.estado_alterado', {
        conversa_id: conversation.id,
        estado: 'em_espera',
      });
      return { estado: destination, pausadoSeg: 0 };
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
      tipo: 'espera_encerrada',
      em: agora,
      userId: ator.agentId,
      queueId: conversation.queueId,
      data: { pausado_seg: pausadoSeg },
    });
    await emitir(tx, ator.tenantId, 'conversa.estado_alterado', {
      conversa_id: conversation.id,
      estado: 'em_atendimento',
    });
    return { estado: destination, pausadoSeg };
  });

  // Depois do commit, como em toda ação de domínio. Ver `tempo-real.ts`.
  await publicar(ator.tenantId, evento('conversation', conversationId));
  return resultado;
}

export interface PedidoDeTransferencia {
  conversationId: string;
  /** Exatamente UM dos dois. Fila devolve para a fila; atendente entrega direto. */
  forQueueId?: string | null;
  forAgentId?: string | null;
  reason?: string | null;
}

export interface Transferida {
  /** A conversa que foi ENCERRADA. */
  ofConversationId: string;
  /** A conversa NOVA, no destino. */
  forConversationId: string;
  state: 'na_fila' | 'atribuida';
}

/**
 * Transferir conversa, para fila ou para atendente.
 *
 * **Transferência não é transição de estado**: ela ENCERRA a conversa atual com
 * `encerrada_por = transferencia` e ABRE outra no destino. Não é escolha minha — está
 * decidido em `packages/core/src/conversa/maquina.ts`, que por isso não tem aresta de
 * `atribuida` de volta para `na_fila`, e é a regra da Blip ("o ticket atual é
 * encerrado com status Transferido e um novo ticket é aberto",
 * `referencias-blip/pesquisa/blip-desk-funcoes.md` §3).
 *
 * O que a conversa nova HERDA, e por quê:
 *
 * - **A janela de 24 horas** (`janela_expira_em` e a mensagem que a abriu). A janela é
 *   do CONTATO, não do ticket: sem herdar, quem recebe a transferência não consegue
 *   mandar texto livre e não entende por quê. É a armadilha mais cara daqui.
 * - **A prioridade** — a Blip herda, e prioridade é do problema, não do atendente.
 * - **A última mensagem** (`ultima_mensagem_em`/`_de`), senão o fechamento automático
 *   por inatividade trataria a conversa nova como recém-nascida.
 *
 * O que NÃO herda: **as etiquetas** (a Blip também não) e **as mensagens** — elas ficam
 * na conversa encerrada, e o histórico do contato é quem costura as duas na tela.
 *
 * O efeito na métrica, escrito porque é a pergunta que sempre volta: a conversa nova
 * começa com `criada_em = agora` e `primeira_resposta_em` nulo, então **o TMR de quem
 * recebe mede quem recebe**, e o tempo de fila da transferência conta de novo. É o
 * preço do modelo da Blip, e o relatório de transferências (`atribuicao`) é o que
 * permite remontar a jornada inteira do cliente.
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
    if (conversa.estado === 'encerrada') {
      throw PipeError.conflito('conversation_closed', 'A conversa já está encerrada.');
    }

    // Transferir a conversa de OUTRO é ação de supervisão, e é para isso que a
    // permissão `conversa.transferir` existe (modelo de dados §64). Quem transfere a
    // própria não precisa dela — como no Desk da Blip, onde o ícone fica no cabeçalho
    // do ticket do próprio atendente.
    const ehDono = conversa.atendente_id === ator.agentId && ator.agentId !== null;
    if (ator.exigirAssignment && !ehDono) {
      if (!ator.agentId) throw PipeError.naoAutorizado();
      await exigirPermission(tx, ator.agentId, 'conversa.transferir');
    }

    if (forQueue) {
      const { rows: f } = await tx.execute<{ id: string }>(
        sql`select id from fila where id = ${forQueue}::uuid and ativa limit 1`,
      );
      if (!f[0]) throw PipeError.naoEncontrado('Fila');
      if (forQueue === conversa.queueId && !conversa.atendente_id) {
        throw PipeError.conflito('same_destination', 'A conversa já está nesta fila.');
      }
    } else {
      const { rows: u } = await tx.execute<{ id: string }>(
        sql`select id from usuario where id = ${forAgent}::uuid and ativo limit 1`,
      );
      if (!u[0]) throw PipeError.naoEncontrado('Atendente');
      if (forAgent === conversa.atendente_id) {
        throw PipeError.conflito('same_destination', 'A conversa já está com este atendente.');
      }
    }

    // Espera em aberto fecha ANTES do encerramento, senão o intervalo pausado fica
    // aberto para sempre e some do relatório de esforço.
    const pausaEmAberto = conversa.estado === 'em_espera' && conversa.em_espera_desde !== null;
    const pausadoSeg = pausaEmAberto
      ? Math.round((agora.getTime() - comoData(conversa.em_espera_desde)!.getTime()) / 1000)
      : 0;
    if (pausaEmAberto) {
      await registrarEvento(tx, {
        tenantId: ator.tenantId,
        conversationId: conversa.id,
        tipo: 'espera_encerrada',
        em: agora,
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
      tipo: 'encerrada',
      em: agora,
      userId: ator.agentId,
      queueId: conversa.queueId,
      // `encerrada_por = transferencia` é o que separa, no relatório, a conversa que
      // acabou da que só mudou de mãos.
      data: { encerrada_por: 'transferencia', motivo: pedido.motivo ?? null },
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
      tipo: 'criada',
      em: agora,
      userId: ator.agentId,
      queueId: queueDestination,
    });
    await registrarEvento(tx, {
      tenantId: ator.tenantId,
      conversationId: novaId,
      // Para fila é `transferida_fila`; para pessoa a conversa nasce já atribuída.
      tipo: forAgent ? 'atribuida' : 'transferida_fila',
      em: agora,
      userId: forAgent ?? ator.agentId,
      queueId: queueDestination,
      data: { de_conversa_id: conversa.id },
    });

    // `atribuicao` é o que costura as duas conversas: é por ela que o painel de
    // transferências remonta a jornada do cliente depois do encerramento.
    await tx.execute(sql`
      insert into atribuicao (
        tenant_id, conversa_id, de_usuario_id, para_usuario_id,
        de_fila_id, para_fila_id, motivo, por_usuario_id, em
      ) values (
        ${ator.tenantId}, ${conversa.id}, ${conversa.atendente_id}, ${forAgent},
        ${conversa.queueId}, ${forQueue}, ${pedido.motivo ?? null}, ${ator.agentId}, ${agora}
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

    return { deConversaId: conversa.id, paraConversaId: novaId, estado: stateNew };
  });

  drenarEmSegundoPlano(ator.tenantId);
  // Duas conversas mudaram: a que encerrou e a que nasceu no destino.
  await publicar(ator.tenantId, evento('conversation', resultado.deConversaId));
  await publicar(ator.tenantId, evento('conversation', resultado.paraConversaId));
  await publicar(ator.tenantId, evento('queue'));
  return resultado;
}

function comoData(value: Date | string | null): Date | null {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}
