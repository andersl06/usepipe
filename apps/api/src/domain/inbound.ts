import { sql } from 'drizzle-orm';
import {
  candidatosDoTelefone,
  normalizarWaid,
  contactRegisterMessage,
  transitionDeliveryAllowed,
} from '@pipe/core';
import type { StateDelivery } from '@pipe/core';
import type { TransactionPipe } from '@pipe/db';
import { noTenant } from '../database.js';
import type { ChannelResolved } from '../database.js';
import { contar } from '../metrics.js';
// Ciclo consciente: `filas.ts` importa `processarPayload` daqui e daqui sai
// `enfileirarEspelhoCrm` is also a function declaration, so ESM hoisting
// resolves the cycle; neither function runs during module evaluation.
import {
  enqueueDownloadMedia,
  enqueueDelivery,
  enqueueMirrorCrm,
  enfileirarProcessHttp,
} from '../queues.js';
import { distributeConversation } from './distribution.js';
import { registrarEvento } from './eventos.js';
import { enterQueue } from './queue-entry.js';
import { applyEventsOfTemplate } from './whatsapp/events-of-template.js';
import { flowPublishedOfChannel, runFlowInInbound } from './flow.js';
import { payloadDoInstagram, valuesOfInstagram } from './instagram/inbound.js';
import { payloadDoMessenger, valuesOfMessenger } from './messenger/inbound.js';
import { drenarEmSegundoPlano, emitir } from '../webhooks-saida.js';
import { evento, publicar } from '../realtime.js';

/**
 * Meta inbound events include received messages, delivery statuses, and errors. Process each event serially in a transaction with `pipe.tenant_id` set. Meta retries webhooks when it does not receive 200 quickly, so this path is idempotent: ignore a message already seen by `id_provedor`, and discard a delivery status that cannot advance the state machine without error.
 */

export interface ValueOfWebhook {
  messaging_product?: string;
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: MessageOfMeta[];
  statuses?: StatusDaMeta[];
  errors?: MetaError[];
}

export interface MessageOfMeta {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: MediaOfMeta;
  audio?: MediaOfMeta;
  video?: MediaOfMeta;
  document?: MediaOfMeta & { filename?: string };
  sticker?: MediaOfMeta;
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
  errors?: MetaError[];
}

interface MediaOfMeta {
  id?: string;
  /** Instagram media arrives by URL, not `media_id` (`instagram/entrada.ts`). */
  url?: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
}

interface StatusDaMeta {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: MetaError[];
}

interface MetaError {
  code?: number;
  title?: string;
  message?: string;
  error_data?: { details?: string };
}

export interface ResultInbound {
  messagesReceived: number;
  statusAplicados: number;
  ignorados: number;
}

/** Tipos da Meta → `mensagem.tipo` do Pipe. */
const TIPO_DA_META: Readonly<Record<string, string>> = {
  text: 'texto',
  image: 'imagem',
  audio: 'audio',
  voice: 'audio',
  video: 'video',
  document: 'documento',
  sticker: 'imagem',
  location: 'localizacao',
  button: 'texto',
  interactive: 'texto',
};

const STATUS_DA_META: Readonly<Record<string, StateDelivery>> = {
  sent: 'enviada',
  delivered: 'entregue',
  read: 'lida',
  failed: 'falhou',
};

/**
 * Process a whole webhook payload after the caller has replied 200. Meta retries slow responses, so processing runs on a queue. Return a summary for logs and tests.
 */
export async function processarPayload(
  channel: ChannelResolved,
  payload: unknown,
): Promise<ResultInbound> {
  const resumo: ResultInbound = { messagesReceived: 0, statusAplicados: 0, ignorados: 0 };
  // Translate Instagram into WhatsApp shape and follow the shared inbound path.
  const igUserId = channel.config['igUserId'];
  const values = payloadDoInstagram(payload)
    ? valuesOfInstagram(payload, typeof igUserId === 'string' ? igUserId : null)
    : payloadDoMessenger(payload)
      ? valuesOfMessenger(payload, typeof channel.config['paginaId'] === 'string' ? channel.config['paginaId'] : null)
    : extractValues(payload);

  // Collect touched conversations to notify screens AFTER commit. A `Set` means two
  // messages from the same client in one batch produce one notification.
  const tocadas = new Set<string>();
  let enteredInQueue = false;
  let respostasDoBot = 0;

  // Run serially: each value opens its own transaction with a fixed tenant.
  for (const value of values) {
    for (const message of value.messages ?? []) {
      const recebida = await receiveMessage(channel, value, message);
      if (recebida) {
        resumo.messagesReceived += 1;
        tocadas.add(recebida.conversationId);
        enteredInQueue = true;
        respostasDoBot += recebida.respostasDoBot;
        if (recebida.processHttpId) {
          await enfileirarProcessHttp({ tenantId: channel.tenantId, processoId: recebida.processHttpId });
        }
        // After the inbound transaction commits (`receberMensagem` has returned),
        // media download calls Meta and must not hold a database pool connection
        // inside the transaction; see `dominio/midia.ts`.
        if (recebida.attachmentId) {
          await enqueueDownloadMedia({ tenantId: channel.tenantId, attachmentId: recebida.attachmentId });
        }
      } else resumo.ignorados += 1;
    }
    for (const status of value.statuses ?? []) {
      const conversationId = await aplicarStatus(channel, status);
      if (conversationId) {
        resumo.statusAplicados += 1;
        tocadas.add(conversationId);
      } else resumo.ignorados += 1;
    }
  }

  // Template status and category events are not conversations; exclude them from the message summary.
  const modelos = channel.type === 'whatsapp_cloud' ? await applyEventsOfTemplate(channel, payload) : 0;

  if (resumo.messagesReceived > 0 || resumo.statusAplicados > 0 || modelos > 0) {
    drenarEmSegundoPlano(channel.tenantId);
  }
  // After commit, the bot's response is in the outbox; nudging the worker
  // delivers it now instead of waiting for the next sweep.
  if (respostasDoBot > 0) await enqueueDelivery({});

  // Publish AFTER commit. Publishing inside the transaction would tell screens
  // before the data exists; they would fetch the old value and receive no second
  // notification, defeating the purpose of realtime updates.
  for (const conversationId of tocadas) {
    await publicar(channel.tenantId, evento('conversation', conversationId));
  }
  // Mensagem nova mexe no tamanho e na ordem da fila; a lista do Desk repinta por isto.
  if (enteredInQueue) await publicar(channel.tenantId, evento('queue'));

  return resumo;
}

export function extractValues(payload: unknown): ValueOfWebhook[] {
  const corpo = payload as { entry?: { changes?: { field?: string; value?: ValueOfWebhook }[] }[] };
  const valores: ValueOfWebhook[] = [];
  for (const inbound of corpo?.entry ?? []) {
    for (const mudanca of inbound.changes ?? []) {
      if (mudanca.value) valores.push(mudanca.value);
    }
  }
  return valores;
}

async function receiveMessage(
  canal: ChannelResolved,
  valor: ValueOfWebhook,
  mensagem: MessageOfMeta,
): Promise<{
  conversationId: string;
  respostasDoBot: number;
  attachmentId: string | null;
  processHttpId?: string;
} | null> {
  const idProvedor = mensagem.id;
  const de = mensagem.from;
  if (!idProvedor || !de) return null;

  const em = mensagem.timestamp ? new Date(Number(mensagem.timestamp) * 1000) : new Date();
  const nomeDoPerfil = valor.contacts?.find((c) => c.wa_id === de)?.profile?.name ?? null;

  return noTenant(canal.tenantId, async (tx) => {
    // Idempotency relies on this query because partitioned `mensagem` has no unique index on `id_provedor`
    // The table's unique key is `(id, criada_em)`, not `id_provedor`; concurrent deliveries
    // of the same event can still pass; the window is short and the cost is a
    // duplicate screen message rather than data loss.
    const { rows: jaVista } = await tx.execute<{ existe: number }>(
      sql`select 1 as existe from mensagem where id_provedor = ${idProvedor} limit 1`,
    );
    if (jaVista.length > 0) return null;

    const inbox = await acharInbox(tx, canal.id);
    const contactId = await findOrCreateContact(tx, canal, de, nomeDoPerfil);
    // With a published flow or router on the channel, a new conversation belongs to the bot and starts without a queue.
    const flow = await flowPublishedOfChannel(tx, canal.id, contactId);
    // Read BEFORE opening the conversation: the attendance and priority rules may test the first message.
    const conteudo = textoDe(mensagem);
    const conversation = await findOrOpenConversation(tx, canal, inbox, contactId, em, flow !== null, conteudo);

    const tipo = TIPO_DA_META[mensagem.type ?? 'text'] ?? 'texto';
    const attachmentId = await saveAttachment(tx, canal.tenantId, canal.id, mensagem);

    const { rows: criada } = await tx.execute<{ id: string }>(sql`
      insert into mensagem (
        tenant_id, conversa_id, direcao, autor_tipo, tipo, conteudo, anexo_id,
        id_provedor, criada_em, dentro_da_janela
      ) values (
        ${canal.tenantId}, ${conversation.id}, 'entrada', 'contato', ${tipo}, ${conteudo},
        ${attachmentId}, ${idProvedor}, ${em}, true
      )
      returning id
    `);
    const messageId = criada[0]?.id ?? null;

    // Recalculate the 24-hour window after every inbound contact message; the rule
    // lives in `@pipe/core`, not here.
    const window = contactRegisterMessage(em, messageId ?? undefined);
    await tx.execute(sql`
      update conversa
         set ultima_mensagem_em = ${em}, ultima_mensagem_de = 'contato',
             janela_expira_em = ${window.expiraEm},
             janela_aberta_por_mensagem_id = ${window.openByMessageId ?? null},
             atualizado_em = now()
       where id = ${conversation.id}
    `);

    await registrarEvento(tx, {
      tenantId: canal.tenantId,
      conversationId: conversation.id,
      type: 'mensagem_entrada',
      at: em,
      queueId: conversation.queueId,
    });

    await emitir(tx, canal.tenantId, 'mensagem.criada', {
      mensagem_id: messageId,
      conversa_id: conversation.id,
      direcao: 'entrada',
      tipo,
      conteudo,
    });

    // The bot speaks first. If it handled the message, it owns the conversation, or
    // has already transferred it and triggered distribution inside that path.
    const bot = await runFlowInInbound(tx, flow, {
      tenantId: canal.tenantId,
      conversation: {
        id: conversation.id,
        nova: conversation.nova,
        queueId: conversation.queueId,
        agentId: conversation.agentId,
        queueDefaultId: inbox.queueDefaultId,
      },
      contactId,
      message: { id: messageId, idProvedor, type: tipo, content: conteudo },
    });

    // A conversation still queued is eligible for distribution on each new message if
    // atendente entrou online depois da primeira, ela sai da fila agora.
    if (!bot.tratou && !conversation.nova && conversation.state === 'na_fila' && !conversation.agentId && conversation.queueId) {
      await distributeConversation(tx, canal.tenantId, conversation.id, conversation.queueId, em);
    }

    return {
      conversationId: conversation.id,
      respostasDoBot: bot.respostas,
      attachmentId,
      ...(bot.processHttpId ? { processHttpId: bot.processHttpId } : {}),
    };
  });
}

async function aplicarStatus(canal: ChannelResolved, status: StatusDaMeta): Promise<string | null> {
  const idProvedor = status.id;
  const alvo = STATUS_DA_META[status.status ?? ''];
  if (!idProvedor || !alvo) return null;

  const em = status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date();
  const error = status.errors?.[0];

  return noTenant(canal.tenantId, async (tx) => {
    const { rows } = await tx.execute<{
      id: string;
      conversationId: string;
      stateDelivery: StateDelivery | null;
    }>(sql`
      select id, conversa_id as "conversationId", estado_entrega as "stateDelivery" from mensagem
       where id_provedor = ${idProvedor} limit 1
    `);
    const message = rows[0];
    if (!message) return null;

    // Out-of-order Meta statuses are routine: `delivered` may arrive after `read`.
    // Discard a disallowed transition quietly; never return an error or regress status.
    const atual = message.stateDelivery;
    if (atual === alvo) return null;
    if (atual !== null && !transitionDeliveryAllowed(atual, alvo)) return null;

    // Use `coalesce` on timestamps: an early `read` must not clear the `delivered` timestamp or
    // rewrite the delivery time. A stored timestamp is historical evidence.
    await tx.execute(sql`
      update mensagem
         set estado_entrega = ${alvo},
             entregue_em = ${
               alvo === 'entregue' || alvo === 'lida' ? sql`coalesce(entregue_em, ${em})` : sql`entregue_em`
             },
             lida_em = ${alvo === 'lida' ? sql`coalesce(lida_em, ${em})` : sql`lida_em`},
             erro_codigo = ${alvo === 'falhou' ? String(error?.code ?? 'desconhecido') : null},
             erro_texto = ${
               alvo === 'falhou'
                 ? (error?.error_data?.details ?? error?.title ?? 'A Meta recusou a mensagem.')
                 : null
             }
       where id = ${message.id}
    `);

    // Keep the outbox in sync, or the sweep would resend a message already delivered.
    await tx.execute(sql`
      update outbox_mensagem
         set estado = ${alvo === 'falhou' ? 'falhou' : alvo}, atualizado_em = now()
       where mensagem_id = ${message.id}
    `);

    await emitir(tx, canal.tenantId, 'mensagem.estado_entrega_alterado', {
      mensagem_id: message.id,
      conversa_id: message.conversationId,
      estado_anterior: atual,
      estado_novo: alvo,
    });

    // This webhook turns delivery outcomes into metrics: it is how Meta tells us
    // whether a message arrived. Count `entregue` once; `lida` must not count
    // again, or each read would dilute failure-rate alert `EntregaFalhando`.
    // cada leitura.
    // Future work: `canal` labels each WhatsApp number's own time series.
    // Se a base passar de alguns milhares de canais, trocar por `canal.tipo` e
    // deixar o detalhe para o log.
    if (alvo === 'falhou' || alvo === 'entregue') {
      contar('pipe_message_delivery_total', {
        canal: canal.id,
        resultado: alvo === 'falhou' ? 'falha' : 'sucesso',
      });
    }

    return message.conversationId;
  });
}


interface InboxResolvida {
  id: string;
  queueDefaultId: string | null;
}

async function acharInbox(tx: TransactionPipe, channelId: string): Promise<InboxResolvida> {
  const { rows } = await tx.execute<{ id: string; queueDefaultId: string | null }>(
    sql`select id, fila_padrao_id as "queueDefaultId" from inbox where canal_id = ${channelId} order by criado_em limit 1`,
  );
  const linha = rows[0];
  if (!linha) throw new Error(`canal ${channelId} não tem inbox: a mensagem não tem onde cair.`);
  return { id: linha.id, queueDefaultId: linha.queueDefaultId };
}

async function findOrCreateContact(
  tx: TransactionPipe,
  canal: ChannelResolved,
  identificador: string,
  nome: string | null,
): Promise<string> {
  // Meta still sends older Brazilian numbers without the ninth digit, while the importer
  // stores the canonical form with 9. Exact-only matching would create a new contact for
  // someone already in the database. Candidate variants come from the Chatwoot port
  // (`phone_number_normalization_service`); prefer the received form if both exist.
  const candidatos =
    canal.type === 'whatsapp_cloud' ? candidatosDoTelefone(identificador) : [identificador];
  const { rows } = await tx.execute<{ contactId: string }>(sql`
    select contato_id as "contactId" from contato_identidade
     where canal_tipo = ${canal.type}
       and identificador in (${sql.join(
         candidatos.map((c) => sql`${c}`),
         sql`, `,
       )})
     order by identificador = ${identificador} desc
     limit 1
  `);
  const existente = rows[0]?.contactId;
  if (existente) return existente;

  // Populate phone only for WhatsApp; on Instagram the identifier is the account,
  // e escrever conta de Instagram em `telefone_e164` estragaria a busca por telefone.
  const telefone = canal.type === 'whatsapp_cloud' ? `+${normalizarWaid(identificador)}` : null;
  const { rows: criado } = await tx.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${canal.tenantId}, ${nome}, ${telefone})
    returning id
  `);
  const contatoId = criado[0]?.id;
  if (!contatoId) throw new Error('não criou o contato');

  await tx.execute(sql`
    insert into contato_identidade (tenant_id, contato_id, canal_tipo, identificador)
    values (${canal.tenantId}, ${contatoId}, ${canal.type}, ${identificador})
    on conflict (tenant_id, canal_tipo, identificador) do nothing
  `);

  await emitir(tx, canal.tenantId, 'contato.criado', { contato_id: contatoId, nome, telefone });

  // CRM mirroring is queue work, and enqueue failure must not break
  // the conversation: `enfileirarEspelhoCrm` absorbs its own error, and a
  // five-minute sweep recovers missed jobs. See `dominio/espelho-crm.ts`.
  await enqueueMirrorCrm({ tenantId: canal.tenantId, contactId: contatoId });
  return contatoId;
}

interface ConversationResolved {
  id: string;
  state: string;
  agentId: string | null;
  queueId: string | null;
  /** Created by this message; only a new conversation starts a flow. */
  nova: boolean;
}

async function findOrOpenConversation(
  tx: TransactionPipe,
  canal: ChannelResolved,
  inbox: InboxResolvida,
  contactId: string,
  em: Date,
  comBot: boolean,
  message: string | null,
): Promise<ConversationResolved> {
  const { rows } = await tx.execute<{
    id: string;
    state: string;
    agentId: string | null;
    queueId: string | null;
  }>(sql`
    select id, estado as state, atendente_id as "agentId", fila_id as "queueId" from conversa
     where contato_id = ${contactId} and inbox_id = ${inbox.id} and estado <> 'encerrada'
     order by criada_em desc
     limit 1
  `);
  const aberta = rows[0];
  if (aberta) {
    return {
      id: aberta.id,
      state: aberta.state,
      agentId: aberta.agentId,
      queueId: aberta.queueId,
      nova: false,
    };
  }

  // Born without a queue. With a bot it joins one only when the bot hands it off; without a bot it
  // enters now, through the same path as the handoff (attendance rules, priority, distribution).
  const { rows: criada } = await tx.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, estado, criada_em)
    values (${canal.tenantId}, ${inbox.id}, ${contactId}, null, 'na_fila', ${em})
    returning id
  `);
  const conversaId = criada[0]?.id;
  if (!conversaId) throw new Error('não criou a conversa');

  const emitCreated = async (queueId: string | null): Promise<void> => {
    await emitir(tx, canal.tenantId, 'conversa.criada', { conversa_id: conversaId, contato_id: contactId, fila_id: queueId });
  };
  if (comBot) {
    await emitCreated(null);
    return { id: conversaId, state: 'na_fila', agentId: null, queueId: null, nova: true };
  }
  const entry = await enterQueue(tx, {
    tenantId: canal.tenantId,
    conversationId: conversaId,
    queueId: null,
    defaultQueueId: inbox.queueDefaultId,
    message,
    at: em,
    origin: 'entrada',
    beforeDistribution: emitCreated,
  });
  return {
    id: conversaId,
    state: entry.agentId ? 'atribuida' : 'na_fila',
    agentId: entry.agentId,
    queueId: entry.queueId,
    nova: true,
  };
}

function textoDe(mensagem: MessageOfMeta): string | null {
  if (mensagem.text?.body) return mensagem.text.body;
  if (mensagem.button?.text) return mensagem.button.text;
  if (mensagem.interactive?.button_reply?.title) return mensagem.interactive.button_reply.title;
  if (mensagem.interactive?.list_reply?.title) return mensagem.interactive.list_reply.title;
  if (mensagem.location) {
    const { latitude, longitude, name } = mensagem.location;
    return name ?? `${latitude}, ${longitude}`;
  }
  return (
    mensagem.image?.caption ??
    mensagem.video?.caption ??
    mensagem.document?.caption ??
    mensagem.audio?.caption ??
    null
  );
}

/**
 * Meta provides only `media_id`; download follows through its media endpoint. Create an `anexo` row with the reference so the message is not orphaned. `bytes = 0` means not yet downloaded. Download is queue work (`dominio/midia.ts`), not webhook work, because Meta retries slow responses. Store `canal_id` here while the channel is known so download can get its token without joining `mensagem`/`conversa`/`inbox`.
 */
async function saveAttachment(
  tx: TransactionPipe,
  tenantId: string,
  canalId: string,
  mensagem: MessageOfMeta,
): Promise<string | null> {
  const media =
    mensagem.image ?? mensagem.audio ?? mensagem.video ?? mensagem.document ?? mensagem.sticker;
  // Without `media_id`, use the Instagram URL as the key. Meta's URL expires;
  // `dominio/midia.ts` copies it to durable storage.
  const key = media?.id ? `meta:${media.id}` : media?.url;
  if (!media || !key) return null;

  const { rows } = await tx.execute<{ id: string }>(sql`
    insert into anexo (tenant_id, canal_id, chave_storage, mime, bytes, nome_original, checksum)
    values (
      ${tenantId}, ${canalId}, ${key}, ${media.mime_type ?? 'application/octet-stream'}, 0,
      ${mensagem.document?.filename ?? null}, ${media.sha256 ?? null}
    )
    returning id
  `);
  return rows[0]?.id ?? null;
}
