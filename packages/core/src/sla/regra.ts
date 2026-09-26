/**
 * SLA from metrics spec §11. A rule has a target (time to first response, response time, or time to closure), deadline, scope, and two actions: one at warning threshold and another on breach. The clock follows the queue business hours and pauses while the conversation awaits the customer.
 */

import {
  avancarNoExpediente,
  proximaAbertura,
  segundosUteisEntre,
  type Espera,
  type HourAttendance,
} from './expediente.js';

export type AlvoSla = 'primeira_resposta' | 'tempo_resposta' | 'encerramento';
/** The approved SLA contract keeps these literal values in Portuguese. */
export type StateSla = 'dentro' | 'alerta' | 'estourado';
export type ScopeSla = 'fila' | 'prioridade' | 'etiqueta';

export interface RegraSla {
  id: string;
  nome: string;
  alvo: AlvoSla;
  prazoSeg: number;
  /** Limiar de alerta, em segundos decorridos. `null` desliga o alerta. */
  alertaSeg?: number | null;
  scopeType?: ScopeSla;
  scopeId?: string | null;
  active?: boolean;
}

export interface InboundSla {
  regra: Pick<RegraSla, 'prazoSeg' | 'alertaSeg'>;
  /** When the clock became applicable: creation, assignment, or latest inbound customer message. */
  inicio: Date;

  agora: Date;
  /** `null`/ausente = atendimento ininterrupto. */
  horario?: HourAttendance | null;
  /** Periods awaiting the customer pause the clock. */
  esperas?: readonly Espera[];
  /** Quando o alvo foi cumprido (respondeu, encerrou). Congela o decorrido. */
  cumpridoEm?: Date | null;
}

export interface ResultadoSla {
  state: StateSla;
  cumprido: boolean;
  /** Business time already spent, in seconds. */
  decorridoSeg: number;
  /** Time left until deadline, zero after breach. */
  restanteSeg: number;
  /** Instante absoluto do estouro. `null` quando indefinido (ver abaixo). */
  prazoEm: Date | null;
  /** Absolute warning instant; null without a threshold or when undefined. */
  alertaEm: Date | null;
  /** When the clock actually began running: the next opening if arrival was outside business hours. */
  inicioEfetivo: Date | null;
}

/**
 * SLA state and deadline. `prazoEm` is null when breach time is undefined: the schedule has no open interval, the deadline exceeds the scan horizon, or a wait is still open. While awaiting the customer there is no breach date to promise. `estado` still follows elapsed business time, which the UI displays.
 */
export function avaliarSla(inbound: InboundSla): ResultadoSla {
  const { regra, inicio, agora, horario, esperas } = inbound;
  const countEnd = inbound.cumpridoEm ?? agora;

  const decorridoSeg =
    countEnd.getTime() > inicio.getTime()
      ? segundosUteisEntre(inicio, countEnd, horario, esperas)
      : 0;

  const prazoEm = avancarNoExpediente(inicio, regra.prazoSeg, horario, esperas);
  const alertaEm =
    typeof regra.alertaSeg === 'number'
      ? avancarNoExpediente(inicio, regra.alertaSeg, horario, esperas)
      : null;

  let state: StateSla = 'dentro';
  if (decorridoSeg >= regra.prazoSeg) state = 'estourado';
  else if (typeof regra.alertaSeg === 'number' && decorridoSeg >= regra.alertaSeg) state = 'alerta';

  return {
    state,
    cumprido: inbound.cumpridoEm != null,
    decorridoSeg,
    restanteSeg: Math.max(0, regra.prazoSeg - decorridoSeg),
    prazoEm,
    alertaEm,
    inicioEfetivo: proximaAbertura(inicio, horario),
  };
}


export interface MarcosSla {
  criadaEm: Date | null;
  atribuidaEm: Date | null;
  firstResponseIn: Date | null;
  encerradaEm: Date | null;
  /** Most recent unanswered customer message, the start for `tempo_resposta`. */
  aguardandoRespostaDesde?: Date | null;
}

/**
 * Clock start by target: `primeira_resposta` starts at assignment to match §2, or creation when unassigned so a queued conversation still consumes SLA; `tempo_resposta` starts at the latest unanswered customer message; `encerramento` starts at creation.
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


export function targetFulfillment(alvo: AlvoSla, marcos: MarcosSla): Date | null {
  switch (alvo) {
    case 'primeira_resposta':
      return marcos.firstResponseIn;
    case 'encerramento':
      return marcos.encerradaEm;
    case 'tempo_resposta':
      return null;
    default:
      return null;
  }
}
