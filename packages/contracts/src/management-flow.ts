/**
 * Management contact screens (`/fluxo/:id/**`) render responses from `GET /v1/gestao/fluxos/…`. Dates cross JSON as ISO 8601 text and are converted with `new Date(...)` at display time, never in the contract. Shapes follow queries in `apps/api/src/dominio/gestao-fluxo.ts`; front-end `tsc` catches changed columns.
 */

/** O contato (o `fluxo`) e o canal dele — `GET /v1/gestao/fluxos/:id`. */
export interface ContactOfFlow {
  id: string;
  nome: string;
  estado: string;
  tipo: string;
  imageUrl: string | null;
  shortName: string | null;
  /** Description in Edit Flow: optional there, nullable here. */
  description: string | null;
  criadoEm: string | null;
  canalId: string | null;
  canalNome: string | null;
  channelType: string | null;
  channelActive: boolean | null;
  /** Channel identifier shown to viewers: phone number for WhatsApp, `@usuário` for Instagram, or Page ID for Messenger. */
  channelNumber: string | null;
}

/* ---------------------------------------------------------------- Canal */

/**
 * A channel as the bot Channels page sees it, returned by `GET /v1/gestao/fluxos/:id/canal` and `PUT`. `fluxoId` and `fluxoNome` identify the live bot holding it: one bot per number, as in `FICHA-conectar-canal-no-bot.md` §4.
 */
export interface ChannelOfFlow {
  id: string;
  tipo: string;
  nome: string;
  numero: string | null;
  ativo: boolean;
  flowId: string | null;
  flowName: string | null;
}

/**
 * `GET /v1/gestao/fluxos/:id/canal` returns this bot's linked channel (or null) and account channels that are ACTIVE: free channels and channels linked to another bot, so the UI can identify the previous bot as the source instructs ("remover do anterior"). Pipe deliberately differs from the source, where the number is created inside the bot and no list exists.
 */
export interface ChannelOfFlowInScreen {
  channel: ChannelOfFlow | null;
  disponiveis: ChannelOfFlow[];
}

/** `PUT /v1/gestao/fluxos/:id/canal`. */
export interface RequestOfChannelOfFlow {
  canalId: string;
}

export interface ShellOfContact {
  contato: ContactOfFlow;
  /** Account timezone so "created at" and "today" use the account clock rather than the browser clock. */
  fuso: string;
}

/* ------------------------------------------------------------- Contatos */


export interface ContactListed {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  avatarUrl: string | null;
  canalNome: string;
  canalTipo: string;
  conversas: number;
  lastConversation: string | null;
}

export interface TicketOfContact {
  id: string;
  estado: string;
  criadaEm: string;
  encerradaEm: string | null;
  inbox: string;
  queue: string | null;
  agent: string | null;
  agentEmail: string | null;
  resumo: string | null;
}

export interface MessageOfHistory {
  id: string;
  texto: string | null;
  tipo: string;
  direction: string;
  autor: string | null;
  state: string | null;
  criadaEm: string;
}

/** O detalhe — `GET /v1/gestao/fluxos/:id/contatos/:contatoId[?ticketId]`. */
export interface DetalheOfContact {
  pessoa: {
    id: string;
    nome: string | null;
    email: string | null;
    telefone: string | null;
    document: string | null;
    avatarUrl: string | null;
    atributos: unknown;
    criadoEm: string;
  };
  identity: string | null;
  channel: string | null;
  conversations: TicketOfContact[];
  selecionada: TicketOfContact | null;
  history: MessageOfHistory[];
}

/* ------------------------------------------------------------------ Log */

/** Uma linha do Log — `GET /v1/gestao/fluxos/:id/logs?busca=`. */
export interface LogOfFlow {
  id: string;
  criadaEm: string;
  direcao: string;
  tipo: string;
  conteudo: string | null;
  metadata: unknown;
  contact: string | null;
  canal: string;
  de: string | null;
  para: string | null;
}

/* --------------------------------------------------------------- Growth */

export interface EnvioGrowth {
  id: string;
  disparoId: string | null;
  contactName: string | null;
  templateNome: string | null;
  channelName: string;
  estado: string | null;
  errorCode: string | null;
  criadaEm: string;
  custoCentavos: number | null;
}

export interface TemplateGrowth {
  id: string;
  nome: string;
  idioma: string;
  categoria: string;
  statusMeta: string;
  corpo: string;
  variables: string[];
  channelId: string;
  canalNome: string;
}

export interface ContactGrowth {
  id: string;
  nome: string | null;
  telefone: string;
}

/** `GET /v1/gestao/fluxos/:id/growth`: data belongs to the ACCOUNT, not the contact. */
export interface DataOfGrowth {
  channels: { id: string; nome: string }[];
  modelos: TemplateGrowth[];
  contacts: ContactGrowth[];
  envios: EnvioGrowth[];
}



export interface TemplateListed {
  id: string;
  canalId: string;
  corpo: string;
  nome: string;
  idioma: string;
  categoria: string;
  statusMeta: string;
  cabecalhoTipo: string;
  variaveis: string[];
  canalNome: string;
}

/** `GET /v1/gestao/fluxos/:id/conteudos`; without a WhatsApp channel, `modelos` is empty. */
export interface ContentItemsOfFlow {
  canalId: string | null;
  modelos: TemplateListed[];
}



/** A chatbot (a `fluxo`): either the router or the bot handling a service. */
export interface RouterService {
  id: string;
  nome: string;
  estado: string;
  tipo: string;
  shortName: string | null;
}

/** Router service (`roteador_servico`): its name and handling chatbot. */
export interface LinkedService {
  /** Link ID used by `PATCH` and `DELETE …/servicos/:servicoId`. */
  id: string;
  /** Service name used as the `Redirect` address. */
  nome: string;
  /** Whether this is the primary chatbot. */
  principal: boolean;
  /** "Não redirecionar automaticamente para o principal". */
  persistente: boolean;
  /** The `"Expiração do redirecionamento"` label gives redirect expiration in minutes; null for primary and persistent services. */
  expirationMin: number | null;
  chatbot: RouterService;
}

/**
 * `GET /v1/gestao/fluxos/:id/servicos` applies only to routers: a regular flow has null `roteador` and empty lists. `busca` contains eligible service chatbots (type `fluxo`, not archived); unpublished ones appear dimmed.
 */
export interface DataOfServices {
  router: RouterService | null;
  principal: LinkedService | null;
  filhos: LinkedService[];
  search: RouterService[];
}

/**
 * Service form for `POST /v1/gestao/fluxos/:id/servicos` (all fields) and `PATCH …/servicos/:servicoId` (changed fields only). A primary service ignores `persistente` and `expiracaoMin`; a persistent service ignores `expiracaoMin`.
 */
export interface RequestOfService {
  nome: string;
  chatbotId: string;
  principal: boolean;
  persistente: boolean;
  expiracaoMin: number | null;
}

/* --------------------------------------------------------------- Portal */

/** Page sizes from the source `bds-pagination` (`items-page="[40,80,120]"`). */
export const BY_PAGE = [40, 80, 120] as const;


export interface FlowOfPortal {
  id: string;
  nome: string;
  estado: string;
  tipo: string;
  imagemUrl: string | null;
}

/** `GET /v1/gestao/fluxos?busca=&pagina=&porPagina=` — a grade, paginada no banco. */
export interface GradeDoPortal {
  flows: FlowOfPortal[];
  /** Total flows in the account, ignoring search. */
  total: number;
  /** Number found by search; equals `total` when no search is active. */
  encontrados: number;
}

/* --------------------------------------------------------- Boas-vindas */

/**
 * `GET/PATCH /v1/gestao/fluxos/:id/boas-vindas` mirrors the source `/configurations/welcome` screen, "Defina a Mensagem de Saudação e o botão Começar". Disabled means `{ ativo: false }`: `mensagem` and `textoBotao` retain their last stored values. The screen shows and requires them only while `ativo` is true.
 */
export interface ConfigurationOfWelcome {
  ativo: boolean;
  message: string;
  textoBotao: string;
}

/** Persistent Menu item row: the command item's "Texto" and "Link". */
export interface ItemDoMenuPersistente {
  texto: string;
  link: string;
}

/**
 * `GET/PATCH /v1/gestao/fluxos/:id/menu-persistente` mirrors `/configurations/persistentMenu`, "Configure o menu persistente de seu fluxo", with at most three items. `boasVindasPreenchida` is the source's second guard ("Antes de salvar... você precisa preencher a tela de boas-vindas"): when false, the UI hides Save and the API also rejects PATCH.
 */
export interface ConfigurationOfMenuPersistent {
  itens: ItemDoMenuPersistente[];
  boasVindasPreenchida: boolean;
}

/* ------------------------------------------------------------- Builder */

/**
 * Builder drawing in the format Blip stores and the Builder copy requests from the bridge: state map `blip_portal:builder_working_flow` and global actions `blip_portal:builder_working_global_actions`. It corresponds to the Builder "Exportar" button's `{ flow, globalActions }`, with translated names.
 */
export interface DesenhoDoBuilder {
  flow: Record<string, unknown>;
  globals: Record<string, unknown>;
}

/**
 * Flow-engine error (`errosDoFluxo` in `@pipe/core`) attached to its causing block. `bloco` is the editor state `id`; null means a whole-flow error, such as a missing root.
 */
export interface BlockError {
  block: string | null;
  mensagem: string;
}

export type StateOfVersion = 'rascunho' | 'publicada' | 'arquivada';

/** A `fluxo_versao` row as listed by Builder history. */
export interface VersionOfFlow {
  id: string;
  versao: number;
  estado: StateOfVersion;
  blocos: number;
  publicadaEm: string | null;
  /** Publisher name; null when the version was never published. */
  publishedBy: string | null;
  criadoEm: string | null;
  atualizadoEm: string | null;
}

/**
 * Source of the Builder drawing: the editable draft, the published version when there is no draft, or the default flow when nothing has been stored yet.
 */
export type OrigemDoDesenho = 'rascunho' | 'publicada' | 'padrao';

/** `GET /v1/gestao/fluxos/:id/builder`. */
export interface BuilderOfFlow {
  flowId: string;
  origem: OrigemDoDesenho;
  /** Loaded version; null for the default flow, which does not yet exist in the database. */
  versao: VersionOfFlow | null;
  /** Version currently running in the engine, if any. */
  publicada: VersionOfFlow | null;
  desenho: DesenhoDoBuilder;
  /** Errors blocking publication of the loaded drawing; empty means publishable. */
  errors: BlockError[];
  /** Action types the Pipe engine cannot yet run; publication is allowed, but execution fails. */
  naoSuportado: Record<string, number>;
}

/** `PUT /v1/gestao/fluxos/:id/builder` e `POST .../versoes/:versao/restaurar`. */
export interface RascunhoGravado {
  versao: VersionOfFlow;
  erros: BlockError[];
  naoSuportado: Record<string, number>;
}

/** `POST /v1/gestao/fluxos/:id/builder/publicar`. */
export interface VersaoPublicada {
  versao: VersionOfFlow;
  /** Previous version taken offline when this one went live, if any. */
  arquivada: VersionOfFlow | null;
}
