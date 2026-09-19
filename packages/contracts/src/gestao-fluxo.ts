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
  /** O "Descrição" de "Editar Fluxo"; opcional lá, nula aqui. */
  descricao: string | null;
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

/** Um chatbot (um `fluxo`) — o roteador, ou o que atende um serviço. */
export interface ServicoDoRoteador {
  id: string;
  nome: string;
  estado: string;
  tipo: string;
  shortName: string | null;
}

/** Um serviço do roteador (`roteador_servico`): o nome e o chatbot que atende. */
export interface ServicoVinculado {
  /** O id do VÍNCULO — é o que vai em `PATCH`/`DELETE …/servicos/:servicoId`. */
  id: string;
  /** O nome do serviço: é o `address` do `Redirect`. */
  nome: string;
  /** "É o meu chatbot principal". */
  principal: boolean;
  /** "Não redirecionar automaticamente para o principal". */
  persistente: boolean;
  /** "Expiração do redirecionamento", em minutos; nula para principal e persistente. */
  expiracaoMin: number | null;
  chatbot: ServicoDoRoteador;
}

/**
 * `GET /v1/gestao/fluxos/:id/servicos` — só faz sentido para roteador: para fluxo,
 * `roteador` é nulo e as listas vêm vazias. `busca` são os chatbots que podem virar
 * serviço (tipo `fluxo`, não arquivados); o não publicado aparece apagado na tela.
 */
export interface DadosDeServicos {
  roteador: ServicoDoRoteador | null;
  principal: ServicoVinculado | null;
  filhos: ServicoVinculado[];
  busca: ServicoDoRoteador[];
}

/**
 * O formulário de serviço — `POST /v1/gestao/fluxos/:id/servicos` (tudo) e
 * `PATCH …/servicos/:servicoId` (só o que muda). Principal ignora `persistente` e
 * `expiracaoMin`; persistente ignora `expiracaoMin`.
 */
export interface PedidoDeServico {
  nome: string;
  chatbotId: string;
  principal: boolean;
  persistente: boolean;
  expiracaoMin: number | null;
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

/* --------------------------------------------------------- Boas-vindas */

/**
 * `GET/PATCH /v1/gestao/fluxos/:id/boas-vindas` — "Defina a Mensagem de
 * Saudação e o botão Começar" (`/configurations/welcome`).
 *
 * Desativado é `{ ativo: false }`: `mensagem`/`textoBotao` continuam com o
 * último valor gravado (não se apagam ao desligar o interruptor), mas a tela
 * só os mostra — e só exige preenchidos — quando `ativo` é `true`.
 */
export interface ConfiguracaoDeBoasVindas {
  ativo: boolean;
  mensagem: string;
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
export interface ConfiguracaoDeMenuPersistente {
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
  fluxo: Record<string, unknown>;
  globais: Record<string, unknown>;
}

/**
 * Um erro que o motor apontaria ao rodar o fluxo (`errosDoFluxo` de
 * `@pipe/core`), preso ao bloco que o causa. `bloco` é o `id` do estado no
 * editor; `null` quando o erro é do fluxo inteiro (sem raiz, por exemplo).
 */
export interface ErroDoBloco {
  bloco: string | null;
  mensagem: string;
}

export type EstadoDaVersao = 'rascunho' | 'publicada' | 'arquivada';

/** Uma linha de `fluxo_versao`, como o histórico do Builder a lista. */
export interface VersaoDoFluxo {
  id: string;
  versao: number;
  estado: EstadoDaVersao;
  blocos: number;
  publicadaEm: string | null;
  /** Quem publicou, pelo nome — `null` quando a versão nunca foi publicada. */
  publicadaPor: string | null;
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
export interface BuilderDoFluxo {
  fluxoId: string;
  origem: OrigemDoDesenho;
  /** A versão carregada; `null` quando é o fluxo padrão, que ainda não existe no banco. */
  versao: VersaoDoFluxo | null;
  /** A versão que o motor está rodando agora, se houver. */
  publicada: VersaoDoFluxo | null;
  desenho: DesenhoDoBuilder;
  /** O que impediria publicar o desenho carregado. Vazio = publicável. */
  erros: ErroDoBloco[];
  /** Ações que o motor do Pipe ainda não executa, por tipo — publicar é permitido, rodar falha. */
  naoSuportado: Record<string, number>;
}

/** `PUT /v1/gestao/fluxos/:id/builder` e `POST .../versoes/:versao/restaurar`. */
export interface RascunhoGravado {
  versao: VersaoDoFluxo;
  erros: ErroDoBloco[];
  naoSuportado: Record<string, number>;
}

/** `POST /v1/gestao/fluxos/:id/builder/publicar`. */
export interface VersaoPublicada {
  versao: VersaoDoFluxo;
  /** A que saiu do ar para esta entrar, se havia. */
  arquivada: VersaoDoFluxo | null;
}
