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

export type EstadoConversa = 'na_fila' | 'atribuida' | 'em_atendimento' | 'em_espera' | 'encerrada';
/**
 * A régua de prioridade é a de `@pipe/core/conversa` (`NIVEIS_PRIORIDADE`),
 * escrita aqui por extenso porque o contrato não importa pacote nenhum. Os
 * cinco literais são os mesmos, e o `tsc` do front acusa se um deles divergir
 * ao indexar `ROTULOS_PRIORIDADE` com este tipo.
 */
export type PrioridadeDoDesk = 'maxima' | 'alta' | 'media' | 'baixa' | 'sem_prioridade';
export type TipoCanalBanco = 'whatsapp_cloud' | 'instagram' | 'email' | 'widget';
export type EstadoAtendente = 'online' | 'pausa' | 'invisivel' | 'offline';

/* ------------------------------------------------------------ a fila */

export interface ConversaDaLista {
  id: string;
  estado: EstadoConversa;
  prioridade: PrioridadeDoDesk;
  criadaEm: string;
  /** Nulo é conversa que o atendente ainda não respondeu — é a ficha "Sem resposta". */
  primeiraRespostaEm: string | null;
  ultimaMensagemEm: string | null;
  ultimaMensagemDe: string | null;
  janelaExpiraEm: string | null;
  /** Desde quando está em espera — o cronômetro da ficha 'Em espera' do cartão. */
  emEsperaDesde: string | null;
  contatoNome: string | null;
  contatoTelefone: string | null;
  filaNome: string | null;
  canalTipo: TipoCanalBanco;
  ultimaMensagem: string | null;
  ultimaMensagemTipo: string | null;
}

export interface StatusDoAtendente {
  estado: EstadoAtendente;
  desde: string;
  motivoPausa: string | null;
}

export interface MotivoDePausa {
  id: string;
  nome: string;
  duracaoSugeridaMin: number | null;
}

export interface EtiquetaDoDesk {
  id: string;
  nome: string;
  cor: string | null;
  obrigatoriaNoEncerramento: boolean;
}

export interface Colega {
  id: string;
  nome: string;
}

export interface RespostaProntaDoDesk {
  id: string;
  escopo: 'empresa' | 'pessoal';
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
export interface FilaDoDesk {
  conversas: ConversaDaLista[];
  /** "Clientes aguardando": conversas na fila, nas filas do atendente. O botão "Atender" puxa a mais antiga. */
  aguardando: number;
  status: StatusDoAtendente;
  motivos: MotivoDePausa[];
  etiquetas: EtiquetaDoDesk[];
  colegas: Colega[];
  respostas: RespostaProntaDoDesk[];
}

/* ------------------------------------------------------- a conversa */

export interface ConversaAberta {
  id: string;
  estado: EstadoConversa;
  prioridade: PrioridadeDoDesk;
  criadaEm: string;
  primeiraRespostaEm: string | null;
  emEsperaDesde: string | null;
  janelaExpiraEm: string | null;
  filaNome: string | null;
  canalId: string;
  canalTipo: TipoCanalBanco;
  contatoId: string;
  contatoNome: string | null;
  contatoTelefone: string | null;
  contatoEmail: string | null;
  contatoDocumento: string | null;
  contatoAtributos: Record<string, unknown>;
  resumo: string | null;
  resumoEm: string | null;
  resumoModelo: string | null;
}

export type ItemDaConversa =
  | {
      genero: 'mensagem';
      id: string;
      criadaEm: string;
      direcao: 'entrada' | 'saida';
      tipo: string;
      conteudo: string | null;
      estadoEntrega: string | null;
      erroCodigo: string | null;
      erroTexto: string | null;
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
  variaveis: unknown;
}

export interface EtiquetaDaConversa {
  id: string;
  nome: string;
}

export interface ConversaDoHistorico {
  id: string;
  criadaEm: string;
  encerradaEm: string | null;
  estado: EstadoConversa;
  filaNome: string | null;
}

/** A conversa aberta e tudo o que a coluna do meio e o painel do contato mostram dela. */
export interface ConversaDoDesk {
  conversa: ConversaAberta;
  itens: ItemDaConversa[];
  templates: TemplateAprovado[];
  etiquetasDaConversa: EtiquetaDaConversa[];
  historico: ConversaDoHistorico[];
}

/**
 * `GET /v1/desk/conversas/:id`. `aberta` é `null` quando a conversa não é do
 * atendente (ou não existe) — resposta 200, e não 404, porque a tela tem o que
 * fazer nesse caso: volta para a fila sem conversa aberta, como a página em
 * Next fazia, sem passar pelo caminho de erro do cache.
 */
export interface RespostaDaConversa {
  aberta: ConversaDoDesk | null;
}

/* ------------------------------------------------------ o ticket antigo */

export interface TicketAntigo {
  id: string;
  estado: EstadoConversa;
  prioridade: PrioridadeDoDesk;
  criadaEm: string;
  primeiraRespostaEm: string | null;
  ultimaMensagemEm: string | null;
  encerradaEm: string | null;
  motivoEncerramento: string | null;
  pausadoSeg: number;
  filaNome: string | null;
  canalTipo: TipoCanalBanco;
  contatoId: string;
  contatoNome: string | null;
  contatoTelefone: string | null;
  /** Quem atendeu. Nulo é atendimento que nunca saiu do robô. */
  atendenteNome: string | null;
  atendenteEmail: string | null;
  /** Quem encerrou. Nulo com `encerradaEm` preenchido é fim automático. */
  encerradaPorNome: string | null;
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
  itens: ItemDaConversa[];
  etiquetas: EtiquetaDaConversa[];
  status: StatusDoAtendente;
}

/* ------------------------------------------------------------ métricas */

export interface ContagemDeSituacao {
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
  primeiraRespostaSeg: number | null;
  /** Da abertura até cair no colo de alguém, em segundos. */
  esperaNaFilaSeg: number | null;
  /** Fila mais o tempo que a conversa passou em espera, em segundos. */
  esperaTotalSeg: number | null;
}

export interface DiaDaSerie {
  dia: string;
  abertos: number;
  fechados: number;
}

export interface MetricasDoAtendente {
  situacoes: ContagemDeSituacao;
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
export interface RespostaDasMetricas {
  metricas: MetricasDoAtendente;
  status: StatusDoAtendente;
}

/** O que o CRM sabe do contato, no painel. `null` some da tela. */
export interface FichaDoCrm {
  nome: string;
  email: string | null;
  empresa: string | null;
  /** Link para a FICHA daquele cliente no CRM. Nunca a home. */
  link: string;
}
