import { sql } from 'drizzle-orm';
import {
  candidatosDoTelefone,
  normalizarWaid,
  contactRegistrarMessage,
  transitionDeliveryAllowed,
} from '@pipe/core';
import type { StateDelivery } from '@pipe/core';
import type { TransactionPipe } from '@pipe/db';
import { noTenant } from '../database.js';
import type { ChannelResolved } from '../database.js';
import { contar } from '../metrics.js';
// Ciclo consciente: `filas.ts` importa `processarPayload` daqui e daqui sai
// `enfileirarEspelhoCrm`. As duas são declarações de função, então o hoisting do ESM
// resolve — nenhuma é chamada durante a avaliação do módulo.
import {
  enqueueDownloadMedia,
  enqueueDelivery,
  enqueueMirrorCrm,
  enfileirarProcessHttp,
} from '../queues.js';
import { distribuirConversation } from './distribution.js';
import { registrarEvento } from './eventos.js';
import {
  avaliarPriority,
  loadRulesOfPriorityActive,
  type ContextOfPriority,
} from './management/priority-engine.js';
import { aplicarEventsOfTemplate } from './whatsapp/events-of-template.js';
import { flowPublishedOfChannel, rodarFlowInInbound } from './flow.js';
import { payloadDoInstagram, valuesOfInstagram } from './instagram/inbound.js';
import { payloadDoMessenger, valuesOfMessenger } from './messenger/inbound.js';
import { drenarEmSegundoPlano, emitir } from '../webhooks-saida.js';
import { evento, publicar } from '../realtime.js';

/**
 * Entrada vinda da Meta: mensagem recebida, status de entrega e erro.
 *
 * Cada evento é processado numa transação com `pipe.tenant_id` fixado, em série.
 * Reentrega de webhook é normal — a Meta repete quando não recebe 200 rápido — então
 * tudo aqui é **idempotente**: mensagem já vista pelo `id_provedor` é ignorada, e
 * status que não avança na máquina de entrega é descartado sem erro.
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
  /** Instagram: a mídia chega por URL, não por `media_id` (`instagram/entrada.ts`). */
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
  messagesRecebidas: number;
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
 * Processa um payload inteiro do webhook.
 *
 * A Meta reenvia se a resposta demorar, então quem chama já respondeu 200 — este
 * trabalho roda em fila. Devolve o resumo para o log e para o teste.
 */
export async function processarPayload(
  channel: ChannelResolved,
  payload: unknown,
): Promise<ResultInbound> {
  const resumo: ResultInbound = { messagesRecebidas: 0, statusAplicados: 0, ignorados: 0 };
  // Instagram é traduzido para o formato do WhatsApp e segue pelo mesmo caminho.
  const igUserId = channel.config['igUserId'];
  const values = payloadDoInstagram(payload)
    ? valuesOfInstagram(payload, typeof igUserId === 'string' ? igUserId : null)
    : payloadDoMessenger(payload)
      ? valuesOfMessenger(payload, typeof channel.config['paginaId'] === 'string' ? channel.config['paginaId'] : null)
    : extrairValues(payload);

  // As conversas tocadas, para avisar as telas DEPOIS do commit. `Set` porque duas
  // mensagens do mesmo cliente no mesmo lote são um aviso só.
  const tocadas = new Set<string>();
  let entrouInQueue = false;
  let respostasDoBot = 0;

  // Em série: cada valor abre a própria transação com tenant fixado.
  for (const value of values) {
    for (const message of value.messages ?? []) {
      const recebida = await receiveMessage(channel, value, message);
      if (recebida) {
        resumo.messagesRecebidas += 1;
        tocadas.add(recebida.conversationId);
        entrouInQueue = true;
        respostasDoBot += recebida.respostasDoBot;
        if (recebida.processHttpId) {
          await enfileirarProcessHttp({ tenantId: channel.tenantId, processoId: recebida.processHttpId });
        }
        // Depois do commit da transação de entrada (`receberMensagem` já voltou): o
        // download fala com a Meta, e isso não pode acontecer com uma conexão do
        // pool de banco presa numa transação. Ver `dominio/midia.ts`.
        if (recebida.attachmentId) {
          await enqueueDownloadMedia({ tenantId: channel.tenantId, anexoId: recebida.attachmentId });
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

  // Status e categoria de modelo não são conversa: não entram no resumo de mensagens.
  const modelos = channel.type === 'whatsapp_cloud' ? await aplicarEventsOfTemplate(channel, payload) : 0;

  if (resumo.messagesRecebidas > 0 || resumo.statusAplicados > 0 || modelos > 0) {
    drenarEmSegundoPlano(channel.tenantId);
  }
  // Depois do commit: a resposta do bot já está no outbox, e o empurrão faz o worker
  // entregar agora em vez de na próxima varredura.
  if (respostasDoBot > 0) await enqueueDelivery({});

  // **Depois do commit.** Publicar dentro da transação avisaria a tela antes de o
  // dado existir: ela buscaria o valor velho e não receberia segundo aviso — que é
  // o próprio defeito que o tempo real existe para consertar.
  for (const conversationId of tocadas) {
    await publicar(channel.tenantId, evento('conversation', conversationId));
  }
  // Mensagem nova mexe no tamanho e na ordem da fila; a lista do Desk repinta por isto.
  if (entrouInQueue) await publicar(channel.tenantId, evento('queue'));

  return resumo;
}

export function extrairValues(payload: unknown): ValueOfWebhook[] {
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
    // Idempotência. Sem índice único em `id_provedor` (a tabela é particionada e a
    // unicidade dela é `(id, criada_em)`), a guarda é esta consulta. Duas entregas
    // simultâneas do mesmo evento ainda poderiam passar as duas — a janela é curta e
    // o custo seria uma mensagem repetida na tela, não perda de dado.
    const { rows: jaVista } = await tx.execute<{ existe: number }>(
      sql`select 1 as existe from mensagem where id_provedor = ${idProvedor} limit 1`,
    );
    if (jaVista.length > 0) return null;

    const inbox = await acharInbox(tx, canal.id);
    const contactId = await findOrCreateContact(tx, canal, de, nomeDoPerfil);
    // Com fluxo (ou roteador) publicado no canal, a conversa nova é do bot: nasce sem fila.
    const flow = await flowPublishedOfChannel(tx, canal.id, contactId);
    // Calculado ANTES de abrir a conversa: `regra_prioridade` pode condicionar no
    // texto da primeira mensagem, e `acharOuAbrirConversa` aplica a regra assim que
    // a conversa nasce na fila.
    const conteudo = textoDe(mensagem);
    const conversation = await findOrOpenConversation(tx, canal, inbox, contactId, em, flow !== null, {
      message: conteudo,
      nomeDoPerfil,
    });

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

    // A janela de 24h é recalculada a cada mensagem de entrada do contato — a regra
    // está em `@pipe/core`, não aqui.
    const window = contactRegistrarMessage(em, messageId ?? undefined);
    await tx.execute(sql`
      update conversa
         set ultima_mensagem_em = ${em}, ultima_mensagem_de = 'contato',
             janela_expira_em = ${window.expiraEm},
             janela_aberta_por_mensagem_id = ${window.abertaByMessageId ?? null},
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

    // O bot fala primeiro. Se ficou com a mensagem, a conversa é dele — ou acabou de
    // ser transferida, e a distribuição já rodou lá dentro.
    const bot = await rodarFlowInInbound(tx, flow, {
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

    // Conversa parada na fila é candidata a distribuição a cada mensagem nova: se o
    // atendente entrou online depois da primeira, ela sai da fila agora.
    if (!bot.tratou && conversation.state === 'na_fila' && !conversation.agentId && conversation.queueId) {
      await distribuirConversation(tx, canal.tenantId, conversation.id, conversation.queueId, em);
    }

    return {
      conversaId: conversation.id,
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
      select id, conversa_id, estado_entrega from mensagem
       where id_provedor = ${idProvedor} limit 1
    `);
    const message = rows[0];
    if (!message) return null;

    // Status fora de ordem é rotina na Meta: `delivered` pode chegar depois de `read`.
    // Transição não permitida é descartada em silêncio — nunca vira erro nem regressão.
    const atual = message.stateDelivery;
    if (atual === alvo) return null;
    if (atual !== null && !transitionDeliveryAllowed(atual, alvo)) return null;

    // `coalesce` nos carimbos: `read` que chega antes de `delivered` não pode apagar
    // nem reescrever a hora da entrega. Carimbo já gravado é histórico.
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

    // O outbox acompanha, senão a varredura tentaria entregar de novo o que já chegou.
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

    // O desfecho da entrega é aqui que vira número: é este webhook que a Meta usa
    // para dizer se a mensagem chegou. `entregue` conta uma vez, `lida` não conta de
    // novo — senão a taxa de falha do alerta `EntregaFalhando` seria diluída por
    // cada leitura.
    // ponytail: rótulo `canal` é o id do canal, uma série por número de WhatsApp.
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

// --- peças reutilizadas ---

interface InboxResolvida {
  id: string;
  queueDefaultId: string | null;
}

async function acharInbox(tx: TransactionPipe, channelId: string): Promise<InboxResolvida> {
  const { rows } = await tx.execute<{ id: string; queueDefaultId: string | null }>(
    sql`select id, fila_padrao_id from inbox where canal_id = ${channelId} order by criado_em limit 1`,
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
  // A Meta ainda entrega número brasileiro antigo sem o nono dígito, e o importador
  // grava a forma canônica, com o 9: casar só a forma exata abria ficha nova para
  // quem já estava na base. As variantes vêm do porte do Chatwoot
  // (`phone_number_normalization_service`); a forma recebida ganha quando as duas existem.
  const candidatos =
    canal.type === 'whatsapp_cloud' ? candidatosDoTelefone(identificador) : [identificador];
  const { rows } = await tx.execute<{ contactId: string }>(sql`
    select contato_id from contato_identidade
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

  // O telefone só é preenchido no WhatsApp: no Instagram o identificador é a conta,
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

  // O espelho no CRM é trabalho de fila, e enfileirar não pode derrubar o
  // atendimento: `enfileirarEspelhoCrm` engole a própria falha, e a varredura de
  // 5 minutos recupera o que não entrou. Ver `dominio/espelho-crm.ts`.
  await enqueueMirrorCrm({ tenantId: canal.tenantId, contactId });
  return contatoId;
}

interface ConversationResolved {
  id: string;
  state: string;
  agentId: string | null;
  queueId: string | null;
  /** Nasceu com esta mensagem — só conversa nova começa fluxo. */
  nova: boolean;
}

async function findOrOpenConversation(
  tx: TransactionPipe,
  canal: ChannelResolved,
  inbox: InboxResolvida,
  contactId: string,
  em: Date,
  comBot: boolean,
  contextPriority: { message: string | null; nomeDoPerfil: string | null },
): Promise<ConversationResolved> {
  const { rows } = await tx.execute<{
    id: string;
    state: string;
    agentId: string | null;
    queueId: string | null;
  }>(sql`
    select id, estado, atendente_id, fila_id from conversa
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

  // Com bot, a conversa nasce sem fila: só entra na fila quando o bot transferir.
  const queueId = comBot ? null : inbox.queueDefaultId;
  const { rows: criada } = await tx.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, fila_id, estado, criada_em)
    values (${canal.tenantId}, ${inbox.id}, ${contactId}, ${queueId}, 'na_fila', ${em})
    returning id
  `);
  const conversaId = criada[0]?.id;
  if (!conversaId) throw new Error('não criou a conversa');

  // `criada` e `enfileirada` marcam o começo do ATENDIMENTO, e é deles que sai o tempo
  // de fila. Conversa com bot os ganha no transbordo (`dominio/fluxo.ts`), não aqui.
  if (!comBot) {
    await registrarEvento(tx, {
      tenantId: canal.tenantId,
      conversationId,
      type: 'criada',
      at: em,
      queueId,
    });
    await registrarEvento(tx, {
      tenantId: canal.tenantId,
      conversationId,
      type: 'enfileirada',
      at: em,
      queueId,
    });
    // A conversa acabou de entrar na fila — é o único momento em que
    // `aplicarRegraDePrioridade` roda para ela (`dominio/gestao/prioridade-motor.ts`).
    // Sem bot, é AQUI, e não no transbordo (`fluxo.ts`), porque sem bot não há
    // transbordo: a conversa nasce direto na fila.
    await aplicarRuleOfPriority(tx, conversaId, {
      queueId,
      message: contextPriority.message,
      contact: { nome: contextPriority.nomeDoPerfil },
    });
  }
  await emitir(tx, canal.tenantId, 'conversa.criada', {
    conversa_id: conversaId,
    contato_id: contactId,
    fila_id: queueId,
  });

  return { id: conversaId, state: 'na_fila', agentId: null, queueId, nova: true };
}

/**
 * Aplica `regra_prioridade` a uma conversa que ACABOU de entrar na fila.
 * Sem regra ativa cadastrada, não toca em nada — `conversa.prioridade` mantém
 * o padrão `sem_prioridade` da coluna.
 */
async function aplicarRuleOfPriority(
  tx: TransactionPipe,
  conversaId: string,
  context: ContextOfPriority,
): Promise<void> {
  const regras = await loadRulesOfPriorityActive(tx);
  if (regras.length === 0) return;
  const nivel = avaliarPriority(regras, context);
  if (!nivel) return;
  await tx.execute(sql`
    update conversa set prioridade = ${nivel}, atualizado_em = now() where id = ${conversaId}
  `);
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
 * A Meta manda só o `media_id`; o arquivo é baixado depois pelo endpoint de mídia.
 * Aqui fica a linha de `anexo` com a referência, para a mensagem não nascer órfã.
 * `bytes = 0` marca "ainda não baixado" — o download é trabalho de fila
 * (`dominio/midia.ts`), não de webhook, porque a Meta reenvia se a resposta demorar.
 *
 * `canal_id` é gravado aqui porque é aqui que o canal já está em mãos: é dele que o
 * download tira o token, sem precisar juntar `mensagem`/`conversa`/`inbox` depois.
 */
async function saveAttachment(
  tx: TransactionPipe,
  tenantId: string,
  canalId: string,
  mensagem: MessageOfMeta,
): Promise<string | null> {
  const media =
    mensagem.image ?? mensagem.audio ?? mensagem.video ?? mensagem.document ?? mensagem.sticker;
  // Sem `media_id`, a URL do Instagram vira a chave. A URL da Meta expira; quem baixa
  // para o storage de verdade é `dominio/midia.ts`.
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
