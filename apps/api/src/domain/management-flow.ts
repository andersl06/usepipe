import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
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
import { linkedActiveChannelOfType, linkedChannelIdsOfFlow } from './channel-links.js';

/**
 * Read contact-facing flow screens (`/fluxo/:id/**` in Management). These queries moved from `apps/gestao/src/lib/*` as planned in the README: the caller supplies a tenant-scoped transaction, and the `api` controller owns session handling. This module knows no HTTP or screen; it returns what the UI renders, with types derived from the query (`Awaited<ReturnType<…>>`) rather than copied manually.
 */

/**
 * The channel identifier shown as "the number": WhatsApp `config.numero`, Instagram `config.username`, or Messenger Page ID (`numero_id`). These are not secrets and are readable in encrypted `config` (`dominio/canais.ts`, `visivel`).
 */
export const identifierOfChannel = sql<string | null>`coalesce(
  ${channel.config} ->> 'numero', ${channel.config} ->> 'username', ${channel.numeroId}
)`;

/** The contact (the `fluxo`) and its channel — the shared query behind both lookups below. */
async function loadContactWhere(tx: TransactionPipe, extraCondition: SQL) {
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
    .where(extraCondition)
    .limit(1);
  return linha ?? null;
}

/** `GET :id` — the flow may be archived; this route is read-only. */
export async function loadContact(tx: TransactionPipe, tid: string, id: string) {
  return loadContactWhere(tx, and(eq(flow.tenantId, tid), eq(flow.id, id))!);
}

/**
 * `GET short-name/:shortName` (D-52). Unlike `loadContact`, this excludes archived flows: an
 * archived flow's short name may already belong to a live flow (`fluxo_short_name_vivo_uk` is
 * partial), so resolving through it here would be ambiguous or stale.
 */
export async function loadContactByShortName(tx: TransactionPipe, tid: string, shortName: string) {
  return loadContactWhere(
    tx,
    and(eq(flow.tenantId, tid), eq(flow.shortName, shortName), ne(flow.estado, 'arquivado'))!,
  );
}

export type ContactOfFlow = NonNullable<Awaited<ReturnType<typeof loadContact>>>;

/** Use the tenant time zone so "today" and "created at" do not use the server time zone. */
export async function fusoDoTenant(tx: TransactionPipe): Promise<string> {
  const [linha] = await tx.select({ fuso: tenant.fuso }).from(tenant).limit(1);
  return linha?.fuso ?? 'America/Sao_Paulo';
}

/* ------------------------------------------------------------- Contatos */

/**
 * The (contact, inbox, moment) pairs a flow serves: contacts with an execution of any version of the flow
 * (a router service has no channel of its own) and contacts with a conversation in its linked channels.
 */
function originsOfFlow(tid: string, flowId: string, channelIds: string[]) {
  const channels = channelIds.length ? sql`array[${sql.join(channelIds.map((id) => sql`${id}::uuid`), sql`, `)}]` : sql`'{}'::uuid[]`;
  return sql`
    select e.contato_id, e.inbox_id, e.iniciada_em as quando
      from execucao_fluxo e join fluxo_versao v on v.id = e.fluxo_versao_id
     where v.fluxo_id = ${flowId}::uuid and v.tenant_id = ${tid}::uuid
       and e.tenant_id = ${tid}::uuid and e.contato_id is not null
    union
    select cv.contato_id, cv.inbox_id, null::timestamptz
      from conversa cv join inbox i on i.id = cv.inbox_id
     where cv.tenant_id = ${tid}::uuid and i.canal_id = any(${channels})
  `;
}

export async function listContactsOfFlow(tx: TransactionPipe, tid: string, fluxoId: string) {
  const channelIds = await linkedChannelIdsOfFlow(tx, tid, fluxoId);
  const { rows } = await tx.execute<{
    id: string;
    nome: string | null;
    email: string | null;
    telefone: string | null;
    avatarUrl: string | null;
    canalNome: string | null;
    canalTipo: string | null;
    conversas: number;
    ultimaConversa: Date | null;
  }>(sql`
    select ct.id, ct.nome, ct.email, ct.telefone_e164 as telefone, ct.avatar_url as "avatarUrl",
           ch.nome as "canalNome", ch.tipo as "canalTipo",
           count(distinct cv.id)::int as conversas,
           max(greatest(coalesce(cv.ultima_mensagem_em, cv.criada_em), o.quando)) as "ultimaConversa"
      from (${originsOfFlow(tid, fluxoId, channelIds)}) o
      join contato ct on ct.id = o.contato_id and ct.tenant_id = ${tid}::uuid
      left join inbox ib on ib.id = o.inbox_id
      left join canal ch on ch.id = ib.canal_id
      left join conversa cv on cv.contato_id = ct.id and cv.inbox_id = o.inbox_id and cv.tenant_id = ${tid}::uuid
     where ct.excluido_em is null
     group by ct.id, ch.id
     order by ct.nome asc
     limit 500
  `);
  return rows;
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
  const channelIds = await linkedChannelIdsOfFlow(tx, tid, flowId);
  // The contact must be one the flow serves; the inboxes it talked through bound its conversations.
  const { rows: origens } = await tx.execute<{ inboxId: string | null }>(sql`
    select distinct o.inbox_id as "inboxId" from (${originsOfFlow(tid, flowId, channelIds)}) o
     where o.contato_id = ${contactId}::uuid
  `);
  if (!origens.length) return null;
  const inboxIds = origens.flatMap((o) => (o.inboxId ? [o.inboxId] : []));

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

  const conversations = inboxIds.length
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
          channelName: channel.nome,
          channelType: channel.tipo,
        })
        .from(conversation)
        .innerJoin(inbox, eq(inbox.id, conversation.inboxId))
        .innerJoin(channel, eq(channel.id, inbox.channelId))
        .leftJoin(queue, eq(queue.id, conversation.filaId))
        .leftJoin(user, eq(user.id, conversation.agentId))
        .leftJoin(classificationConversation, eq(classificationConversation.conversaId, conversation.id))
        .where(
          and(
            eq(conversation.tenantId, tid),
            eq(conversation.contatoId, contactId),
            inArray(conversation.inboxId, inboxIds),
          ),
        )
        .orderBy(desc(conversation.criadaEm))
        .limit(50)
    : [];

  const selecionada = conversations.find((item) => item.id === ticketId) ?? conversations[0];
  const [identity] = selecionada?.channelType
    ? await tx.select({ valor: contactIdentity.identificador }).from(contactIdentity)
        .where(and(eq(contactIdentity.tenantId, tid), eq(contactIdentity.contactId, contactId),
          eq(contactIdentity.channelType, selecionada.channelType))).limit(1)
    : [];
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
    canal: selecionada?.channelName ?? bot.canalNome,
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
  const channelIds = await linkedChannelIdsOfFlow(tx, tid, fluxoId);
  if (!channelIds.length) return [];
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
    .where(and(eq(message.tenantId, tid), inArray(inbox.channelId, channelIds), filterSearch))
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
    .where(
      channelId
        ? and(eq(templateMessage.canalId, channelId), eq(templateMessage.ativo, true))
        : eq(templateMessage.ativo, true),
    )
    .orderBy(asc(templateMessage.nome));

  return linhas.map(({ variaveis, ...l }) => ({ ...l, variables: readVariables(variaveis) }));
}

export async function loadChannelOfFlow(
  tx: TransactionPipe,
  tid: string,
  fluxoId: string,
): Promise<string | null> {
  return (await linkedActiveChannelOfType(tx, tid, fluxoId, 'whatsapp_cloud'))?.id ?? null;
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
      shortName: flow.shortName,
    })
    .from(flow)
    .where(filter)
    .orderBy(desc(flow.criadoEm))
    .limit(pedido.byPage)
    .offset((pedido.page - 1) * pedido.byPage);
  return { flows, total, encontrados };
}
