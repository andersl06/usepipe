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

export interface PedidoDeFila {
  nome: string;
  cor?: string | null;
  horarioId?: string | null;
  capacidadePadrao: number;
  ordem?: number;
  ativa?: boolean;
}

/** Só o que veio muda; campo ausente é "não mexa" — igual ao `PATCH` de fluxo. */
export interface PedidoDeEdicaoDeFila {
  nome?: string;
  cor?: string | null;
  horarioId?: string | null;
  capacidadePadrao?: number;
  ordem?: number;
  ativa?: boolean;
}

export interface FilaGravada {
  id: string;
  nome: string;
  cor: string | null;
  horarioId: string | null;
  capacidadePadrao: number;
  ordem: number;
  ativa: boolean;
}

export interface PedidoDeVinculoDeAtendente {
  usuarioId: string;
  capacidadeOverride?: number | null;
}

/* ---------------------------------------------------------- pausas */

export interface PedidoDeMotivoPausa {
  nome: string;
  duracaoSugeridaMin?: number | null;
  contaComoProdutivo?: boolean;
  ativo?: boolean;
}

export interface PedidoDeEdicaoDeMotivoPausa {
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

export interface PedidoDeEdicaoDeRespostaPronta {
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
  ativa: boolean;
}

/* --------------------------------------------------- regras de atendimento */

/** Os quatro operadores de `apps/api/src/dominio/gestao/regra-fila.ts` — duplicado à mão, como o resto deste arquivo. */
export type OperadorDeRegraFila = 'contem' | 'nao_contem' | 'igual' | 'diferente';

export interface CondicaoDeRegraFila {
  campo: string;
  operador: OperadorDeRegraFila;
  valor: string;
}

/** Só o que veio muda; `condicoes`, quando vem, SUBSTITUI todas as anteriores. */
export interface PedidoDeEdicaoDeRegraFila {
  nome?: string;
  ordem?: number;
  combinador?: 'e' | 'ou';
  filaDestinoId?: string;
  condicoes?: CondicaoDeRegraFila[];
}

export interface RegraFilaGravada {
  id: string;
  nome: string;
  ordem: number;
  combinador: 'e' | 'ou';
  filaDestinoId: string;
  ativa: boolean;
  condicoes: CondicaoDeRegraFila[];
}

/* ------------------------------------------------------------------- SLA */

export interface PedidoDeRegraSla {
  nome: string;
  alvo: string;
  prazoSeg: number;
  alertaSeg?: number | null;
  escopoTipo?: string;
  escopoId?: string | null;
  ativa?: boolean;
}

export interface PedidoDeEdicaoDeRegraSla {
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

export interface PedidoDeEdicaoDeFaixa {
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

export interface PedidoDeEdicaoDeExcecao {
  data?: string;
  fechado?: boolean;
  inicio?: string | null;
  fim?: string | null;
  motivo?: string | null;
}

export interface ExcecaoGravada {
  id: string;
  horarioId: string;
  data: string;
  fechado: boolean;
  inicio: string | null;
  fim: string | null;
  motivo: string | null;
}

/* ------------------------------------------------------------ prioridade */

export interface PedidoDeRegraPrioridade {
  nome: string;
  nivel: string;
  escopoTipo?: string;
  escopoId?: string | null;
  condicao?: Record<string, unknown>;
  ativa?: boolean;
}

export interface PedidoDeEdicaoDeRegraPrioridade {
  nome?: string;
  nivel?: string;
  escopoTipo?: string;
  escopoId?: string | null;
  condicao?: Record<string, unknown>;
  ativa?: boolean;
}

export interface RegraPrioridadeGravada {
  id: string;
  nome: string;
  nivel: string;
  escopoTipo: string;
  escopoId: string | null;
  condicao: Record<string, unknown>;
  ativa: boolean;
}
