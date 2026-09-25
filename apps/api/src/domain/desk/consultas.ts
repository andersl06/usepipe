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
 * Consultas de leitura do Desk — movidas de `apps/desk/src/servidor/consultas.ts`
 * com o SQL intacto. O que mudou foi de onde a transação vem (por parâmetro, do
 * `noTenant` do controlador) e a forma da data (ISO, para atravessar o JSON).
 *
 * SQL escrito à mão de propósito: são junções de quatro a cinco tabelas com um
 * `lateral` para pegar a última mensagem de cada conversa, e o construtor do Drizzle
 * ficaria mais longo e menos legível do que o próprio SQL. Escrita continua passando
 * pelo schema tipado (ver `acoes.ts`).
 *
 * Toda consulta roda dentro de `noTenant`, ou seja, com `pipe.tenant_id` fixado e a
 * RLS valendo — nenhuma delas filtra tenant na mão, porque o banco já filtra.
 *
 * Os tipos de saída são os de `@pipe/contracts` (`desk.ts`): se uma coluna entra
 * ou sai daqui, entra ou sai de lá, e o `tsc` do front acusa.
 */

/**
 * `execute<T>` pede um tipo com índice implícito, e `interface` do contrato não tem.
 * O mapeamento devolve a mesma forma como tipo de objeto, que tem.
 */
type Linha<T> = { [K in keyof T]: T[K] };

/**
 * O driver devolve `timestamptz` como `Date` quando o `pg` é carregado uma vez só, e como
 * texto quando alguém carrega uma segunda cópia do parser. Normalizar num lugar só é
 * mais barato do que descobrir isso de novo dentro de um componente.
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
    select c.id, c.estado, c.prioridade, c.criada_em, c.primeira_resposta_em,
           c.ultima_mensagem_em, c.ultima_mensagem_de,
           c.janela_expira_em, c.em_espera_desde, ct.nome as contato_nome, ct.telefone_e164 as contato_telefone,
           f.nome as fila_nome,
           ca.tipo as canal_tipo, m.conteudo as ultima_mensagem, m.tipo as ultima_mensagem_tipo,
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
    ultimaMensagemDe: r.lastMessageOf,
    janelaExpiraEm: isoOuNulo(r.windowExpiresAt),
    emEsperaDesde: isoOuNulo(r.em_espera_desde),
    contatoNome: r.contato_nome,
    contatoTelefone: r.contactPhone,
    filaNome: r.fila_nome,
    canalTipo: r.channelType,
    ultimaMensagem: r.lastMessage,
    ultimaMensagemTipo: r.lastMessageType,
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
    select c.id, c.estado, c.prioridade, c.criada_em, c.primeira_resposta_em, c.em_espera_desde,
           c.janela_expira_em, f.nome as fila_nome, ca.id as canal_id, ca.tipo as canal_tipo,
           ct.id as contato_id, ct.nome as contato_nome, ct.telefone_e164, ct.email,
           ct.documento, ct.atributos,
           cl.resumo, cl.criada_em as resumo_em, cl.modelo as resumo_modelo
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
    contactAtributos: r.atributos ?? {},
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
    select id, criada_em, direcao, tipo, conteudo, estado_entrega, erro_codigo, erro_texto,
           lida_em, entregue_em, resposta_pronta_id, template_id
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
    select n.id, n.em, n.corpo, u.nome as autor
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
    select id, escopo, categoria, atalho, titulo, corpo
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
    select id, nome, categoria, corpo, variaveis
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
    select id, nome, cor, obrigatoria_no_encerramento
      from etiqueta
     where escopo in ('conversa', 'ambos')
     order by obrigatoria_no_encerramento, nome
  `);
  return rows.map((r) => ({
    id: r.id,
    nome: r.name,
    cor: r.color,
    obrigatoriaNoEncerramento: r.requiredInClosure,
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
    select id, nome, duracao_sugerida_min
      from motivo_pausa
     where ativo
     order by nome
  `);
  return rows.map((r) => ({
    id: r.id,
    nome: r.name,
    duracaoSugeridaMin: r.durationSuggestedMin,
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
    select s.estado, s.desde, mp.nome as motivo
      from status_atendente s
      left join pausa p on p.usuario_id = s.usuario_id and p.encerrada_em is null
      left join motivo_pausa mp on mp.id = p.motivo_id
     where s.usuario_id = ${atendenteId}
     limit 1
  `);
  const r = rows[0];
  // Sem linha de status, o atendente ainda não entrou: o padrão da spec é Invisível.
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
  /** A conversa aberta, que fica de fora; `null` lista todas (a aba Contatos). */
  exceto: string | null,
): Promise<ConversationOfHistory[]> {
  const { rows } = await tx.execute<{
    id: string;
    criada_em: Date | string;
    encerrada_em: Date | string | null;
    state: StateConversation;
    fila_nome: string | null;
  }>(sql`
    select c.id, c.criada_em, c.encerrada_em, c.estado, f.nome as fila_nome
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
 * O ticket antigo, aberto em leitura a partir do histórico do contato.
 *
 * **Não filtra por atendente, e isso é deliberado.** O histórico do contato já
 * lista os atendimentos anteriores dele sem olhar quem atendeu — abrir um deles
 * não mostra nada que a coluna ao lado já não mostrasse. O que fecha o cerco é
 * a RLS: a transação roda com o `tenant_id` da sessão, e conversa de outro
 * cliente não existe para esta consulta.
 *
 * `encerrada_por` vira nome de gente aqui, e não identificador: "Atendente:
 * 3f2a…" não responde a pergunta que alguém faz ao abrir um ticket antigo.
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
    select c.id, c.estado, c.prioridade, c.criada_em, c.primeira_resposta_em,
           c.ultima_mensagem_em, c.encerrada_em, c.motivo_encerramento, c.pausado_seg,
           f.nome as fila_nome, ca.tipo as canal_tipo,
           ct.id as contato_id, ct.nome as contato_nome, ct.telefone_e164,
           ua.nome as atendente_nome, ua.email as atendente_email,
           ue.nome as encerrada_por_nome
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
 * "Clientes aguardando": quantas conversas estão na fila, nas filas em que o
 * atendente está (ou sem fila). É o `waitingTicketsCount` de `/agents/info` da
 * referência (`~/desk-clone/README.md`), que a coluna mostra ao lado de "Atender".
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

/** As filas ativas do cliente — o destino do modal de transferência ("Fila"). */
export async function listQueues(tx: TransactionPipe): Promise<{ id: string; name: string }[]> {
  const { rows } = await tx.execute<{ id: string; name: string }>(sql`
    select id, nome from fila where ativa order by nome
  `);
  return rows;
}

/* ---------------------------------------------------- a aba de Contatos */

export interface ContactOfList {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  /** A última mensagem trocada com o contato, em qualquer conversa. */
  lastInteractionAt: string | null;
}

/**
 * A lista da aba Contatos (`desk-contact-history`): nome sem caixa (o acento
 * fica; o banco não tem `unaccent`), ou dígitos do telefone, com o mínimo de 2 caracteres da referência
 * (`referencias-blip/pesquisa/blip-desk-medidas.md` §11). 20 por página lá; aqui os 200
 * primeiros, porque a lista ainda não tem rolagem infinita.
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
    select ct.id, ct.nome, ct.telefone_e164 as telefone, ct.email,
           (select max(c.ultima_mensagem_em) from conversa c where c.contato_id = ct.id) as ultima_interacao_em
      from contato ct
     where ct.excluido_em is null
       ${filter}
     order by ct.nome nulls last, ct.telefone_e164
     limit 200
  `);
  return rows.map((r) => ({
    id: r.id,
    nome: r.name,
    telefone: r.phone,
    email: r.email,
    ultimaInteracaoEm: isoOuNulo(r.lastInteractionAt),
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
    select id, nome, telefone_e164 as telefone, email, documento, atributos
      from contato
     where id = ${contatoId}
     limit 1
  `);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    nome: r.name,
    telefone: r.phone,
    email: r.email,
    documento: r.document,
    atributos: r.atributos ?? {},
  };
}

/** Os canais ativos com os seus modelos aprovados — o passo "Escolher modelo" da mensagem ativa. */
export async function listChannelsWithTemplates(
  tx: TransactionPipe,
): Promise<{ id: string; name: string; type: TypeChannelDatabase; templates: TemplateAprovado[] }[]> {
  const { rows } = await tx.execute<{ id: string; name: string; type: TypeChannelDatabase }>(sql`
    select id, nome, tipo from canal where ativo order by nome
  `);
  const saida = [];
  for (const c of rows) {
    saida.push({ ...c, templates: await listarTemplatesAprovados(tx, c.id) });
  }
  return saida;
}
