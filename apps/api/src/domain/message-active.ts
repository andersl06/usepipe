import { sql } from 'drizzle-orm';
import type { TransactionPipe } from '@pipe/db';
import { noTenant } from '../database.js';
import type { ChannelResolved } from '../database.js';
import { PipeError } from '../errors.js';
import { registrarEvento } from './eventos.js';
import { chooseQueueOfConversation, flowOfConversation } from './queue-entry.js';
import { sendMessage } from './envio.js';
import { lerConfigAtendimento } from './management/atendimento-config.js';
import { emitir } from '../webhooks-saida.js';

/**
 * Active message sends a template to a list of contacts, following `referencias-blip/pesquisa/blip-desk-mensagens-ativas.md` and Blip's limits. Reuse `enviarMensagem` for the 24-hour window, outbox, template variable positions, event, and webhook; this module adds contact resolution, rejection, and batch cap. Results are per contact: one invalid number must not reject the other valid contacts.
 */

/** `SELECTED_CONTACT_LIST_LIMIT` = 15 (config `ActiveMessageLimitBatchDispatch`). */
export const MAX_CONTACTS_BY_TRIGGER = Number(
  process.env['PIPE_MENSAGEM_ATIVA_MAX_CONTATOS'] ?? 15,
);

/**
 * `ActiveMessageLimitCount` caps active messages to the same contact per day; zero disables the limit, as in Blip's default.
 */
export const DAILY_LIMIT_BY_CONTACT = Number(
  process.env['PIPE_MENSAGEM_ATIVA_LIMITE_DIARIO'] ?? 0,
);

export type MotivoDeRecusa =
  | 'numero_invalido'
  | 'ja_em_atendimento'
  | 'limite_diario'
  | 'contact_duplicated';

export interface DestinationOfTrigger {
  /** Either an existing contact or a phone number to find or register. */
  contatoId?: string | null;
  phone?: string | null;
  name?: string | null;
  /** Body variables for this contact; fall back to batch variables when absent. */
  parametros?: string[] | null;
}

export interface ResultOfDestination {
  phone: string | null;
  contatoId: string | null;
  enviada: boolean;
  mensagemId?: string;
  conversationId?: string;
  motivo?: MotivoDeRecusa;
  detalhe?: string;
}

export interface PedidoDeDisparo {
  tenantId: string;
  channelId: string;
  templateId: string;
  destinos: DestinationOfTrigger[];
  parametros?: string[];
  /** Initiating agent; assign the new conversation to that person, as in Blip Desk. */
  agentId?: string | null;
  /** Explicit queue; must belong to the flow serving the channel. Without it, the flow default queue (or none). */
  queueId?: string | null;
}

/**
 * E.164 requires `+` and 8–15 digits; for Brazil require country code 55, area code, and an 8- or 9-digit number. Blip displays "Número de telefone pode ser inválido" and blocks with `active-message-block-invalid-phonenumber`. Always block here: an invalid number incurs Meta's charged conversation without delivering the template.
 */
export function telefoneValido(bruto: string): boolean {
  // Strip formatting punctuation only: spaces, parentheses, hyphens, and periods. Reject letters and all other characters instead of deleting them; otherwise a mistyped number could become a different valid number and send a Meta-billed template to the wrong person.
  const limpo = bruto.replace(/[\s()\-.]/g, '');
  if (!/^\+\d{8,15}$/.test(limpo)) return false;
  if (limpo.startsWith('+55')) return /^\+55\d{2}\d{8,9}$/.test(limpo);
  return true;
}

function normalizar(bruto: string): string {
  const limpo = bruto.replace(/[\s()\-.]/g, '');
  return limpo.startsWith('+') ? limpo : `+${limpo}`;
}

export async function triggerMessageActive(
  canal: ChannelResolved,
  pedido: PedidoDeDisparo,
): Promise<ResultOfDestination[]> {
  if (pedido.destinos.length === 0) {
    throw PipeError.request('without_destination', 'Escolha ao menos um contato.');
  }
  // Preferências globais (Configurações gerais): interruptor do envio e limite por disparo, que só reduz o teto.
  const { mensagensAtivas } = await noTenant(pedido.tenantId, (tx) =>
    lerConfigAtendimento(tx, pedido.tenantId),
  );
  if (!mensagensAtivas.ativo) {
    throw PipeError.conflito(
      'active_messages_disabled',
      'O envio de mensagens ativas está desabilitado nas Configurações gerais.',
    );
  }
  const limite = Math.min(MAX_CONTACTS_BY_TRIGGER, mensagensAtivas.limitePorDisparo);
  if (pedido.destinos.length > limite) {
    throw PipeError.request('limit_of_contacts', `O limite é de ${limite} contatos por disparo.`, {
      limite,
      enviados: pedido.destinos.length,
    });
  }

  const resultados: ResultOfDestination[] = [];
  const jaVistos = new Set<string>();

  // Run serially, never with `Promise.all`: each destination opens its own transaction. Parallel work on one connection can lose `set_config('pipe.tenant_id')` and write a message under the wrong tenant.
  for (const destination of pedido.destinos) {
    resultados.push(await aDestination(canal, pedido, destination, jaVistos));
  }
  return resultados;
}

async function aDestination(
  channel: ChannelResolved,
  pedido: PedidoDeDisparo,
  destino: DestinationOfTrigger,
  jaVistos: Set<string>,
): Promise<ResultOfDestination> {
  const telefone = destino.phone ? normalizar(destino.phone) : null;

  if (telefone && !telefoneValido(telefone)) {
    return { phone: telefone, contatoId: null, enviada: false, motivo: 'numero_invalido' };
  }

  const key = destino.contatoId ?? telefone ?? '';
  if (jaVistos.has(key)) {
    return { phone: telefone, contatoId: destino.contatoId ?? null, enviada: false, motivo: 'contact_duplicated' };
  }
  jaVistos.add(key);

  // Prepare and validate in one transaction; send in another so the database connection is not held during an external call.
  const preparo = await noTenant(pedido.tenantId, async (tx) => {
    const contactId = destino.contatoId ?? (await findOrCreateByPhone(tx, channel, telefone!, destino.name ?? null));

    const { rows: inAttendance } = await tx.execute<{ id: string }>(sql`
      select id from conversa
       where contato_id = ${contactId}::uuid and estado <> 'encerrada' limit 1
    `);
    if (inAttendance[0]) {
      // Blip code 1602: an open conversation uses the normal send path, not active messaging. `enviarMensagem` already uses a template outside the window when needed.
      return { contactId, recusa: 'ja_em_atendimento' as const };
    }

    if (DAILY_LIMIT_BY_CONTACT > 0) {
      const { rows: hoje } = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from mensagem
         where conversa_id in (select id from conversa where contato_id = ${contactId}::uuid)
           and direcao = 'saida' and template_id is not null
           and criada_em >= date_trunc('day', now())
      `);
      if ((hoje[0]?.n ?? 0) >= DAILY_LIMIT_BY_CONTACT) {
        return { contactId, recusa: 'limite_diario' as const };
      }
    }

    const conversationId = await openConversationOfTrigger(tx, channel, pedido, contactId);
    return { contactId, conversationId, recusa: null };
  });

  if (preparo.recusa) {
    return { phone: telefone, contatoId: preparo.contactId, enviada: false, motivo: preparo.recusa };
  }

  try {
    const enfileirada = await sendMessage({
      tenantId: pedido.tenantId,
      conversationId: preparo.conversationId!,
      agentId: pedido.agentId ?? null,
      type: 'template',
      templateId: pedido.templateId,
      parametros: destino.parametros ?? pedido.parametros ?? [],
    });
    return {
      phone: telefone,
      contatoId: preparo.contactId,
      enviada: true,
      mensagemId: enfileirada.id,
      conversationId: preparo.conversationId!,
    };
  } catch (error) {
    // A rejected or missing template fails the entire batch because it is a send configuration error, not a contact error. Keep other failures on their individual contacts.
    if (error instanceof PipeError && error.status === 404) throw error;
    if (error instanceof PipeError && (error.codigo === 'template_nao_aprovado' || error.codigo === 'template_inativo')) throw error;
    return {
      phone: telefone,
      contatoId: preparo.contactId,
      enviada: false,
      motivo: 'numero_invalido',
      detalhe: error instanceof Error ? error.message : 'falha no envio',
    };
  }
}

async function findOrCreateByPhone(
  tx: TransactionPipe,
  canal: ChannelResolved,
  telefone: string,
  nome: string | null,
): Promise<string> {
  // The WhatsApp identifier is the phone number without `+`; keep that canonical form to avoid parallel conversations for the same person when their first reply arrives.
  // `acharOuCriarContato` usa no caminho de entrada. Divergir aqui criaria um contato
  const identificador = telefone.replace(/^\+/, '');
  const { rows } = await tx.execute<{ contactId: string }>(sql`
    select contato_id as "contactId" from contato_identidade
     where canal_tipo = ${canal.type} and identificador = ${identificador} limit 1
  `);
  const existente = rows[0]?.contactId;
  if (existente) return existente;

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
  await emitir(tx, canal.tenantId, 'contato.criado', {
    contato_id: contatoId,
    nome,
    telefone,
    origem: 'mensagem_ativa',
  });
  return contatoId;
}

/**
 * Conversation opened by an active message. Assign it to the initiating agent when a person triggers the send, so that agent receives the reply, as in Blip Desk. API-key sends have no owner and go to the queue for distribution. Leave `janela_expira_em` null deliberately: the customer's reply opens the 24-hour window, not our outbound send. Setting it now would offer free-form text before the customer replies and Meta would reject it.
 */
async function openConversationOfTrigger(
  tx: TransactionPipe,
  canal: ChannelResolved,
  pedido: PedidoDeDisparo,
  contactId: string,
): Promise<string> {
  const { rows: inboxes } = await tx.execute<{ id: string; queueDefaultId: string | null }>(
    sql`select id, fila_padrao_id as "queueDefaultId" from inbox where canal_id = ${pedido.channelId} order by criado_em limit 1`,
  );
  const inbox = inboxes[0];
  if (!inbox) throw PipeError.conflito('channel_without_inbox', 'O canal não tem inbox configurada.');

  const agora = new Date();
  const agent = pedido.agentId ?? null;
  const state = agent ? 'atribuida' : 'na_fila';

  const { rows } = await tx.execute<{ id: string }>(sql`
    insert into conversa (tenant_id, inbox_id, contato_id, atendente_id, estado,
                          criada_em, atribuida_em)
    values (${canal.tenantId}, ${inbox.id}, ${contactId},
            ${agent}, ${state}, ${agora}, ${agent ? agora : null})
    returning id
  `);
  const conversaId = rows[0]?.id;
  if (!conversaId) throw new Error('não criou a conversa do disparo');

  // Born without a queue: the flow serving the channel is resolved and the queue chosen inside it.
  const { queueId } = await chooseQueueOfConversation(tx, {
    tenantId: canal.tenantId,
    conversationId: conversaId,
    flowId: await flowOfConversation(tx, canal.tenantId, conversaId),
    queueId: pedido.queueId ?? null,
    defaultQueueId: inbox.queueDefaultId,
    message: null,
  });
  if (queueId) {
    await tx.execute(sql`update conversa set fila_id = ${queueId}::uuid where id = ${conversaId}::uuid`);
  }

  await registrarEvento(tx, {
    tenantId: canal.tenantId,
    conversationId: conversaId,
    type: 'criada',
    at: agora,
    userId: agent,
    queueId,
    data: { origem: 'mensagem_ativa' },
  });
  await registrarEvento(tx, {
    tenantId: canal.tenantId,
    conversationId: conversaId,
    type: agent ? 'atribuida' : 'enfileirada',
    at: agora,
    userId: agent,
    queueId,
  });
  await emitir(tx, canal.tenantId, 'conversa.criada', {
    conversa_id: conversaId,
    contato_id: contactId,
    fila_id: queueId,
    origem: 'mensagem_ativa',
  });
  return conversaId;
}

export interface LineOfApplication {
  messageId: string;
  conversationId: string;
  contactId: string;
  contactName: string | null;
  phone: string | null;
  templateNome: string | null;
  stateDelivery: string | null;
  errorCode: string | null;
  criadaEm: string;
}

/**
 * Active-message status panel covers the last 72 hours, as in Blip. Derive it from `mensagem`: a send already produces messages with `template_id`, and a second table would create another source of truth.
 */
export async function applicationOfActive(
  tenantId: string,
  horas = 72,
): Promise<LineOfApplication[]> {
  return noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{
      id: string;
      conversationId: string;
      contactId: string;
      contactName: string | null;
      phoneE164: string | null;
      templateName: string | null;
      stateDelivery: string | null;
      errorCode: string | null;
      criada_em: Date | string;
    }>(sql`
      select m.id, m.conversa_id as "conversationId", ct.id as "contactId", ct.nome as "contactName",
             ct.telefone_e164 as "phoneE164", t.nome as "templateName",
             m.estado_entrega as "stateDelivery", m.erro_codigo as "errorCode",
             m.criada_em
        from mensagem m
        join conversa c on c.id = m.conversa_id
        join contato ct on ct.id = c.contato_id
        left join template_mensagem t on t.id = m.template_id
       where m.direcao = 'saida' and m.template_id is not null
         and m.criada_em >= now() - ${`${horas} hours`}::interval
       order by m.criada_em desc
       limit 500
    `);
    return rows.map((l) => ({
      messageId: l.id,
      conversationId: l.conversationId,
      contactId: l.contactId,
      contactName: l.contactName,
      phone: l.phoneE164,
      templateNome: l.templateName,
      stateDelivery: l.stateDelivery,
      errorCode: l.errorCode,
      criadaEm: l.criada_em instanceof Date ? l.criada_em.toISOString() : String(l.criada_em),
    }));
  });
}
