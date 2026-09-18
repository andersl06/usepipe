import type { OperadorDeRegra, RegraDeFila } from './regra-fila';

/**
 * Leitura das três telas de cadastro: filas, motivos de pausa e horários.
 *
 * Diferente de `configuracoes.ts`, que é o retrato somente-leitura do tenant,
 * aqui a leitura existe para alimentar um formulário que escreve. O limite que
 * este comentário registrava — "cadastra-se, mas não se edita nem se apaga,
 * porque a auditoria não existe" — caiu: `registrarAuditoria` do `@pipe/db`
 * grava autor, valor anterior e horário na MESMA transação da mudança, e é isso
 * que destrava o interruptor da regra de entrada aqui embaixo.
 *
 * Nada neste arquivo sabe que o Next existe: sem `revalidatePath`, sem JSX. A
 * consulta recebe parâmetro e devolve dado, para virar endpoint da `apps/api`
 * por movimentação e não por reescrita (README, "Quem fala com o banco").
 *
 * Toda consulta abaixo roda EM SÉRIE dentro de um único `comTenant`. Nada de
 * `Promise.all` aqui: consulta paralela na mesma conexão apaga o
 * `set_config('pipe.tenant_id')` da transação e a RLS passa a não filtrar nada
 * (README, "Como o isolamento entre clientes funciona").
 */

// ------------------------------------------------------------------- filas

export interface AtendenteDaFila {
  id: string;
  nome: string;
  estado: string | null;
  /** `fila_atendente.capacidade_override` ou a capacidade padrão da fila. */
  capacidade: number;
  /** O atendente tem limite próprio, diferente do padrão da fila. */
  temOverride: boolean;
}

export interface FilaCadastrada {
  id: string;
  nome: string;
  cor: string | null;
  capacidadePadrao: number;
  ordem: number;
  ativa: boolean;
  horarioId: string | null;
  horarioNome: string | null;
  atendentes: AtendenteDaFila[];
}

export interface HorarioParaEscolher {
  id: string;
  nome: string;
}

// ------------------------------------------------------------------ pausas

export interface MotivoDePausa {
  id: string;
  nome: string;
  duracaoSugeridaMin: number | null;
  contaComoProdutivo: boolean;
  ativo: boolean;
  /** Pausas encerradas no período. */
  pausas: number;
  /** Duração média observada, em segundos. `null` quando ninguém usou. */
  mediaSeg: number | null;
}

export interface UsoDePausas {
  motivos: MotivoDePausa[];
  /** Início da janela de observação. */
  desde: string;
  dias: number;
  /** Pausas encerradas no período cujo motivo foi apagado ou nunca informado. */
  semMotivo: number;
  /** Pausas em aberto agora — fora da média, porque ainda não terminaram. */
  abertas: number;
}

// ---------------------------------------------------------------- horários

export interface FaixaDoHorario {
  id: string;
  diaSemana: number;
  inicio: string;
  fim: string;
}

export interface ExcecaoDoHorario {
  id: string;
  data: string;
  fechado: boolean;
  inicio: string | null;
  fim: string | null;
  motivo: string | null;
}

export interface HorarioCadastrado {
  id: string;
  nome: string;
  fuso: string;
  faixas: FaixaDoHorario[];
  excecoes: ExcecaoDoHorario[];
  /** Nomes das filas que apontam para este horário. Vazio = horário sem uso. */
  filas: string[];
  abertoAgora: boolean;
  /** `null` = nenhuma abertura no horizonte do core — horário sem faixa nenhuma. */
  proximaAberturaEm: string | null;
  /** Expediente dos próximos sete dias, com feriado já descontado. */
  seteDiasSeg: number;
}

export interface Horarios {
  horarios: HorarioCadastrado[];
  /** Filas ativas sem horário: nelas o relógio do SLA corre 24×7. */
  filasSemHorario: string[];
  agora: string;
}

// ------------------------------------------------------- regras de entrada

/**
 * As regras de entrada, com as condições de cada uma — §8 da spec de métricas.
 *
 * Ordenadas por `ordem` e depois por id, que é a MESMA ordem que
 * `ordenarRegras` de `regra-fila.ts` aplica: a tela não pode listar numa ordem
 * e o motor avaliar noutra, senão o gestor testa a regra pela lista e conclui
 * que o produto está quebrado.
 *
 * As filas vêm juntas porque o formulário precisa delas, e porque a tela avisa
 * quando a regra aponta para uma fila desativada — regra que manda conversa
 * para fila desativada é regra que engole conversa.
 */
export interface FilaParaEscolher {
  id: string;
  nome: string;
  ativa: boolean;
}

/** A regra do banco carrega uma coisa a mais que o motor: se a fila de destino está de pé. */
export interface RegraDeFilaCadastrada extends RegraDeFila {
  filaDestinoAtiva: boolean;
}

/**
 * Escrita da regra de entrada.
 *
 * Mora aqui, e não na Server Action, porque **front é front e banco é da
 * `api`** (README, "Quem fala com o banco — a fronteira"): esta função recebe
 * parâmetro e devolve dado, sem `revalidatePath`, sem JSX, sem saber que o Next
 * existe. Quando a `apps/api` virar a única porta do Postgres, ela é MOVIDA, não
 * reescrita.
 *
 * A auditoria é gravada na MESMA transação (`registrarAuditoria` do `@pipe/db`):
 * log em transação separada some quando a mudança falha e sobra quando ela é
 * desfeita, e nos dois casos passa a mentir.
 */
export interface NovaRegraDeFila {
  nome: string;
  ordem: number;
  combinador: 'e' | 'ou';
  filaDestinoId: string;
  condicoes: readonly { campo: string; operador: OperadorDeRegra; valor: string }[];
}

export type Gravacao = { ok: true } | { ok: false; erro: string };

// ------------------------------------------------------- gestão de atendentes

export interface AtendenteCadastrado {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  /** `null` quando a pessoa nunca conectou: não é "offline", é "nunca esteve". */
  estado: string | null;
  filas: string[];
  /**
   * Teto de conversas simultâneas. `null` quando a pessoa não está em fila
   * nenhuma — aí não há teto porque não há de onde receber.
   */
  limiteSimultaneo: number | null;
}
