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
export interface ContatoDoFluxo {
  id: string;
  nome: string;
  estado: string;
  tipo: string;
  imagemUrl: string | null;
  shortName: string | null;
  criadoEm: string | null;
  canalNome: string | null;
  canalTipo: string | null;
  canalAtivo: boolean | null;
}

export interface CascaDoContato {
  contato: ContatoDoFluxo;
  /** O fuso da conta, para o "criado em" e o "hoje" não serem o do navegador. */
  fuso: string;
}

/* ------------------------------------------------------------- Contatos */

/** Um cartão da lista — `GET /v1/gestao/fluxos/:id/contatos`. */
export interface ContatoListado {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  avatarUrl: string | null;
  canalNome: string;
  canalTipo: string;
  conversas: number;
  ultimaConversa: string | null;
}

export interface TicketDoContato {
  id: string;
  estado: string;
  criadaEm: string;
  encerradaEm: string | null;
  inbox: string;
  fila: string | null;
  atendente: string | null;
  atendenteEmail: string | null;
  resumo: string | null;
}

export interface MensagemDoHistorico {
  id: string;
  texto: string | null;
  tipo: string;
  direcao: string;
  autor: string | null;
  estado: string | null;
  criadaEm: string;
}

/** O detalhe — `GET /v1/gestao/fluxos/:id/contatos/:contatoId[?ticketId]`. */
export interface DetalheDoContato {
  pessoa: {
    id: string;
    nome: string | null;
    email: string | null;
    telefone: string | null;
    documento: string | null;
    avatarUrl: string | null;
    atributos: unknown;
    criadoEm: string;
  };
  identidade: string | null;
  canal: string | null;
  conversas: TicketDoContato[];
  selecionada: TicketDoContato | null;
  historico: MensagemDoHistorico[];
}

/* ------------------------------------------------------------------ Log */

/** Uma linha do Log — `GET /v1/gestao/fluxos/:id/logs?busca=`. */
export interface LogDoFluxo {
  id: string;
  criadaEm: string;
  direcao: string;
  tipo: string;
  conteudo: string | null;
  metadata: unknown;
  contato: string | null;
  canal: string;
  de: string | null;
  para: string | null;
}

/* --------------------------------------------------------------- Growth */

export interface EnvioGrowth {
  id: string;
  disparoId: string | null;
  contatoNome: string | null;
  templateNome: string | null;
  canalNome: string;
  estado: string | null;
  erroCodigo: string | null;
  criadaEm: string;
  custoCentavos: number | null;
}

export interface ModeloGrowth {
  id: string;
  nome: string;
  idioma: string;
  categoria: string;
  statusMeta: string;
  corpo: string;
  variaveis: string[];
  canalId: string;
  canalNome: string;
}

export interface ContatoGrowth {
  id: string;
  nome: string | null;
  telefone: string;
}

/** `GET /v1/gestao/fluxos/:id/growth` — os dados são da CONTA, não do contato. */
export interface DadosDeGrowth {
  canais: { id: string; nome: string }[];
  modelos: ModeloGrowth[];
  contatos: ContatoGrowth[];
  envios: EnvioGrowth[];
}

/* ------------------------------------------------------------ Conteúdos */

export interface ModeloListado {
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
export interface ConteudosDoFluxo {
  canalId: string | null;
  modelos: ModeloListado[];
}

/* ------------------------------------------------------------- Serviços */

export interface ServicoDoRoteador {
  id: string;
  nome: string;
  estado: string;
  tipo: string;
  shortName: string | null;
}

/** `GET /v1/gestao/fluxos/:id/servicos` — só faz sentido para roteador. */
export interface DadosDeServicos {
  principal: ServicoDoRoteador | null;
  filhos: ServicoDoRoteador[];
  busca: ServicoDoRoteador[];
}

/* --------------------------------------------------------------- Portal */

/** Os tamanhos de página do `bds-pagination` da origem (`items-page="[40,80,120]"`). */
export const POR_PAGINA = [40, 80, 120] as const;

/** Um cartão da grade do portal. */
export interface FluxoDoPortal {
  id: string;
  nome: string;
  estado: string;
  tipo: string;
  imagemUrl: string | null;
}

/** `GET /v1/gestao/fluxos?busca=&pagina=&porPagina=` — a grade, paginada no banco. */
export interface GradeDoPortal {
  fluxos: FluxoDoPortal[];
  /** Quantos fluxos a conta tem ao todo, ignorando a busca. */
  total: number;
  /** Quantos a busca encontrou. Sem busca, é igual a `total`. */
  encontrados: number;
}
