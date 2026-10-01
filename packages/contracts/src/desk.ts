/**
 * Desk screen contracts describe responses from `GET /v1/desk/…` rendered by the front end. Dates cross JSON as ISO 8601 text; the display converts them with `new Date(...)`, never the contract. This was the sole shape change in the Next Desk migration, where page and database shared a process and queries returned `Date`. These shapes follow queries in `apps/api/src/dominio/desk/*.ts`; changing a query column requires a matching contract change, surfaced by front-end `tsc`.
 */

export type StateConversation = 'na_fila' | 'atribuida' | 'em_atendimento' | 'em_espera' | 'encerrada';
/**
 * Priority levels match `@pipe/core/conversa` (`NIVEIS_PRIORIDADE`) but are spelled out here because the contracts package imports no packages. All five literals match; front-end `tsc` catches divergence when indexing `ROTULOS_PRIORIDADE` with this type.
 */
export type PriorityOfDesk = 'maxima' | 'alta' | 'media' | 'baixa' | 'sem_prioridade';
export type TypeChannelDatabase = 'whatsapp_cloud' | 'instagram' | 'email' | 'widget';
export type StateAgent = 'online' | 'pausa' | 'invisivel' | 'offline';

/* ------------------------------------------------------------ a fila */

export interface ConversationOfList {
  id: string;
  estado: StateConversation;
  prioridade: PriorityOfDesk;
  criadaEm: string;
  /** Null means the agent has not answered this conversation yet; shown as the Unanswered card. */
  primeiraRespostaEm: string | null;
  ultimaMensagemEm: string | null;
  lastMessageFrom: string | null;
  janelaExpiraEm: string | null;
  /** When the hold started, used by the On Hold card timer. */
  emEsperaDesde: string | null;
  contatoNome: string | null;
  contatoTelefone: string | null;
  filaNome: string | null;
  canalTipo: TypeChannelDatabase;
  lastMessage: string | null;
  lastMessageType: string | null;
  /**
   * This agent's own markers (`marcacao_conversa`, migration 0041): pinned at the top of the list and manually marked unread. Null means unmarked. They belong to the agent, not the conversation; a colleague receiving a transfer does not see them.
   */
  fixadaEm: string | null;
  naoLidaEm: string | null;
}

export interface StatusOfAgent {
  estado: StateAgent;
  desde: string;
  motivoPausa: string | null;
}

export interface MotivoDePausa {
  id: string;
  nome: string;
  durationSuggestedMin: number | null;
}

export interface EtiquetaDoDesk {
  id: string;
  nome: string;
  cor: string | null;
  requiredInClosure: boolean;
}

export interface Colega {
  id: string;
  nome: string;
}

export interface RespostaProntaDoDesk {
  id: string;
  scope: 'empresa' | 'pessoal';
  categoria: string | null;
  atalho: string;
  titulo: string;
  corpo: string;
}

/**
 * `GET /v1/desk/fila` returns the agent queue and catalogs needed by its column: status, pause reasons, tags, colleagues, and canned responses. One request and transaction mirror the Next page. Search, card, ordering, and queue filtering stay in the browser (`lib/ordem.ts`) because they are pure rules over the full list.
 */
export interface QueueOfDesk {
  conversations: ConversationOfList[];
  /** Waiting customers: queued conversations in this agent's queues. The Answer button takes the oldest. */
  aguardando: number;
  status: StatusOfAgent;
  motivos: MotivoDePausa[];
  etiquetas: EtiquetaDoDesk[];
  colegas: Colega[];
  respostas: RespostaProntaDoDesk[];
}

/* ------------------------------------------------------- a conversa */

export interface ConversationOpen {
  id: string;
  state: StateConversation;
  priority: PriorityOfDesk;
  criadaEm: string;
  firstResponseAt: string | null;
  emEsperaDesde: string | null;
  windowExpiresAt: string | null;
  queueName: string | null;
  channelId: string;
  channelType: TypeChannelDatabase;
  contactId: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  contactDocument: string | null;
  contactAttributes: Record<string, unknown>;
  resumo: string | null;
  resumoEm: string | null;
  summaryTemplate: string | null;
}

export type ItemOfConversation =
  | {
      genero: 'mensagem';
      id: string;
      criadaEm: string;
      direction: 'entrada' | 'saida';
      tipo: string;
      conteudo: string | null;
      stateDelivery: string | null;
      errorCode: string | null;
      errorText: string | null;
      lidaEm: string | null;
      entregueEm: string | null;
      deRespostaPronta: boolean;
      deTemplate: boolean;
    }
  | { genero: 'nota'; id: string; criadaEm: string; corpo: string; autor: string | null };

export interface TemplateAprovado {
  id: string;
  nome: string;
  categoria: 'utilidade' | 'marketing' | 'autenticacao';
  corpo: string;
  /**
   * Variable names in the order of `{{1}}`, `{{2}}`, etc. Without that order, the UI cannot resolve the body.
   */
  variables: unknown;
}

export interface LabelOfConversation {
  id: string;
  nome: string;
}

export interface ConversationOfHistory {
  id: string;
  criadaEm: string;
  encerradaEm: string | null;
  estado: StateConversation;
  filaNome: string | null;
  /**
   * Who ended it, from the `encerrada` attendance event (`dados.encerrada_por`): atendente / cliente /
   * inatividade / transferencia / bot. Null while open or when the event predates the field. Kept a
   * plain string so a new actor never breaks the read; the front end maps known values to labels.
   */
  closedBy: string | null;
}


export interface ConversationOfDesk {
  conversation: ConversationOpen;
  itens: ItemOfConversation[];
  templates: TemplateAprovado[];
  labelsOfConversation: LabelOfConversation[];
  /**
   * CONTACT tags (`contato_etiqueta`) shown and edited in the Contact Data panel. They stay separate from conversation tags because `etiqueta.escopo` gives them different scopes; neither scope inherits the other.
   */
  labelsOfContact: LabelOfConversation[];
  history: ConversationOfHistory[];
}

/**
 * `GET /v1/desk/conversas/:id` returns `aberta: null` with HTTP 200 when the conversation does not exist or does not belong to this agent. The UI then returns to the queue without an open conversation, as the Next page did, without entering the cache error path.
 */
export interface ResponseOfConversation {
  aberta: ConversationOfDesk | null;
}

/* ------------------------------------------------------ o ticket antigo */

export interface TicketAntigo {
  id: string;
  estado: StateConversation;
  prioridade: PriorityOfDesk;
  criadaEm: string;
  primeiraRespostaEm: string | null;
  lastMessageAt: string | null;
  encerradaEm: string | null;
  reasonClosure: string | null;
  pausadoSeg: number;
  filaNome: string | null;
  canalTipo: TypeChannelDatabase;
  contactId: string;
  contatoNome: string | null;
  contatoTelefone: string | null;
  /** Agent who handled the ticket; null means it never left the bot. */
  agentName: string | null;
  agentEmail: string | null;
  /** Agent who closed it; null with `encerradaEm` set means automatic closure. */
  closedByName: string | null;
}

/**
 * `GET /v1/desk/tickets/:id` reads an old ticket. It returns 404 when absent or hidden by tenant RLS. `status` is included because the rail shows it on every screen and the screen uses one API request.
 */
export interface TicketDoDesk {
  ticket: TicketAntigo;
  itens: ItemOfConversation[];
  etiquetas: LabelOfConversation[];
  status: StatusOfAgent;
}



export interface CountOfSituation {
  abertos: number;
  fechados: number;
  finalizados: number;
  abandonados: number;
  /** `null` means the domain does not yet store this, rather than zero. */
  transferidos: number | null;
  perdidos: number | null;
}

export interface TemposMedios {
  /** Seconds from arrival to the agent's first response. */
  firstResponseSeg: number | null;
  /** Seconds from opening until assignment to an agent. */
  waitInQueueSeg: number | null;
  /** Queue time plus time the conversation spent on hold, in seconds. */
  esperaTotalSeg: number | null;
}

export interface DiaDaSerie {
  dia: string;
  abertos: number;
  fechados: number;
}

export interface MetricsOfAgent {
  situations: CountOfSituation;
  tempos: TemposMedios;
  serie: DiaDaSerie[];
}

/**
 * `GET /v1/desk/metricas?inicio=&fim=` takes ISO 8601 bounds. The browser computes the interval in the viewer's clock (`lib/periodo.ts`), as the Next page formerly did on the server clock; the API only applies it. `status` travels with metrics because the rail displays it on every screen, allowing one API request per screen.
 */
export interface ResponseOfMetrics {
  metrics: MetricsOfAgent;
  status: StatusOfAgent;
}

/** O que o CRM sabe do contato, no painel. `null` some da tela. */
export interface FichaDoCrm {
  nome: string;
  email: string | null;
  empresa: string | null;
  /** Link to this customer's CRM record, never the home page. */
  link: string;
}
