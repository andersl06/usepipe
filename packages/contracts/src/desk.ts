/**
 * As telas do DESK: o que `GET /v1/desk/…` responde e o front desenha.
 *
 * Data é TEXTO (ISO 8601): é assim que atravessa o JSON. Quem mostra converte
 * com `new Date(...)` na ponta — nunca no contrato. Foi a única mudança de
 * forma na migração do Desk em Next: lá as consultas devolviam `Date` porque
 * a página e o banco viviam no mesmo processo.
 *
 * A forma é a das consultas em `apps/api/src/dominio/desk/*.ts`; se uma coluna
 * entra ou sai de lá, entra ou sai daqui, e o `tsc` do front acusa.
 */

export type StateConversation = 'na_fila' | 'atribuida' | 'em_atendimento' | 'em_espera' | 'encerrada';
/**
 * A régua de prioridade é a de `@pipe/core/conversa` (`NIVEIS_PRIORIDADE`),
 * escrita aqui por extenso porque o contrato não importa pacote nenhum. Os
 * cinco literais são os mesmos, e o `tsc` do front acusa se um deles divergir
 * ao indexar `ROTULOS_PRIORIDADE` com este tipo.
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
  /** Nulo é conversa que o atendente ainda não respondeu — é a ficha "Sem resposta". */
  primeiraRespostaEm: string | null;
  ultimaMensagemEm: string | null;
  lastMessageFrom: string | null;
  janelaExpiraEm: string | null;
  /** Desde quando está em espera — o cronômetro da ficha 'Em espera' do cartão. */
  emEsperaDesde: string | null;
  contatoNome: string | null;
  contatoTelefone: string | null;
  filaNome: string | null;
  canalTipo: TypeChannelDatabase;
  lastMessage: string | null;
  lastMessageType: string | null;
  /**
   * As marcações DESTE atendente (`marcacao_conversa`, migração 0041): fixada no
   * topo da lista e marcada à mão como não lida. Nulo é "não marcada". São do
   * atendente, não da conversa — o colega que recebe a transferência não as vê.
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
 * O que `GET /v1/desk/fila` devolve: a fila do atendente e os catálogos que a
 * coluna precisa para desenhar — status, motivos de pausa, etiquetas, colegas
 * e respostas prontas. Tudo numa ida só, na mesma transação, como a página em
 * Next fazia; a busca, a ficha, a ordem e o recorte por fila continuam sendo
 * do navegador (`lib/ordem.ts`), porque são regras puras sobre a lista inteira.
 */
export interface QueueOfDesk {
  conversations: ConversationOfList[];
  /** "Clientes aguardando": conversas na fila, nas filas do atendente. O botão "Atender" puxa a mais antiga. */
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
  contactAtributos: Record<string, unknown>;
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
   * Os nomes das variáveis NA ORDEM das posições `{{1}}`, `{{2}}`, … Sem
   * isto a tela não tem como resolver o corpo.
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
}

/** A conversa aberta e tudo o que a coluna do meio e o painel do contato mostram dela. */
export interface ConversationOfDesk {
  conversation: ConversationOpen;
  itens: ItemOfConversation[];
  templates: TemplateAprovado[];
  conversationTags: LabelOfConversation[];
  /**
   * As etiquetas do CONTATO (`contato_etiqueta`), que o painel "Dados do
   * Contato" mostra e edita. Separadas das da conversa porque são de escopos
   * diferentes (`etiqueta.escopo`) e não se herdam.
   */
  contactTags: LabelOfConversation[];
  history: ConversationOfHistory[];
}

/**
 * `GET /v1/desk/conversas/:id`. `aberta` é `null` quando a conversa não é do
 * atendente (ou não existe) — resposta 200, e não 404, porque a tela tem o que
 * fazer nesse caso: volta para a fila sem conversa aberta, como a página em
 * Next fazia, sem passar pelo caminho de erro do cache.
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
  /** Quem atendeu. Nulo é atendimento que nunca saiu do robô. */
  agentName: string | null;
  agentEmail: string | null;
  /** Quem encerrou. Nulo com `encerradaEm` preenchido é fim automático. */
  closedByName: string | null;
}

/**
 * `GET /v1/desk/tickets/:id` — o atendimento antigo, em leitura. 404 quando
 * não existe (ou é de outro cliente: a RLS não o enxerga).
 *
 * O `status` vai junto porque o trilho o mostra em toda tela, e uma ida só à
 * `api` por tela é a régua.
 */
export interface TicketDoDesk {
  ticket: TicketAntigo;
  itens: ItemOfConversation[];
  etiquetas: LabelOfConversation[];
  status: StatusOfAgent;
}

/* ------------------------------------------------------------ métricas */

export interface CountOfSituation {
  abertos: number;
  fechados: number;
  finalizados: number;
  abandonados: number;
  /** `null` é "o domínio ainda não guarda isto", e não zero. */
  transferidos: number | null;
  perdidos: number | null;
}

export interface TemposMedios {
  /** Da chegada até a primeira palavra do atendente, em segundos. */
  firstResponseSeg: number | null;
  /** Da abertura até cair no colo de alguém, em segundos. */
  waitInQueueSeg: number | null;
  /** Fila mais o tempo que a conversa passou em espera, em segundos. */
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
 * `GET /v1/desk/metricas?inicio=&fim=` (ISO 8601). O recorte é calculado no
 * navegador (`lib/periodo.ts`), no relógio de quem olha — como a página em
 * Next fazia no relógio do servidor —, e a `api` só o aplica.
 *
 * O `status` vai junto porque o trilho o mostra em toda tela, e uma ida só à
 * `api` por tela é a régua.
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
  /** Link para a FICHA daquele cliente no CRM. Nunca a home. */
  link: string;
}
