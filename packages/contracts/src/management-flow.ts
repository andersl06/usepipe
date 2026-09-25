/**
 * As telas do CONTATO da Gestão (`/fluxo/:id/**`): o que `GET /v1/gestao/fluxos/…`
 * responde e o front desenha.
 *
 * Data é TEXTO (ISO 8601): é assim que atravessa o JSON. Quem mostra converte
 * com `new Date(...)` na ponta — nunca no contrato.
 *
 * A forma é a das consultas em `apps/api/src/dominio/gestao-fluxo.ts`; se uma
 * coluna entra ou sai de lá, entra ou sai daqui, e o `tsc` do front acusa.
 */

/** O contato (o `fluxo`) e o canal dele — `GET /v1/gestao/fluxos/:id`. */
export interface ContactOfFlow {
  id: string;
  nome: string;
  estado: string;
  tipo: string;
  imageUrl: string | null;
  shortName: string | null;
  /** O "Descrição" de "Editar Fluxo"; opcional lá, nula aqui. */
  description: string | null;
  criadoEm: string | null;
  canalId: string | null;
  canalNome: string | null;
  channelType: string | null;
  channelActive: boolean | null;
  /** O que identifica o canal para quem olha: número (WhatsApp), `@usuário` (Instagram), id da Página (Messenger). */
  channelNumber: string | null;
}

/* ---------------------------------------------------------------- Canal */

/**
 * Um canal como a página "Canais" do bot o vê — `GET /v1/gestao/fluxos/:id/canal`
 * e a resposta de `PUT`. `fluxoId`/`fluxoNome` dizem qual bot vivo está com
 * ele (um bot por número — regra da origem, `FICHA-conectar-canal-no-bot.md` §4).
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
 * `GET /v1/gestao/fluxos/:id/canal`: o canal ligado a este bot (ou nulo) e os
 * canais ATIVOS da conta que a tela pode oferecer — os livres para ligar, e os
 * que já estão com outro bot (para dizer qual, como a origem manda "remover do
 * anterior"). Decisão Pipe: na origem o número nasce no bot e não há lista.
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
  /** O fuso da conta, para o "criado em" e o "hoje" não serem o do navegador. */
  fuso: string;
}

/* ------------------------------------------------------------- Contatos */

/** Um cartão da lista — `GET /v1/gestao/fluxos/:id/contatos`. */
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

/** `GET /v1/gestao/fluxos/:id/growth` — os dados são da CONTA, não do contato. */
export interface DataOfGrowth {
  channels: { id: string; nome: string }[];
  modelos: TemplateGrowth[];
  contacts: ContactGrowth[];
  envios: EnvioGrowth[];
}

/* ------------------------------------------------------------ Conteúdos */

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

/** `GET /v1/gestao/fluxos/:id/conteudos`. Sem canal WhatsApp, `modelos` é vazio. */
export interface ContentItemsOfFlow {
  canalId: string | null;
  modelos: TemplateListed[];
}

/* ------------------------------------------------------------- Serviços */

/** Um chatbot (um `fluxo`) — o roteador, ou o que atende um serviço. */
export interface RouterService {
  id: string;
  nome: string;
  estado: string;
  tipo: string;
  shortName: string | null;
}

/** Um serviço do roteador (`roteador_servico`): o nome e o chatbot que atende. */
export interface LinkedService {
  /** O id do VÍNCULO — é o que vai em `PATCH`/`DELETE …/servicos/:servicoId`. */
  id: string;
  /** O nome do serviço: é o `address` do `Redirect`. */
  nome: string;
  /** "É o meu chatbot principal". */
  principal: boolean;
  /** "Não redirecionar automaticamente para o principal". */
  persistente: boolean;
  /** "Expiração do redirecionamento", em minutos; nula para principal e persistente. */
  expirationMin: number | null;
  chatbot: RouterService;
}

/**
 * `GET /v1/gestao/fluxos/:id/servicos` — só faz sentido para roteador: para fluxo,
 * `roteador` é nulo e as listas vêm vazias. `busca` são os chatbots que podem virar
 * serviço (tipo `fluxo`, não arquivados); o não publicado aparece apagado na tela.
 */
export interface DataOfServices {
  router: RouterService | null;
  principal: LinkedService | null;
  filhos: LinkedService[];
  search: RouterService[];
}

/**
 * O formulário de serviço — `POST /v1/gestao/fluxos/:id/servicos` (tudo) e
 * `PATCH …/servicos/:servicoId` (só o que muda). Principal ignora `persistente` e
 * `expiracaoMin`; persistente ignora `expiracaoMin`.
 */
export interface RequestOfService {
  nome: string;
  chatbotId: string;
  principal: boolean;
  persistente: boolean;
  expiracaoMin: number | null;
}

/* --------------------------------------------------------------- Portal */

/** Os tamanhos de página do `bds-pagination` da origem (`items-page="[40,80,120]"`). */
export const BY_PAGE = [40, 80, 120] as const;

/** Um cartão da grade do portal. */
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
  /** Quantos fluxos a conta tem ao todo, ignorando a busca. */
  total: number;
  /** Quantos a busca encontrou. Sem busca, é igual a `total`. */
  encontrados: number;
}

/* --------------------------------------------------------- Boas-vindas */

/**
 * `GET/PATCH /v1/gestao/fluxos/:id/boas-vindas` — "Defina a Mensagem de
 * Saudação e o botão Começar" (`/configurations/welcome`).
 *
 * Desativado é `{ ativo: false }`: `mensagem`/`textoBotao` continuam com o
 * último valor gravado (não se apagam ao desligar o interruptor), mas a tela
 * só os mostra — e só exige preenchidos — quando `ativo` é `true`.
 */
export interface ConfigurationOfWelcome {
  ativo: boolean;
  message: string;
  textoBotao: string;
}

/** Uma linha do Menu Persistente: "Texto" e "Link" do item que dispara um comando. */
export interface ItemDoMenuPersistente {
  texto: string;
  link: string;
}

/**
 * `GET/PATCH /v1/gestao/fluxos/:id/menu-persistente` — "Configure o menu
 * persistente de seu fluxo" (`/configurations/persistentMenu`), até 3 itens.
 *
 * `boasVindasPreenchida` é a segunda trava da origem ("Antes de salvar...
 * você precisa preencher a tela de boas-vindas"): a tela some o Salvar quando
 * falsa, e a `api` recusa o PATCH do mesmo jeito.
 */
export interface ConfigurationOfMenuPersistent {
  itens: ItemDoMenuPersistente[];
  boasVindasPreenchida: boolean;
}

/* ------------------------------------------------------------- Builder */

/**
 * O desenho como o editor da Blip o guarda, e como a cópia do Builder o pede
 * à ponte: o mapa de estados (`blip_portal:builder_working_flow`) e as ações
 * globais (`blip_portal:builder_working_global_actions`). É o `{ flow,
 * globalActions }` do botão "Exportar" do Builder, com os nomes traduzidos.
 */
export interface DesenhoDoBuilder {
  flow: Record<string, unknown>;
  globals: Record<string, unknown>;
}

/**
 * Um erro que o motor apontaria ao rodar o fluxo (`errosDoFluxo` de
 * `@pipe/core`), preso ao bloco que o causa. `bloco` é o `id` do estado no
 * editor; `null` quando o erro é do fluxo inteiro (sem raiz, por exemplo).
 */
export interface BlockError {
  block: string | null;
  mensagem: string;
}

export type StateOfVersion = 'rascunho' | 'publicada' | 'arquivada';

/** Uma linha de `fluxo_versao`, como o histórico do Builder a lista. */
export interface VersionOfFlow {
  id: string;
  versao: number;
  estado: StateOfVersion;
  blocos: number;
  publicadaEm: string | null;
  /** Quem publicou, pelo nome — `null` quando a versão nunca foi publicada. */
  publishedBy: string | null;
  criadoEm: string | null;
  atualizadoEm: string | null;
}

/**
 * De onde veio o desenho que o Builder abre: o rascunho em edição, a versão
 * publicada (quando não há rascunho) ou o fluxo padrão (fluxo novo, nada
 * gravado ainda).
 */
export type OrigemDoDesenho = 'rascunho' | 'publicada' | 'padrao';

/** `GET /v1/gestao/fluxos/:id/builder`. */
export interface BuilderOfFlow {
  flowId: string;
  origem: OrigemDoDesenho;
  /** A versão carregada; `null` quando é o fluxo padrão, que ainda não existe no banco. */
  versao: VersionOfFlow | null;
  /** A versão que o motor está rodando agora, se houver. */
  publicada: VersionOfFlow | null;
  desenho: DesenhoDoBuilder;
  /** O que impediria publicar o desenho carregado. Vazio = publicável. */
  errors: BlockError[];
  /** Ações que o motor do Pipe ainda não executa, por tipo — publicar é permitido, rodar falha. */
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
  /** A que saiu do ar para esta entrar, se havia. */
  arquivada: VersionOfFlow | null;
}
