import { sql } from 'drizzle-orm';
import { MAX_FILES_BY_MESSAGE, maxBytesDoMime, mimeAceito, tipoDoMime } from '@pipe/storage';
import { avaliarEnvio, classificarCusto, isClosedState } from '@pipe/core';
import type { CategoriaTemplate, TypeChannel } from '@pipe/core';
import { positionOfVariable } from '@pipe/workers/whatsapp';
import type { CabecalhoTemplate } from '@pipe/workers/whatsapp';
import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { registrarEvento } from './eventos.js';
import { exigirSemPalavrasProibidas } from './management/palavras-proibidas.js';
import { lerConfigAtendimento } from './management/atendimento-config.js';
import { drenarEmSegundoPlano, emitir } from '../webhooks-saida.js';
import { evento, publicar } from '../realtime.js';
import { enqueueDelivery } from '../queues.js';

/**
 * API sends do not start as `enviada`, unlike the old Desk path. A message starts `pendente` with an `outbox_mensagem` row; a worker delivers it and state advances only after Meta confirms, as anticipated in `apps/desk/src/app/acoes.ts`. Evaluate the 24-hour window rule from `@pipe/core` BEFORE writing; outside the window, reject free text with an actionable reason rather than a later Meta error.
 */

export type TipoEnvio =
  'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'localizacao' | 'template';

export interface PedidoDeEnvio {
  tenantId: string;
  conversationId: string;
  /** Agent signing the message. Absent means an integration sends as the system. */
  agentId?: string | null;
  type?: TipoEnvio;
  texto?: string | null;
  templateId?: string | null;
  /** Body variable values in `{{1}}`, `{{2}}`, … order. */
  parametros?: string[];

  attachmentId?: string | null;
  /** Public URL for template-header media; it occupies send position 1. */
  mediaUrl?: string | null;
  /**
   * Insert the prepared reply in the SAME write as the message so it can feed effort reporting. The old screen stamped it in a second database call after send; when that call failed, the mark vanished without notice.
   */
  responseReadyId?: string | null;
  /**
   * Require the conversation to be assigned to `atendenteId` for a PERSON in a browser: agents reply only to their own work. Disable this requirement for an integration, which has no owner and sends as the system. Keep the rule here, not in the controller, so every path through `enviarMensagem` obeys it; relying on the screen previously allowed messages without an outbox.
   */
  exigirAtribuicao?: boolean;
  /**
   * Message the system sends by itself (inactivity alert). It is stored with `dados.automatica` and leaves the conversation untouched: it does not move `ultima_mensagem_*`, the state or the timeline, so it never restarts the inactivity count nor counts as agent activity.
   */
  automatica?: 'alerta_inatividade';
}

export interface MessageQueued {
  id: string;
  estadoEntrega: 'pendente';
  insideOfWindow: boolean;
  categoriaCobranca: string | null;
  content: string | null;
}

/**
 * `@pipe/core` distinguishes channels with a window from those without. Instagram, email, and widget are in the second group, as in Desk.
 */
// Pipe currently treats Instagram as a channel WITHOUT a window, like widget. Direct
// does have a 24-hour standard reply window, extended to seven days with HUMAN_AGENT;
// outside it Meta rejects sends and the worker records the failure on the message. A
// dedicated Instagram window rule in `@pipe/core` remains a product decision.
function channelOfCore(tipo: string): TypeChannel {
  return tipo === 'whatsapp_cloud' ? 'whatsapp_cloud' : 'widget';
}

type LineConversation = {
  id: string;
  state: string;
  queueId: string | null;
  agentId: string | null;
  windowExpiresAt: Date | string | null;
  firstResponseAt: Date | string | null;
  lastMessageAt: Date | string | null;
  channelId: string;
  channelType: string;
};

/** Emoji de verdade (apresentação em figura ou com seletor); dígitos e # não contam. */
const TEM_EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u;

type LinhaTemplate = {
  id: string;
  name: string;
  category: CategoriaTemplate;
  body: string;
  status_meta: string;
  cabecalho_tipo: string;
  variables: unknown;
  ativo: boolean;
};

export async function sendMessage(pedido: PedidoDeEnvio): Promise<MessageQueued> {
  const agora = new Date();

  const resultado = await noTenant(pedido.tenantId, async (tx) => {
    const { rows } = await tx.execute<LineConversation>(sql`
      select c.id, c.estado as state, c.fila_id as "queueId", c.atendente_id as "agentId",
             c.janela_expira_em as "windowExpiresAt", c.primeira_resposta_em as "firstResponseAt",
             c.ultima_mensagem_em as "lastMessageAt", ca.id as "channelId", ca.tipo as "channelType"
        from conversa c
        join inbox ib on ib.id = c.inbox_id
        join canal ca on ca.id = ib.canal_id
       where c.id = ${pedido.conversationId}
       limit 1
    `);
    const conversation = rows[0];
    if (!conversation) throw PipeError.naoEncontrado('Conversa');
    if (isClosedState(conversation.state)) {
      throw PipeError.conflito(
        'conversation_closed',
        'A conversa está encerrada. Reabra antes de responder.',
      );
    }

    // Agents reply only to their assigned conversations. An unowned queued conversation is also rejected:
    // claiming a conversation records its own `atribuida` event, and silently assigning on send
    // would cause TMR reports to miss that event.
    if (pedido.exigirAtribuicao && conversation.agentId !== pedido.agentId) {
      throw new PipeError(
        403,
        'conversation_of_other_agent',
        // O texto segue o da Blip ("Contato sendo atendido por outra pessoa. Para
        // Keep the literal "atender, solicite a transferência a…": it explains what happened and what to do.
        conversation.agentId
          ? 'Contato sendo atendido por outra pessoa. Para atender, solicite a transferência.'
          : 'Esta conversa não está atribuída a você. Assuma a conversa antes de responder.',
      );
    }

    let template: LinhaTemplate | null = null;
    if (pedido.templateId) {
      const { rows: linhas } = await tx.execute<LinhaTemplate>(sql`
        select id, nome as name, categoria as category, corpo as body, status_meta,
               cabecalho_tipo, variaveis as variables, ativo
          from template_mensagem
         where id = ${pedido.templateId} and canal_id = ${conversation.channelId}
         limit 1
      `);
      template = linhas[0] ?? null;
      if (!template) throw PipeError.naoEncontrado('Template');
      if (!template.ativo) {
        throw PipeError.conflito(
          'template_inativo',
          `O modelo "${template.name}" está desativado em Modelos de mensagens.`,
        );
      }
      if (template.status_meta !== 'aprovado') {
        throw PipeError.conflito(
          'template_nao_aprovado',
          `O template "${template.name}" está como "${template.status_meta}" na Meta.`,
        );
      }
    }

    const tipo = pedido.type ?? (template ? 'template' : 'texto');
    const evaluation = avaliarEnvio({
      channel: channelOfCore(conversation.channelType),
      expiraEm: comoData(conversation.windowExpiresAt),
      agora,
      conteudo: template ? 'template' : 'texto_livre',
      categoriaTemplate: template?.category ?? null,
    });

    if (!evaluation.permitido) {
      // Use an actionable Portuguese message because the agent reads it on screen.
      const message =
        evaluation.motivo === 'janela_fechada'
          ? 'A janela de 24 horas fechou: fora dela só sai template aprovado pela Meta. ' +
            'Escolha um template para reabrir a conversa.'
          : 'O template não tem categoria de cobrança definida.';
      throw new PipeError(409, evaluation.motivo ?? 'envio_bloqueado', message, {
        modo: evaluation.modo,
        restante_seg: Math.round(evaluation.restanteSeg),
      });
    }

    const conteudo = template
      ? renderizar(template.body, pedido.parametros ?? [])
      : (pedido.texto?.trim() ?? null);
    if (!conteudo && !pedido.attachmentId) {
      throw PipeError.request('content_empty', 'Escreva algo ou anexe um arquivo.');
    }

    // Palavras proibidas — ANTES de gravar, como o `sendTextMessage` do Desk da
    // The source (`blip-desk-regras-tecnicas.md` §3.4) rejects forbidden words before sending. Apply this to
    // texto livre assinado por atendente (inclusive a legenda de anexo); template
    // agent-authored free text, including attachment captions; templates and system/bot messages bypass the filter, as in the source.
    if (pedido.agentId && !template && conteudo) {
      await exigirSemPalavrasProibidas(tx, pedido.tenantId, conteudo);
    }

    // Preferências globais de mídia (Configurações gerais): valem para o que o atendente envia, não para template nem para o sistema.
    if (pedido.agentId && !template) {
      const { midia } = await lerConfigAtendimento(tx, pedido.tenantId);
      if (tipo === 'audio' && !midia.audio) {
        throw PipeError.conflito('audio_disabled', 'O envio de áudios está desabilitado nas Configurações gerais.');
      }
      if (tipo !== 'audio' && (tipo === 'imagem' || tipo === 'video' || tipo === 'documento' || pedido.attachmentId) && !midia.arquivos) {
        throw PipeError.conflito('files_disabled', 'O envio de arquivos está desabilitado nas Configurações gerais.');
      }
      if (conteudo && !midia.emoji && TEM_EMOJI.test(conteudo)) {
        throw PipeError.conflito('emoji_disabled', 'O uso de emojis está desabilitado nas Configurações gerais.');
      }
    }

    const { rows: criada } = await tx.execute<{ id: string }>(sql`
      insert into mensagem (
        tenant_id, conversa_id, direcao, autor_tipo, autor_id, tipo, conteudo,
        anexo_id, template_id, resposta_pronta_id, estado_entrega, criada_em,
        dentro_da_janela, categoria_cobranca, dados
      ) values (
        ${pedido.tenantId}, ${conversation.id}, 'saida',
        ${pedido.agentId ? 'atendente' : 'sistema'}, ${pedido.agentId ?? null},
        ${tipo}, ${conteudo}, ${pedido.attachmentId ?? null}, ${template?.id ?? null},
        ${pedido.responseReadyId ?? null},
        'pendente', ${agora}, ${evaluation.withinWindow},
        ${classificarCusto({
          conteudo: template ? 'template' : 'texto_livre',
          withinWindow: evaluation.withinWindow,
          categoriaTemplate: template?.category ?? null,
        })},
        ${pedido.automatica ? JSON.stringify({ automatica: pedido.automatica }) : null}::jsonb
      )
      returning id
    `);
    const messageId = criada[0]?.id;
    if (!messageId) throw new Error('não gravou a mensagem');

    await tx.execute(sql`
      insert into outbox_mensagem (tenant_id, mensagem_id, estado)
      values (${pedido.tenantId}, ${messageId}, 'pendente')
    `);

    if (!pedido.automatica) {
      // Replying moves an Assigned ticket to Open; standby is only a flag, so a reply leaves it by
      // clearing `em_espera_desde` and adding the elapsed time to `pausado_seg`.
      const stateNew = conversation.state === 'Assigned' ? 'Open' : conversation.state;
      // A REPLY presupposes a question. Count `primeira_resposta` only after the client
      // has spoken in this conversation (`ultima_mensagem_em` set). For an active-message
      // conversation we started first; counting that send as a first reply
      // primeira resposta cravaria um TMR de zero segundo — enfeitando justamente a
      // would manufacture a zero-second TMR, contrary to the metrics spec.
      const clienteJaFalou = comoData(conversation.lastMessageAt) !== null;
      const firstResponse =
        comoData(conversation.firstResponseAt) === null && !!pedido.agentId && clienteJaFalou;

      await tx.execute(sql`
      update conversa
         set estado = ${stateNew},
             pausado_seg = pausado_seg + coalesce(round(extract(epoch from (${agora}::timestamptz - em_espera_desde)))::int, 0),
             em_espera_desde = null,
             ultima_mensagem_em = ${agora}, ultima_mensagem_de = 'atendente',
             primeira_resposta_em = coalesce(primeira_resposta_em, ${firstResponse ? agora : null}),
             atualizado_em = now()
       where id = ${conversation.id}
    `);

      await registrarEvento(tx, {
        tenantId: pedido.tenantId,
        conversationId: conversation.id,
        type: 'mensagem_saida',
        at: agora,
        userId: pedido.agentId ?? null,
        queueId: conversation.queueId,
      });
      if (firstResponse) {
        await registrarEvento(tx, {
          tenantId: pedido.tenantId,
          conversationId: conversation.id,
          type: 'primeira_resposta',
          at: agora,
          userId: pedido.agentId ?? null,
          queueId: conversation.queueId,
        });
      }
    }

    await emitir(tx, pedido.tenantId, 'mensagem.criada', {
      mensagem_id: messageId,
      conversa_id: conversation.id,
      direcao: 'saida',
      tipo,
      conteudo,
    });

    return {
      messageId,
      dentroDaJanela: evaluation.withinWindow,
      categoriaCobranca: evaluation.categoriaCobranca,
      conteudo,
      valores: template
        ? posicionar(template, pedido.parametros ?? [], pedido.mediaUrl ?? null)
        : null,
    };
  });

  // Enqueue and drain outside the transaction; neither may delay commit.
  await enqueueDelivery({
    messageId: resultado.messageId,
    ...(resultado.valores ? { parametros: resultado.valores } : {}),
  });
  drenarEmSegundoPlano(pedido.tenantId);
  // Depois do commit, sempre. Ver `tempo-real.ts`.
  await publicar(pedido.tenantId, evento('conversation', pedido.conversationId));

  return {
    id: resultado.messageId,
    estadoEntrega: 'pendente',
    insideOfWindow: resultado.dentroDaJanela,
    categoriaCobranca: resultado.categoriaCobranca,
    content: resultado.conteudo,
  };
}

export interface RequestOfBatchOfAttachments {
  tenantId: string;
  conversationId: string;
  agentId?: string | null;
  /** Previously uploaded attachments from `POST /v1/anexos`, in send order. */
  attachmentIds: string[];
  /** Optional caption goes on the FIRST message of the batch, as the source does with `text`. */
  texto?: string | null;
  requireAssignment?: boolean;
}

type LineAttachment = { id: string; mime: string; bytes: string; nome_original: string | null };

/**
 * Send several attachments as ONE operation but ONE message per file, serially. This follows the source LIME protocol: each `application/vnd.lime.media-link+json` carries ONE `uri` (`referencias-blip/pesquisa/blip-api-schemas.md`, "media-link"); the Desk `ModalType.SEND_MULT_FILE` builds `mediaLinkDocuments`, capped at `MAX_ATTACHMENT_COUNT = 10` (`blip-desk-regras-tecnicas.md` §3.3). Thus `mensagem.anexo_id` remains singular. Validate the WHOLE batch before sending the first: every attachment must exist in the tenant, have an accepted type and size, and total no more than 10. The source loop aborts on one oversized file (§3.3 step 6); sending half would leave the client and agent uncertain. Send each through `enviarMensagem` in series, retaining the same 24-hour window, outbox, and event rules. If the first is rejected, none are sent.
 */
export async function sendAttachments(
  pedido: RequestOfBatchOfAttachments,
): Promise<MessageQueued[]> {
  const ids = pedido.attachmentIds.filter((id, i, lista) => lista.indexOf(id) === i);
  if (ids.length === 0) {
    throw PipeError.request('content_empty', 'Anexe ao menos um arquivo.');
  }
  if (ids.length > MAX_FILES_BY_MESSAGE) {
    throw PipeError.request(
      'attachments_excessive',
      `São no máximo ${MAX_FILES_BY_MESSAGE} arquivos por envio; vieram ${ids.length}.`,
      { limite: MAX_FILES_BY_MESSAGE, enviados: ids.length },
    );
  }
  if (ids.some((id) => !UUID.test(id))) throw PipeError.naoEncontrado('Anexo');

  const attachments = await noTenant(pedido.tenantId, async (tx) => {
    const { rows } = await tx.execute<LineAttachment>(sql`
      select id, mime, bytes::text as bytes, nome_original
        from anexo
       where id = any(${`{${ids.join(',')}}`}::uuid[])
    `);
    return rows;
  });

  const byId = new Map(attachments.map((a) => [a.id, a]));
  const ordenados: LineAttachment[] = [];
  for (const id of ids) {
    const attachment = byId.get(id);
    if (!attachment) throw PipeError.naoEncontrado('Anexo');
    // `guardarAnexo` already rejected invalid files, but recheck each size
    // so one oversized file rejects the entire batch and identifies the file.
    const nome = attachment.nome_original ?? attachment.id;
    if (!mimeAceito(attachment.mime)) {
      throw PipeError.request('type_not_accepted', `O arquivo "${nome}" é de um tipo não aceito.`, {
        anexo_id: attachment.id,
        mime: attachment.mime,
      });
    }
    const teto = maxBytesDoMime(attachment.mime);
    if (Number(attachment.bytes) > teto) {
      throw PipeError.request(
        'file_large_excessive',
        `O arquivo "${nome}" tem ${mb(Number(attachment.bytes))} MB e o limite para este tipo é ${mb(teto)} MB.`,
        { anexo_id: attachment.id, bytes: Number(attachment.bytes), limite: teto },
      );
    }
    ordenados.push(attachment);
  }

  const enviadas: MessageQueued[] = [];
  for (const [i, attachment] of ordenados.entries()) {
    enviadas.push(
      await sendMessage({
        tenantId: pedido.tenantId,
        conversationId: pedido.conversationId,
        agentId: pedido.agentId ?? null,
        type: tipoDoMime(attachment.mime),
        attachmentId: attachment.id,
        texto: i === 0 ? (pedido.texto ?? null) : null,
        exigirAtribuicao: pedido.requireAssignment ?? false,
      }),
    );
  }
  return enviadas;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mb(bytes: number): string {
  return (bytes / 1_048_576).toFixed(0);
}

/**
 * Retry a failed message. The screen used to set `mensagem` back to `pendente` but left `outbox_mensagem` as `falhou`; the worker claims by OUTBOX STATE (`where estado = 'pendente'`), so nothing was redelivered although the button said it was. Reset `tentativas` to zero because the user says the cause is fixed; keeping the old backoff could delay retry 15 minutes. Do NOT stamp `entregue_em` without Meta confirmation, since that would fabricate delivery evidence.
 */
export async function resendMessage(
  tenantId: string,
  messageId: string,
): Promise<{ id: string; stateDelivery: 'pendente' }> {
  await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      update mensagem
         set estado_entrega = 'pendente', erro_codigo = null, erro_texto = null
       where id = ${messageId}::uuid and estado_entrega = 'falhou'
      returning id
    `);
    if (!rows[0]) {
      // If no row was affected, the message is missing or no longer failed; a silent 200
      // would make the button appear to have fixed delivery.
      throw PipeError.conflito('message_not_failed', 'Esta mensagem não está mais em falha.');
    }

    const { rows: outbox } = await tx.execute<{ id: string }>(sql`
      update outbox_mensagem
         set estado = 'pendente', tentativas = 0, proxima_tentativa_em = null,
             ultimo_erro = null, atualizado_em = now()
       where mensagem_id = ${messageId}::uuid
      returning id
    `);
    if (!outbox[0]) {
      // A failed message without an outbox row is the signature of the old defect: the screen
      // stored the message but enqueued nothing. Recreating that row lets
      // the retry button repair those legacy messages.
      await tx.execute(sql`
        insert into outbox_mensagem (tenant_id, mensagem_id, estado)
        values (${tenantId}, ${messageId}::uuid, 'pendente')
      `);
    }
  });

  await enqueueDelivery({ messageId });
  return { id: messageId, stateDelivery: 'pendente' };
}

/** `{{1}}`, `{{2}}`, … in the template body; numbering here is BODY numbering. */
function renderizar(corpo: string, parametros: readonly string[]): string {
  return corpo.replace(/\{\{(\d+)\}\}/g, (_todo, numero: string) => {
    const value = parametros[Number(numero) - 1];
    return value ?? `{{${numero}}}`;
  });
}

/**
 * Map body values to send positions with the media-header offset. The offset has ONE implementation in `@pipe/workers/whatsapp`; call it here rather than duplicating it.
 */
function posicionar(
  template: LinhaTemplate,
  parametros: readonly string[],
  linkOfMedia: string | null,
): Record<string, string> {
  const cabecalho = (template.cabecalho_tipo ?? 'nenhum') as CabecalhoTemplate;
  const values: Record<string, string> = {};
  if (linkOfMedia) values['1'] = linkOfMedia;
  parametros.forEach((value, indice) => {
    values[String(positionOfVariable(indice + 1, cabecalho))] = value;
  });
  return values;
}

function comoData(valor: Date | string | null): Date | null {
  if (valor === null) return null;
  return valor instanceof Date ? valor : new Date(valor);
}
