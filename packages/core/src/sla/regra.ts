/**
 * SLA — §11 da spec de métricas.
 *
 * Uma regra de SLA tem alvo (tempo até 1ª resposta, tempo de resposta, ou tempo
 * até encerramento), prazo, escopo e duas ações: uma no limiar de alerta, outra
 * no estouro. O relógio respeita o horário de atendimento da fila e **pausa**
 * enquanto a conversa aguarda o cliente.
 */

import {
  avancarNoExpediente,
  proximaAbertura,
  segundosUteisEntre,
  type Espera,
  type HorarioAtendimento,
} from './expediente.js';

export type AlvoSla = 'primeira_resposta' | 'tempo_resposta' | 'encerramento';
export type EstadoSla = 'dentro' | 'alerta' | 'estourado';
export type EscopoSla = 'fila' | 'prioridade' | 'etiqueta';

export interface RegraSla {
  id: string;
  nome: string;
  alvo: AlvoSla;
  prazoSeg: number;
  /** Limiar de alerta, em segundos decorridos. `null` desliga o alerta. */
  alertaSeg?: number | null;
  escopoTipo?: EscopoSla;
  escopoId?: string | null;
  ativa?: boolean;
}

export interface EntradaSla {
  regra: Pick<RegraSla, 'prazoSeg' | 'alertaSeg'>;
  /** Quando o relógio começou a valer (criação, atribuição ou última entrada do cliente). */
  inicio: Date;
  /** Instante da avaliação. */
  agora: Date;
  /** `null`/ausente = atendimento ininterrupto. */
  horario?: HorarioAtendimento | null;
  /** Períodos em que a conversa aguardava o cliente. Pausam o relógio. */
  esperas?: readonly Espera[];
  /** Quando o alvo foi cumprido (respondeu, encerrou). Congela o decorrido. */
  cumpridoEm?: Date | null;
}

export interface ResultadoSla {
  estado: EstadoSla;
  cumprido: boolean;
  /** Tempo útil já gasto, em segundos. */
  decorridoSeg: number;
  /** Quanto ainda cabe no prazo. Zero quando estourou. */
  restanteSeg: number;
  /** Instante absoluto do estouro. `null` quando indefinido (ver abaixo). */
  prazoEm: Date | null;
  /** Instante absoluto do alerta. `null` sem limiar de alerta ou quando indefinido. */
  alertaEm: Date | null;
  /** Quando o relógio de fato começou a correr — a abertura seguinte, se chegou fora do expediente. */
  inicioEfetivo: Date | null;
}

/**
 * Estado e prazo de um SLA.
 *
 * `prazoEm` sai `null` quando o instante do estouro é indefinido: expediente sem
 * nenhuma faixa, prazo além do horizonte de varredura, ou espera ainda aberta —
 * enquanto a conversa aguarda o cliente, não há data de estouro a prometer. O
 * `estado` continua sendo calculado pelo decorrido, que é o que a tela mostra.
 */
export function avaliarSla(entrada: EntradaSla): ResultadoSla {
  const { regra, inicio, agora, horario, esperas } = entrada;
  const fimDaContagem = entrada.cumpridoEm ?? agora;

  const decorridoSeg =
    fimDaContagem.getTime() > inicio.getTime()
      ? segundosUteisEntre(inicio, fimDaContagem, horario, esperas)
      : 0;

  const prazoEm = avancarNoExpediente(inicio, regra.prazoSeg, horario, esperas);
  const alertaEm =
    typeof regra.alertaSeg === 'number'
      ? avancarNoExpediente(inicio, regra.alertaSeg, horario, esperas)
      : null;

  let estado: EstadoSla = 'dentro';
  if (decorridoSeg >= regra.prazoSeg) estado = 'estourado';
  else if (typeof regra.alertaSeg === 'number' && decorridoSeg >= regra.alertaSeg) estado = 'alerta';

  return {
    estado,
    cumprido: entrada.cumpridoEm != null,
    decorridoSeg,
    restanteSeg: Math.max(0, regra.prazoSeg - decorridoSeg),
    prazoEm,
    alertaEm,
    inicioEfetivo: proximaAbertura(inicio, horario),
  };
}

/** Marcos mínimos para escolher o início do relógio conforme o alvo. */
export interface MarcosSla {
  criadaEm: Date | null;
  atribuidaEm: Date | null;
  primeiraRespostaEm: Date | null;
  encerradaEm: Date | null;
  /** Última mensagem do cliente ainda sem resposta — início do alvo `tempo_resposta`. */
  aguardandoRespostaDesde?: Date | null;
}

/**
 * De onde o relógio parte, por alvo.
 *
 * - `primeira_resposta`: da atribuição, para bater com a métrica de §2; sem
 *   atribuição, da criação — conversa parada na fila também consome SLA.
 * - `tempo_resposta`: da última mensagem do cliente ainda sem resposta.
 * - `encerramento`: da criação.
 */
export function inicioDoAlvo(alvo: AlvoSla, marcos: MarcosSla): Date | null {
  switch (alvo) {
    case 'primeira_resposta':
      return marcos.atribuidaEm ?? marcos.criadaEm;
    case 'tempo_resposta':
      return marcos.aguardandoRespostaDesde ?? null;
    case 'encerramento':
      return marcos.criadaEm;
    default:
      return null;
  }
}

/** Quando o alvo é considerado cumprido. */
export function cumprimentoDoAlvo(alvo: AlvoSla, marcos: MarcosSla): Date | null {
  switch (alvo) {
    case 'primeira_resposta':
      return marcos.primeiraRespostaEm;
    case 'encerramento':
      return marcos.encerradaEm;
    case 'tempo_resposta':
      return null;
    default:
      return null;
  }
}
