/**
 * As rotas de GRAVAÇÃO do módulo Atendimento (cadastros) — filas, respostas
 * prontas e pausas personalizadas.
 *
 * A forma é a de `apps/api/src/dominio/gestao/cadastros.ts` e
 * `apps/api/src/dominio/gestao/comunicacao.ts`: se um campo entra ou sai de
 * lá, entra ou sai daqui, e o `tsc` do front acusa. Só as formas de
 * REQUISIÇÃO e de RESPOSTA moram aqui — a leitura (`FilaCadastrada`,
 * `UsoDePausas`, `RespostaProntaListada`) continua duplicada à mão em
 * `apps/gestao-vite/src/lib/*`, como já era antes desta tarefa.
 */

/* ------------------------------------------------------------------- filas */

export interface RequestOfQueue {
  nome: string;
  cor?: string | null;
  horarioId?: string | null;
  capacityDefault: number;
  ordem?: number;
  ativa?: boolean;
}

/** Só o que veio muda; campo ausente é "não mexa" — igual ao `PATCH` de fluxo. */
export interface RequestOfEditOfQueue {
  nome?: string;
  cor?: string | null;
  horarioId?: string | null;
  capacidadePadrao?: number;
  ordem?: number;
  ativa?: boolean;
}

export interface QueueWritten {
  id: string;
  nome: string;
  cor: string | null;
  horarioId: string | null;
  capacidadePadrao: number;
  ordem: number;
  ativa: boolean;
}

export interface RequestOfLinkOfAgent {
  userId: string;
  capacityOverride?: number | null;
}

/* ---------------------------------------------------------- pausas */

export interface PedidoDeMotivoPausa {
  nome: string;
  durationSuggestedMin?: number | null;
  countsAsProductive?: boolean;
  ativo?: boolean;
}

export interface RequestOfEditOfReasonPause {
  nome?: string;
  duracaoSugeridaMin?: number | null;
  contaComoProdutivo?: boolean;
  ativo?: boolean;
}

export interface MotivoPausaGravado {
  id: string;
  nome: string;
  duracaoSugeridaMin: number | null;
  contaComoProdutivo: boolean;
  ativo: boolean;
}

/** `maxlength 30` do `<input>` de "Nome da pausa" — `FICHA-personalizedbreaks.md` §3. */
export const NOME_DA_PAUSA_MAX = 30;

/* ------------------------------------------------------- respostas prontas */

export interface PedidoDeRespostaPronta {
  atalho: string;
  titulo: string;
  corpo: string;
  categoria?: string | null;
  ativa?: boolean;
}

export interface RequestOfEditOfResponseReady {
  atalho?: string;
  titulo?: string;
  corpo?: string;
  categoria?: string | null;
  ativa?: boolean;
}

export interface RespostaProntaGravada {
  id: string;
  atalho: string;
  titulo: string;
  corpo: string;
  categoria: string | null;
  active: boolean;
}

/* --------------------------------------------------- regras de atendimento */

/** Os quatro operadores de `apps/api/src/dominio/gestao/regra-fila.ts` — duplicado à mão, como o resto deste arquivo. */
export type OperatorOfRuleQueue = 'contem' | 'nao_contem' | 'igual' | 'diferente';

export interface ConditionOfRuleQueue {
  campo: string;
  operador: OperatorOfRuleQueue;
  value: string;
}

/** Só o que veio muda; `condicoes`, quando vem, SUBSTITUI todas as anteriores. */
export interface RequestOfEditOfRuleQueue {
  nome?: string;
  order?: number;
  combinador?: 'e' | 'ou';
  queueDestinationId?: string;
  conditions?: ConditionOfRuleQueue[];
}

export interface RuleQueueWritten {
  id: string;
  nome: string;
  ordem: number;
  combinador: 'e' | 'ou';
  filaDestinoId: string;
  ativa: boolean;
  condicoes: ConditionOfRuleQueue[];
}

/* ------------------------------------------------------------------- SLA */

export interface PedidoDeRegraSla {
  nome: string;
  alvo: string;
  prazoSeg: number;
  alertaSeg?: number | null;
  scopeType?: string;
  scopeId?: string | null;
  ativa?: boolean;
}

export interface RequestOfEditOfRuleSla {
  nome?: string;
  alvo?: string;
  prazoSeg?: number;
  alertaSeg?: number | null;
  escopoTipo?: string;
  escopoId?: string | null;
  ativa?: boolean;
}

export interface RegraSlaGravada {
  id: string;
  nome: string;
  alvo: string;
  prazoSeg: number;
  alertaSeg: number | null;
  escopoTipo: string;
  escopoId: string | null;
  ativa: boolean;
}

/* --------------------------------------------------------------- horários */

export interface RequestOfEditOfRange {
  diaSemana?: number;
  inicio?: string;
  fim?: string;
}

export interface FaixaGravada {
  id: string;
  horarioId: string;
  diaSemana: number;
  inicio: string;
  fim: string;
}

export interface RequestOfEditOfException {
  data?: string;
  fechado?: boolean;
  inicio?: string | null;
  fim?: string | null;
  motivo?: string | null;
}

export interface ExceptionWritten {
  id: string;
  horarioId: string;
  data: string;
  fechado: boolean;
  inicio: string | null;
  fim: string | null;
  motivo: string | null;
}

/* ------------------------------------------------------------ prioridade */

export interface RequestOfRulePriority {
  nome: string;
  nivel: string;
  escopoTipo?: string;
  escopoId?: string | null;
  condition?: Record<string, unknown>;
  ativa?: boolean;
}

export interface RequestOfEditOfRulePriority {
  nome?: string;
  nivel?: string;
  escopoTipo?: string;
  escopoId?: string | null;
  condicao?: Record<string, unknown>;
  ativa?: boolean;
}

export interface RulePriorityWritten {
  id: string;
  nome: string;
  nivel: string;
  escopoTipo: string;
  escopoId: string | null;
  condicao: Record<string, unknown>;
  ativa: boolean;
}
