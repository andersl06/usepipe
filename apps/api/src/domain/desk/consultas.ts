import { sql } from 'drizzle-orm';
import type { TransactionPipe } from '@pipe/db';
import type {
  Colega,
  ConversationOpen,
  ConversationOfList,
  ConversationOfHistory,
  StateAgent,
  StateConversation,
  LabelOfConversation,
  EtiquetaDoDesk,
  ItemOfConversation,
  MotivoDePausa,
  PriorityOfDesk as Prioridade,
  RespostaProntaDoDesk,
  StatusOfAgent,
  TemplateAprovado,
  TicketAntigo,
  TypeChannelDatabase,
} from '@pipe/contracts';

/**
 * Desk read queries were moved from `apps/desk/src/servidor/consultas.ts` with SQL unchanged. The transaction now comes from the controller's `noTenant` parameter and dates cross JSON as ISO. Handwritten SQL is deliberate: four- or five-table joins plus a `lateral` for each conversation's latest message would be longer and less clear in Drizzle. Writes still use the typed schema (`acoes.ts`). Every query runs under `noTenant` with `pipe.tenant_id` and RLS; none manually filters tenant because the database already does. Output types come from `@pipe/contracts` (`desk.ts`); `tsc` reports any front-end contract mismatch when columns change.
 */

/**
 * `execute<T>` requires a type with an implicit index signature, which the contract `interface` lacks. Mapping to the same object shape supplies that signature.
 */
type Linha<T> = { [K in keyof T]: T[K] };

/**
 * The driver returns `timestamptz` as `Date` with one loaded `pg` parser, or text if another copy is loaded. Normalize centrally instead of making components rediscover this.
 */
export function data(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** A data como vai no JSON: ISO 8601, sempre em UTC. Quem mostra converte na ponta. */
export function iso(valor: Date | string): string {
  return data(valor).toISOString();
}

export function isoOuNulo(valor: Date | string | null): string | null {
  return valor === null ? null : iso(valor);
}

export async function listConversations(
  tx: TransactionPipe,
  atendenteId: string,
): Promise<ConversationOfList[]> {
  const { rows } = await tx.execute<{
    id: string;
    state: StateConversation;
    priority: Prioridade;
    criada_em: Date | string;
    primeira_resposta_em: Date | string | null;
    ultima_mensagem_em: Date | string | null;
    lastMessageOf: string | null;
    windowExpiresAt: Date | string | null;
    em_espera_desde: Date | string | null;
    contato_nome: string | null;
    contactPhone: string | null;
    fila_nome: string | null;
    channelType: TypeChannelDatabase;
    lastMessage: string | null;
    lastMessageType: string | null;
    fixada_em: Date | string | null;
    nao_lida_em: Date | string | null;
  }>(sql`
    select c.id, c.estado as state, c.prioridade as priority, c.criada_em, c.primeira_resposta_em,
           c.ultima_mensagem_em, c.ultima_mensagem_de as "lastMessageOf",
           c.janela_expira_em as "windowExpiresAt", c.em_espera_desde, ct.nome as contato_nome,
           ct.telefone_e164 as "contactPhone",
           f.nome as fila_nome,
           ca.tipo as "channelType", m.conteudo as "lastMessage", m.tipo as "lastMessageType",
           mc.fixada_em, mc.nao_lida_em
      from conversa c
      join contato ct on ct.id = c.contato_id
      join inbox ib on ib.id = c.inbox_id
      join canal ca on ca.id = ib.canal_id
      left join fila f on f.id = c.fila_id
      left join lateral (
        select conteudo, tipo from mensagem
         where conversa_id = c.id
         order by criada_em desc
         limit 1
      ) m on true
      -- As marcações são DESTE atendente (fixada, não lida): dominio/desk/marcacoes.ts.
      left join marcacao_conversa mc
        on mc.conversa_id = c.id and mc.usuario_id = ${atendenteId}
     where c.atendente_id = ${atendenteId}
       and c.estado <> 'encerrada'
     order by c.ultima_mensagem_em desc nulls last
  `);
  return rows.map((r) => ({
    id: r.id,
    estado: r.state,
    prioridade: r.priority,
    criadaEm: iso(r.criada_em),
    primeiraRespostaEm: isoOuNulo(r.primeira_resposta_em),
    ultimaMensagemEm: isoOuNulo(r.ultima_mensagem_em),
    lastMessageFrom: r.lastMessageOf,
    janelaExpiraEm: isoOuNulo(r.windowExpiresAt),
    emEsperaDesde: isoOuNulo(r.em_espera_desde),
    contatoNome: r.contato_nome,
    contatoTelefone: r.contactPhone,
    filaNome: r.fila_nome,
    canalTipo: r.channelType,
    lastMessage: r.lastMessage,
    lastMessageType: r.lastMessageType,
    fixadaEm: isoOuNulo(r.fixada_em),
    naoLidaEm: isoOuNulo(r.nao_lida_em),
  }));
}

export async function loadConversation(
  tx: TransactionPipe,
  conversationId: string,
  agentId: string,
): Promise<ConversationOpen | null> {
  const { rows } = await tx.execute<{
    id: string;
    state: StateConversation;
    priority: Prioridade;
    criada_em: Date | string;
    firstResponseAt: Date | string | null;
    em_espera_desde: Date | string | null;
    windowExpiresAt: Date | string | null;
    queueName: string | null;
    channelId: string;
    channelType: TypeChannelDatabase;
    contactId: string;
    contactName: string | null;
    phoneE164: string | null;
    email: string | null;
    document: string | null;
    atributos: Record<string, unknown> | null;
    summary: string | null;
    resumo_em: Date | string | null;
    summaryTemplate: string | null;
  }>(sql`
    select c.id, c.estado as "state", c.prioridade as "priority", c.criada_em,
           c.primeira_resposta_em as "firstResponseAt", c.em_espera_desde,
           c.janela_expira_em as "windowExpiresAt", f.nome as "queueName", ca.id as "channelId",
           ca.tipo as "channelType",
           ct.id as "contactId", ct.nome as "contactName", ct.telefone_e164 as "phoneE164", ct.email,
           ct.documento as "document", ct.atributos,
           cl.resumo as "summary", cl.criada_em as resumo_em, cl.modelo as "summaryTemplate"
      from conversa c
      join contato ct on ct.id = c.contato_id
      join inbox ib on ib.id = c.inbox_id
      join canal ca on ca.id = ib.canal_id
      left join fila f on f.id = c.fila_id
      left join classificacao_conversa cl on cl.conversa_id = c.id
     where c.id = ${conversationId}
       and c.atendente_id = ${agentId}
     limit 1
  `);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    state: r.state,
    priority: r.priority,
    criadaEm: iso(r.criada_em),
    firstResponseAt: isoOuNulo(r.firstResponseAt),
    emEsperaDesde: isoOuNulo(r.em_espera_desde),
    windowExpiresAt: isoOuNulo(r.windowExpiresAt),
    queueName: r.queueName,
    channelId: r.channelId,
    channelType: r.channelType,
    contactId: r.contactId,
    contactName: r.contactName,
    contactPhone: r.phoneE164,
    contactEmail: r.email,
    contactDocument: r.document,
    contactAttributes: r.atributos ?? {},
    resumo: r.summary,
    resumoEm: isoOuNulo(r.resumo_em),
    summaryTemplate: r.summaryTemplate,
  };
}

export async function listItemsOfConversation(
  tx: TransactionPipe,
  conversaId: string,
): Promise<ItemOfConversation[]> {
  const messages = await tx.execute<{
    id: string;
    criada_em: Date | string;
    direction: 'entrada' | 'saida' | 'interna';
    type: string;
    content: string | null;
    stateDelivery: string | null;
    errorCode: string | null;
    errorText: string | null;
    lidaAt: Date | string | null;
    entregueAt: Date | string | null;
    resposta_pronta_id: string | null;
    template_id: string | null;
  }>(sql`
    select id, criada_em, direcao as "direction", tipo as "type", conteudo as "content", estado_entrega as "stateDelivery", erro_codigo as "errorCode", erro_texto as "errorText",
           lida_em as "lidaAt", entregue_em as "entregueAt", resposta_pronta_id, template_id
      from mensagem
     where conversa_id = ${conversaId}
     order by criada_em
  `);

  const notas = await tx.execute<{
    id: string;
    at: Date | string;
    body: string;
    author: string | null;
  }>(sql`
    select n.id, n.em as "at", n.corpo as "body", u.nome as "author"
      from nota_interna n
      left join usuario u on u.id = n.usuario_id
     where n.conversa_id = ${conversaId}
     order by n.em
  `);

  const itens: ItemOfConversation[] = [
    ...messages.rows.map((m): ItemOfConversation => ({
      genero: 'mensagem',
      id: m.id,
      criadaEm: iso(m.criada_em),
      direction: m.direction === 'entrada' ? 'entrada' : 'saida',
      tipo: m.type,
      conteudo: m.content,
      stateDelivery: m.stateDelivery,
      errorCode: m.errorCode,
      errorText: m.errorText,
      lidaEm: isoOuNulo(m.lidaAt),
      entregueEm: isoOuNulo(m.entregueAt),
      deRespostaPronta: m.resposta_pronta_id !== null,
      deTemplate: m.template_id !== null,
    })),
    ...notas.rows.map((n): ItemOfConversation => ({
      genero: 'nota',
      id: n.id,
      criadaEm: iso(n.at),
      corpo: n.body,
      autor: n.author,
    })),
  ];
  // ISO em UTC ordena como texto: mesmo comprimento, mesmo fuso, sem `Date` no meio.
  return itens.sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
}

export async function listarRespostasProntas(
  tx: TransactionPipe,
  atendenteId: string,
): Promise<RespostaProntaDoDesk[]> {
  const { rows } = await tx.execute<Linha<RespostaProntaDoDesk>>(sql`
    select id, escopo as "scope", categoria, atalho, titulo, corpo
      from resposta_pronta
     where ativa
       and (escopo = 'empresa' or usuario_id = ${atendenteId})
     order by escopo, categoria nulls last, atalho
  `);
  return rows;
}

export async function listarTemplatesAprovados(
  tx: TransactionPipe,
  channelId: string,
): Promise<TemplateAprovado[]> {
  const { rows } = await tx.execute<Linha<TemplateAprovado>>(sql`
    select id, nome, categoria, corpo, variaveis as "variables"
      from template_mensagem
     where canal_id = ${channelId}
       and status_meta = 'aprovado'
     order by categoria, nome
  `);
  return rows;
}

export async function listarEtiquetas(tx: TransactionPipe): Promise<EtiquetaDoDesk[]> {
  const { rows } = await tx.execute<{
    id: string;
    name: string;
    color: string | null;
    requiredInClosure: boolean;
  }>(sql`
    select id, nome as name, cor as color, obrigatoria_no_encerramento as "requiredInClosure"
      from etiqueta
     where escopo in ('conversa', 'ambos')
     order by obrigatoria_no_encerramento, nome
  `);
  return rows.map((r) => ({
    id: r.id,
    nome: r.name,
    cor: r.color,
    requiredInClosure: r.requiredInClosure,
  }));
}

export async function listLabelsOfConversation(
  tx: TransactionPipe,
  conversaId: string,
): Promise<LabelOfConversation[]> {
  const { rows } = await tx.execute<Linha<LabelOfConversation>>(sql`
    select e.id, e.nome
      from conversa_etiqueta ce
      join etiqueta e on e.id = ce.etiqueta_id
     where ce.conversa_id = ${conversaId}
     order by e.nome
  `);
  return rows;
}

export async function listarMotivosDePausa(tx: TransactionPipe): Promise<MotivoDePausa[]> {
  const { rows } = await tx.execute<{
    id: string;
    name: string;
    durationSuggestedMin: number | null;
  }>(sql`
    select id, nome as name, duracao_sugerida_min as "durationSuggestedMin"
      from motivo_pausa
     where ativo
     order by nome
  `);
  return rows.map((r) => ({
    id: r.id,
    nome: r.name,
    durationSuggestedMin: r.durationSuggestedMin,
  }));
}

export async function carregarStatus(
  tx: TransactionPipe,
  atendenteId: string,
): Promise<StatusOfAgent> {
  const { rows } = await tx.execute<{
    state: StateAgent;
    since: Date | string;
    reason: string | null;
  }>(sql`
    select s.estado as "state", s.desde as "since", mp.nome as "reason"
      from status_atendente s
      left join pausa p on p.usuario_id = s.usuario_id and p.encerrada_em is null
      left join motivo_pausa mp on mp.id = p.motivo_id
     where s.usuario_id = ${atendenteId}
     limit 1
  `);
  const r = rows[0];
  // Without a status row, the agent has not joined yet; the spec's default is Invisível.
  if (!r) return { estado: 'invisivel', desde: new Date().toISOString(), motivoPausa: null };
  return { estado: r.state, desde: iso(r.since), motivoPausa: r.reason };
}

export async function listarColegas(tx: TransactionPipe, atendenteId: string): Promise<Colega[]> {
  const { rows } = await tx.execute<Linha<Colega>>(sql`
    select id, nome from usuario
     where ativo and id <> ${atendenteId}
     order by nome
  `);
  return rows;
}

export async function listHistoryOfContact(
  tx: TransactionPipe,
  contactId: string,
  /** Exclude the open conversation; `null` lists all, as on the Contacts tab. */
  exceto: string | null,
): Promise<ConversationOfHistory[]> {
  const { rows } = await tx.execute<{
    id: string;
    criada_em: Date | string;
    encerrada_em: Date | string | null;
    state: StateConversation;
    fila_nome: string | null;
  }>(sql`
    select c.id, c.criada_em, c.encerrada_em, c.estado as "state", f.nome as fila_nome
      from conversa c
      left join fila f on f.id = c.fila_id
     where c.contato_id = ${contactId}
       and (${exceto}::uuid is null or c.id <> ${exceto}::uuid)
     order by c.criada_em desc
     limit ${exceto ? 6 : 200}
  `);
  return rows.map((r) => ({
    id: r.id,
    criadaEm: iso(r.criada_em),
    encerradaEm: isoOuNulo(r.encerrada_em),
    estado: r.state,
    filaNome: r.fila_nome,
  }));
}

/**
 * Read a historical ticket from contact history. Deliberately do not filter by agent: contact history already lists its past tickets regardless of agent, so opening one reveals no more than the list. RLS is the boundary: the query runs with the session's `tenant_id`, so another client's conversation is invisible. Resolve `encerrada_por` to a person's name, not an ID; "Atendente: 3f2a…" would not answer who closed it.
 */
export async function carregarTicketAntigo(
  tx: TransactionPipe,
  conversaId: string,
): Promise<TicketAntigo | null> {
  const { rows } = await tx.execute<{
    id: string;
    state: StateConversation;
    priority: Prioridade;
    criada_em: Date | string;
    primeira_resposta_em: Date | string | null;
    lastMessageAt: Date | string | null;
    encerrada_em: Date | string | null;
    reasonClosure: string | null;
    pausadoSeg: number | string;
    fila_nome: string | null;
    channelType: TypeChannelDatabase;
    contactId: string;
    contato_nome: string | null;
    phoneE164: string | null;
    agentName: string | null;
    agentEmail: string | null;
    closedByName: string | null;
  }>(sql`
    select c.id, c.estado as "state", c.prioridade as "priority", c.criada_em, c.primeira_resposta_em,
           c.ultima_mensagem_em as "lastMessageAt", c.encerrada_em, c.motivo_encerramento as "reasonClosure", c.pausado_seg as "pausadoSeg",
           f.nome as fila_nome, ca.tipo as "channelType",
           ct.id as "contactId", ct.nome as contato_nome, ct.telefone_e164 as "phoneE164",
           ua.nome as "agentName", ua.email as "agentEmail",
           ue.nome as "closedByName"
      from conversa c
      join contato ct on ct.id = c.contato_id
      join inbox ib on ib.id = c.inbox_id
      join canal ca on ca.id = ib.canal_id
      left join fila f on f.id = c.fila_id
      left join usuario ua on ua.id = c.atendente_id
      left join usuario ue on ue.id = c.encerrada_por
     where c.id = ${conversaId}
     limit 1
  `);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    estado: r.state,
    prioridade: r.priority,
    criadaEm: iso(r.criada_em),
    primeiraRespostaEm: isoOuNulo(r.primeira_resposta_em),
    lastMessageAt: isoOuNulo(r.lastMessageAt),
    encerradaEm: isoOuNulo(r.encerrada_em),
    reasonClosure: r.reasonClosure,
    pausadoSeg: Number(r.pausadoSeg ?? 0),
    filaNome: r.fila_nome,
    canalTipo: r.channelType,
    contactId: r.contactId,
    contatoNome: r.contato_nome,
    contatoTelefone: r.phoneE164,
    agentName: r.agentName,
    agentEmail: r.agentEmail,
    closedByName: r.closedByName,
  };
}

/**
 * "Clientes aguardando" counts queued conversations in the agent's queues, or without a queue. This is the source `/agents/info` `waitingTicketsCount` (`~/desk-clone/README.md`), shown beside "Atender".
 */
export async function contarAguardando(tx: TransactionPipe, atendenteId: string): Promise<number> {
  const { rows } = await tx.execute<{ total: number | string }>(sql`
    select count(*) as total
      from conversa c
     where c.estado = 'na_fila'
       and (c.fila_id is null
            or c.fila_id in (select fila_id from fila_atendente where usuario_id = ${atendenteId}))
  `);
  return Number(rows[0]?.total ?? 0);
}


export async function listQueues(tx: TransactionPipe): Promise<{ id: string; name: string }[]> {
  const { rows } = await tx.execute<{ id: string; name: string }>(sql`
    select id, nome as "name" from fila where ativa order by nome
  `);
  return rows;
}

/* ---------------------------------------------------- a aba de Contatos */

export interface ContactOfList {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;

  lastInteractionAt: string | null;
}

/**
 * Contacts-tab list (`desk-contact-history`): search names without case folding away accents (the database has no `unaccent`) or phone digits. The source requires at least two characters (`referencias-blip/pesquisa/blip-desk-medidas.md` §11) and displays 20 per page; this implementation returns the first 200 because infinite scrolling is not yet available.
 */
export async function listContacts(tx: TransactionPipe, search: string): Promise<ContactOfList[]> {
  const termo = search.trim();
  const filter =
    termo.length >= 2
      ? sql`and (coalesce(ct.nome, '') ilike ${'%' + termo + '%'}
             or regexp_replace(coalesce(ct.telefone_e164, ''), '[^0-9]', '', 'g') like ${'%' + termo.replace(/[^0-9]/g, '') + '%'})`
      : sql``;
  const { rows } = await tx.execute<{
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    lastInteractionAt: Date | string | null;
  }>(sql`
    select ct.id, ct.nome as name, ct.telefone_e164 as phone, ct.email,
           (select max(c.ultima_mensagem_em) from conversa c where c.contato_id = ct.id) as "lastInteractionAt"
      from contato ct
     where ct.excluido_em is null
       ${filter}
     order by ct.nome nulls last, ct.telefone_e164
     limit 200
  `);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    lastInteractionAt: isoOuNulo(r.lastInteractionAt),
  }));
}

export interface RecordOfContact {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  document: string | null;
  atributos: Record<string, unknown>;
}

export async function loadContact(
  tx: TransactionPipe,
  contatoId: string,
): Promise<RecordOfContact | null> {
  const { rows } = await tx.execute<{
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    document: string | null;
    atributos: Record<string, unknown> | null;
  }>(sql`
    select id, nome as name, telefone_e164 as phone, email, documento as document, atributos
      from contato
     where id = ${contatoId}
     limit 1
  `);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    document: r.document,
    atributos: r.atributos ?? {},
  };
}

/** Os canais ativos com os seus modelos aprovados — o passo "Escolher modelo" da mensagem ativa. */
export async function listChannelsWithTemplates(
  tx: TransactionPipe,
): Promise<{ id: string; name: string; type: TypeChannelDatabase; templates: TemplateAprovado[] }[]> {
  const { rows } = await tx.execute<{ id: string; name: string; type: TypeChannelDatabase }>(sql`
    select id, nome as "name", tipo as "type" from canal where ativo order by nome
  `);
  const saida = [];
  for (const c of rows) {
    saida.push({ ...c, templates: await listarTemplatesAprovados(tx, c.id) });
  }
  return saida;
}
