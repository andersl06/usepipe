import { and, asc, count, desc, eq, gte, ilike, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import {
  channel,
  classificationConversation,
  contact,
  contactIdentity,
  conversation,
  queue,
  flow,
  inbox,
  message,
  templateMessage,
  tenant,
  user,
} from '@pipe/db/schema';
import type { TransactionPipe } from '@pipe/db';
import type { GradeDoPortal } from '@pipe/contracts';

/**
 * Read contact-facing flow screens (`/fluxo/:id/**` in Management). These queries moved from `apps/gestao/src/lib/*` as planned in the README: the caller supplies a tenant-scoped transaction, and the `api` controller owns session handling. This module knows no HTTP or screen; it returns what the UI renders, with types derived from the query (`Awaited<ReturnType<…>>`) rather than copied manually.
 */

/**
 * The channel identifier shown as "the number": WhatsApp `config.numero`, Instagram `config.username`, or Messenger Page ID (`numero_id`). These are not secrets and are readable in encrypted `config` (`dominio/canais.ts`, `visivel`).
 */
export const identifierOfChannel = sql<string | null>`coalesce(
  ${channel.config} ->> 'numero', ${channel.config} ->> 'username', ${channel.numeroId}
)`;

/** O contato (o `fluxo`) e o canal dele. Uma consulta, um `leftJoin`. */
export async function loadContact(tx: TransactionPipe, tid: string, id: string) {
  const [linha] = await tx
    .select({
      id: flow.id,
      nome: flow.nome,
      state: flow.estado,
      tipo: flow.tipo,
      imageUrl: flow.imageUrl,
      shortName: flow.shortName,
      description: flow.descricao,
      criadoEm: flow.criadoEm,
      channelId: flow.channelId,
      channelName: channel.nome,
      channelType: channel.tipo,
      channelActive: channel.ativo,
      channelNumber: identifierOfChannel,
    })
    .from(flow)
    .leftJoin(channel, eq(channel.id, flow.channelId))
    .where(and(eq(flow.tenantId, tid), eq(flow.id, id)))
    .limit(1);
  return linha ?? null;
}

export type ContactOfFlow = NonNullable<Awaited<ReturnType<typeof loadContact>>>;

/** Use the tenant time zone so "today" and "created at" do not use the server time zone. */
export async function fusoDoTenant(tx: TransactionPipe): Promise<string> {
  const [linha] = await tx.select({ fuso: tenant.fuso }).from(tenant).limit(1);
  return linha?.fuso ?? 'America/Sao_Paulo';
}

/* ------------------------------------------------------------- Contatos */

export async function listContactsOfFlow(tx: TransactionPipe, tid: string, fluxoId: string) {
  const [bot] = await tx
    .select({ canalId: flow.channelId, canalNome: channel.nome, canalTipo: channel.tipo })
    .from(flow)
    .leftJoin(channel, eq(channel.id, flow.channelId))
    .where(and(eq(flow.id, fluxoId), eq(flow.tenantId, tid)))
    .limit(1);
  if (!bot?.canalId) return [];

  return tx
    .select({
      id: contact.id,
      nome: contact.nome,
      email: contact.email,
      telefone: contact.telefoneE164,
      avatarUrl: contact.avatarUrl,
      canalNome: channel.nome,
      canalTipo: channel.tipo,
      conversas: sql<number>`count(distinct ${conversation.id})::int`,
      ultimaConversa: sql<Date | null>`max(coalesce(${conversation.lastMessageAt}, ${conversation.criadaEm}))`,
    })
    .from(contact)
    .innerJoin(conversation, eq(conversation.contatoId, contact.id))
    .innerJoin(inbox, eq(inbox.id, conversation.inboxId))
    .innerJoin(channel, eq(channel.id, inbox.channelId))
    .where(
      and(eq(contact.tenantId, tid), eq(inbox.channelId, bot.canalId), isNull(contact.excluidoEm)),
    )
    .groupBy(contact.id, channel.id)
    .orderBy(asc(contact.nome))
    .limit(500);
}

export type ContactListed = Awaited<ReturnType<typeof listContactsOfFlow>>[number];

export async function loadDetailContactOfFlow(
  tx: TransactionPipe,
  tid: string,
  flowId: string,
  contactId: string,
  ticketId?: string,
) {
  const [bot] = await tx
    .select({ canalId: flow.channelId, canalNome: channel.nome, canalTipo: channel.tipo })
    .from(flow)
    .leftJoin(channel, eq(channel.id, flow.channelId))
    .where(and(eq(flow.id, flowId), eq(flow.tenantId, tid)))
    .limit(1);
  if (!bot) return null;

  const [pessoa] = await tx
    .select({
      id: contact.id,
      nome: contact.nome,
      email: contact.email,
      telefone: contact.telefoneE164,
      documento: contact.document,
      avatarUrl: contact.avatarUrl,
      atributos: contact.atributos,
      criadoEm: contact.criadoEm,
    })
    .from(contact)
    .where(and(eq(contact.id, contactId), eq(contact.tenantId, tid), isNull(contact.excluidoEm)))
    .limit(1);
  if (!pessoa) return null;

  const [identity] = bot.canalTipo
    ? await tx
        .select({ valor: contactIdentity.identificador })
        .from(contactIdentity)
        .where(
          and(
            eq(contactIdentity.tenantId, tid),
            eq(contactIdentity.contactId, contactId),
            eq(contactIdentity.channelType, bot.canalTipo),
          ),
        )
        .limit(1)
    : [];

  const conversations = bot.canalId
    ? await tx
        .select({
          id: conversation.id,
          estado: conversation.state,
          criadaEm: conversation.criadaEm,
          encerradaEm: conversation.encerradaEm,
          inbox: inbox.nome,
          fila: queue.nome,
          atendente: user.nome,
          atendenteEmail: user.email,
          resumo: classificationConversation.resumo,
        })
        .from(conversation)
        .innerJoin(inbox, eq(inbox.id, conversation.inboxId))
        .leftJoin(queue, eq(queue.id, conversation.filaId))
        .leftJoin(user, eq(user.id, conversation.agentId))
        .leftJoin(classificationConversation, eq(classificationConversation.conversaId, conversation.id))
        .where(
          and(
            eq(conversation.tenantId, tid),
            eq(conversation.contatoId, contactId),
            eq(inbox.channelId, bot.canalId),
          ),
        )
        .orderBy(desc(conversation.criadaEm))
        .limit(50)
    : [];

  const selecionada = conversations.find((item) => item.id === ticketId) ?? conversations[0];
  const history = selecionada
    ? await tx
        .select({
          id: message.id,
          texto: message.conteudo,
          tipo: message.tipo,
          direcao: message.direction,
          autor: message.autorTipo,
          estado: message.stateDelivery,
          criadaEm: message.criadaEm,
        })
        .from(message)
        .where(and(eq(message.tenantId, tid), eq(message.conversationId, selecionada.id)))
        .orderBy(asc(message.criadaEm))
        .limit(200)
    : [];

  return {
    pessoa,
    identidade: identity?.valor ?? null,
    canal: bot.canalNome,
    conversations,
    selecionada: selecionada ?? null,
    history,
  };
}

export type DetailOfContact = NonNullable<
  Awaited<ReturnType<typeof loadDetailContactOfFlow>>
>;

/* ------------------------------------------------------------------ Log */

export async function loadLogsOfFlow(
  tx: TransactionPipe,
  tid: string,
  fluxoId: string,
  search = '',
) {
  const [bot] = await tx
    .select({ canalId: flow.channelId, nome: channel.nome })
    .from(flow)
    .leftJoin(channel, eq(channel.id, flow.channelId))
    .where(and(eq(flow.id, fluxoId), eq(flow.tenantId, tid)))
    .limit(1);
  if (!bot?.canalId) return [];
  const filterSearch = search.trim() ? ilike(message.conteudo, `%${search.trim()}%`) : undefined;
  const linhas = await tx
    .select({
      id: message.id,
      criadaEm: message.criadaEm,
      direcao: message.direction,
      tipo: message.tipo,
      conteudo: message.conteudo,
      metadata: message.data,
      contato: contact.telefoneE164,
      canal: channel.nome,
    })
    .from(message)
    .innerJoin(conversation, eq(conversation.id, message.conversationId))
    .innerJoin(contact, eq(contact.id, conversation.contatoId))
    .innerJoin(inbox, eq(inbox.id, conversation.inboxId))
    .innerJoin(channel, eq(channel.id, inbox.channelId))
    .where(and(eq(message.tenantId, tid), eq(inbox.channelId, bot.canalId), filterSearch))
    .orderBy(desc(message.criadaEm))
    .limit(20);
  return linhas.map((linha) => ({
    ...linha,
    de: linha.direcao === 'entrada' ? linha.contato : linha.canal,
    para: linha.direcao === 'entrada' ? linha.canal : linha.contato,
  }));
}

export type LogOfFlow = Awaited<ReturnType<typeof loadLogsOfFlow>>[number];

/* --------------------------------------------------------------- Growth */

export interface EnvioGrowth {
  id: string;
  disparoId: string | null;
  contactName: string | null;
  templateNome: string | null;
  channelName: string;
  state: string | null;
  errorCode: string | null;
  criadaEm: string;
  custoCentavos: number | null;
}

export interface TemplateGrowth {
  id: string;
  name: string;
  idioma: string;
  category: string;
  statusMeta: string;
  body: string;
  variables: string[];
  channelId: string;
  channelName: string;
}

export interface ContactGrowth {
  id: string;
  name: string | null;
  phone: string;
}

export interface DataOfGrowth {
  channels: { id: string; name: string }[];
  modelos: TemplateGrowth[];
  contacts: ContactGrowth[];
  envios: EnvioGrowth[];
}

/**
 * The source lists campaigns, but Pipe does not yet persist campaigns or audiences. Read real template messages from the past 72 hours, the API panel and source screen window. Each row is a message, not a campaign. Once a campaign entity exists, group by `disparo_id`; do not infer campaigns from time or model.
 */
export async function carregarGrowth(tx: TransactionPipe, tid: string): Promise<DataOfGrowth> {
  const desde = new Date(Date.now() - 72 * 60 * 60 * 1000);
  /*
   * Run queries serially: in parallel the driver contends for one connection and the tenant `set_config` is lost.
   */
  const channels = await tx
    .select({ id: channel.id, name: channel.nome })
    .from(channel)
    .where(and(eq(channel.tenantId, tid), eq(channel.tipo, 'whatsapp_cloud'), eq(channel.ativo, true)))
    .orderBy(asc(channel.nome));
  const modelos = await tx
    .select({
      id: templateMessage.id,
      name: templateMessage.nome,
      idioma: templateMessage.idioma,
      category: templateMessage.categoria,
      statusMeta: templateMessage.statusMeta,
      body: templateMessage.corpo,
      variaveis: templateMessage.variables,
      channelId: channel.id,
      channelName: channel.nome,
    })
    .from(templateMessage)
    .innerJoin(channel, eq(channel.id, templateMessage.canalId))
    .where(and(eq(templateMessage.tenantId, tid), eq(channel.tipo, 'whatsapp_cloud')))
    .orderBy(asc(templateMessage.nome));
  const contacts = await tx
    .select({ id: contact.id, name: contact.nome, phone: contact.telefoneE164 })
    .from(contact)
    .where(
      and(
        eq(contact.tenantId, tid),
        eq(contact.bloqueado, false),
        isNull(contact.excluidoEm),
        isNotNull(contact.telefoneE164),
      ),
    )
    .orderBy(asc(contact.nome))
    .limit(1000);
  const envios = await tx
    .select({
      id: message.id,
      disparoId: message.disparoId,
      contactName: contact.nome,
      templateNome: templateMessage.nome,
      channelName: channel.nome,
      state: message.stateDelivery,
      errorCode: message.errorCode,
      criadaEm: message.criadaEm,
      custoCentavos: message.custoCentavos,
    })
    .from(message)
    .innerJoin(conversation, eq(conversation.id, message.conversationId))
    .innerJoin(contact, eq(contact.id, conversation.contatoId))
    .innerJoin(inbox, eq(inbox.id, conversation.inboxId))
    .innerJoin(channel, eq(channel.id, inbox.channelId))
    .leftJoin(templateMessage, eq(templateMessage.id, message.templateId))
    .where(
      and(
        eq(message.tenantId, tid),
        eq(message.direction, 'saida'),
        isNotNull(message.templateId),
        gte(message.criadaEm, desde),
      ),
    )
    .orderBy(desc(message.criadaEm))
    .limit(500);

  return {
    channels,
    contacts: contacts.flatMap((pessoa) =>
      pessoa.phone ? [{ ...pessoa, phone: pessoa.phone }] : [],
    ),
    modelos: modelos.map(({ variaveis, ...template }) => ({
      ...template,
      variables: readVariables(variaveis),
    })),
    envios: envios.map((envio) => ({
      ...envio,
      criadaEm: envio.criadaEm.toISOString(),
    })),
  };
}



export interface TemplateListed {
  id: string;
  channelId: string;
  body: string;
  name: string;
  idioma: string;
  category: string;
  statusMeta: string;
  headerType: string;
  variables: string[];
  channelName: string;
}

/** `variaveis` é `jsonb` sem `check`: uma linha corrompida não pode derrubar a lista inteira. */
function readVariables(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export async function carregarModelos(
  tx: TransactionPipe,
  channelId?: string,
): Promise<TemplateListed[]> {
  const linhas = await tx
    .select({
      id: templateMessage.id,
      channelId: templateMessage.canalId,
      body: templateMessage.corpo,
      name: templateMessage.nome,
      idioma: templateMessage.idioma,
      category: templateMessage.categoria,
      statusMeta: templateMessage.statusMeta,
      headerType: templateMessage.cabecalhoTipo,
      variaveis: templateMessage.variables,
      channelName: channel.nome,
    })
    .from(templateMessage)
    .innerJoin(channel, eq(channel.id, templateMessage.canalId))
    .where(channelId ? eq(templateMessage.canalId, channelId) : undefined)
    .orderBy(asc(templateMessage.nome));

  return linhas.map(({ variaveis, ...l }) => ({ ...l, variables: readVariables(variaveis) }));
}

export async function loadChannelOfFlow(
  tx: TransactionPipe,
  tid: string,
  fluxoId: string,
): Promise<string | null> {
  const [bot] = await tx
    .select({ canalId: flow.channelId })
    .from(flow)
    .where(and(eq(flow.id, fluxoId), eq(flow.tenantId, tid)))
    .limit(1);
  return bot?.canalId ?? null;
}

/* --------------------------------------------------------------- Portal */

/**
 * Page the portal grid in the database: the source expects hundreds of bots per account. Exclude `arquivado` because archiving removes a bot from circulation without deleting it. Sort newest first, as in the source.
 */
export async function carregarGradeDoPortal(
  tx: TransactionPipe,
  pedido: { search: string; page: number; byPage: number },
): Promise<GradeDoPortal> {
  const search = pedido.search.trim();
  const emUso = ne(flow.estado, 'arquivado');
  const filter = search ? and(emUso, ilike(flow.nome, `%${search}%`)) : emUso;
  /* Run ONE query at a time: the transaction has a single connection. */
  const total = (await tx.select({ n: count() }).from(flow).where(emUso))[0]?.n ?? 0;
  const encontrados = search
    ? ((await tx.select({ n: count() }).from(flow).where(filter))[0]?.n ?? 0)
    : total;
  const flows = await tx
    .select({
      id: flow.id,
      nome: flow.nome,
      estado: flow.estado,
      tipo: flow.tipo,
      imagemUrl: flow.imageUrl,
    })
    .from(flow)
    .where(filter)
    .orderBy(desc(flow.criadoEm))
    .limit(pedido.byPage)
    .offset((pedido.page - 1) * pedido.byPage);
  return { flows, total, encontrados };
}
