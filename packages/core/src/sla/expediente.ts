/**
 * Service hours from metrics spec §10 and data-model §4 tables `horario_atendimento`, `horario_faixa`, and `horario_excecao`. Each queue uses the tenant timezone and holiday exceptions. A conversation arriving outside hours is queued with a marker, but its SLA clock starts at the next opening; otherwise every overnight arrival would breach SLA. Timezone conversion uses runtime `Intl.DateTimeFormat` with no date dependency.
 */

export interface FaixaExpediente {
  /** 0 is Sunday through 6 Saturday, matching `Date.prototype.getUTCDay`. */
  diaSemana: number;
  /** `HH:MM` no fuso do tenant. */
  inicio: string;
  /** `HH:MM` in the tenant timezone; `24:00` means midnight of the next day. */
  fim: string;
}

export interface ExceptionWorkingHours {
  /** `AAAA-MM-DD` no fuso do tenant. */
  data: string;
  fechado: boolean;
  inicio?: string | null;
  fim?: string | null;
  motivo?: string | null;
}

export interface HourAttendance {
  /** Identificador IANA, por exemplo `America/Sao_Paulo`. */
  fuso: string;
  faixas: readonly FaixaExpediente[];
  exceptions?: readonly ExceptionWorkingHours[];
}

export interface Intervalo {
  inicio: Date;
  fim: Date;
}

/** Interval during which the clock is paused while the conversation awaits the customer. */
export interface Espera {
  inicio: Date;
  /** `null` = espera ainda aberta. */
  fim: Date | null;
}

const MS_DIA = 86_400_000;
/** Scan horizon prevents a schedule with no open interval from looping forever. */
export const SWEEP_DAYS_LIMIT = 366;

interface PartsLocal {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
}

const formatadores = new Map<string, Intl.DateTimeFormat>();

function formatador(fuso: string): Intl.DateTimeFormat {
  const existente = formatadores.get(fuso);
  if (existente) return existente;
  const novo = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  formatadores.set(fuso, novo);
  return novo;
}

/** Split an instant into calendar components in the tenant timezone. */
export function partesNoFuso(instante: Date, fuso: string): PartsLocal {
  const partes = formatador(fuso).formatToParts(instante);
  const mapa: Record<string, string> = {};
  for (const parte of partes) {
    if (parte.type !== 'literal') mapa[parte.type] = parte.value;
  }
  // Some runtimes return hour "24" for midnight with `hour12:false`.
  const hora = Number(mapa.hour) % 24;
  return {
    ano: Number(mapa.year),
    mes: Number(mapa.month),
    dia: Number(mapa.day),
    hora,
    minuto: Number(mapa.minute),
    segundo: Number(mapa.second),
  };
}

/** Deslocamento do fuso, em milissegundos, no instante dado. */
function offsetMs(instante: Date, fuso: string): number {
  const p = partesNoFuso(instante, fuso);
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  // Zero milliseconds on both sides so the offset is exact.
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

/**
 * Absolute instant for a tenant-local date and time. Two passes estimate the offset, then correct it if the estimate crossed a daylight-saving transition.
 */
export function instanteDeLocal(
  ano: number,
  mes: number,
  dia: number,
  minutosDoDia: number,
  fuso: string,
): Date {
  const alvoUtc = Date.UTC(ano, mes - 1, dia, 0, 0, 0) + minutosDoDia * 60_000;
  const firstPass = new Date(alvoUtc - offsetMs(new Date(alvoUtc), fuso));
  const segunda = new Date(alvoUtc - offsetMs(firstPass, fuso));
  return segunda;
}

/** Convert `HH:MM` to minutes since midnight; accept `24:00`. */
export function minutosDoRelogio(relogio: string): number {
  const [h, m] = relogio.split(':');
  const horas = Number(h);
  const minutos = Number(m ?? '0');
  if (!Number.isFinite(horas) || !Number.isFinite(minutos)) {
    throw new Error(`Horário inválido: ${relogio}`);
  }
  return horas * 60 + minutos;
}

function dayKey(ano: number, mes: number, dia: number): string {
  const mm = String(mes).padStart(2, '0');
  const dd = String(dia).padStart(2, '0');
  return `${ano}-${mm}-${dd}`;
}

function diaDaSemana(ano: number, mes: number, dia: number): number {
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

function mesclar(faixas: { de: number; ate: number }[]): { de: number; ate: number }[] {
  const ordenadas = [...faixas].filter((f) => f.ate > f.de).sort((a, b) => a.de - b.de);
  const saida: { de: number; ate: number }[] = [];
  for (const faixa of ordenadas) {
    const ultima = saida[saida.length - 1];
    if (ultima && faixa.de <= ultima.ate) {
      ultima.ate = Math.max(ultima.ate, faixa.ate);
    } else {
      saida.push({ ...faixa });
    }
  }
  return saida;
}

/**
 * Business-hour ranges for a local calendar day, in minutes from midnight. A date-specific exception overrides the weekly schedule, enabling holidays.
 */
export function faixasDoDia(
  horario: HourAttendance,
  ano: number,
  mes: number,
  dia: number,
): { de: number; ate: number }[] {
  const exception = horario.exceptions?.find((e) => e.data === dayKey(ano, mes, dia));
  if (exception) {
    if (exception.fechado) return [];
    if (exception.inicio && exception.fim) {
      return mesclar([{ de: minutosDoRelogio(exception.inicio), ate: minutosDoRelogio(exception.fim) }]);
    }
    // An open exception with no custom hours falls back to the normal schedule for that day.
  }
  const semana = diaDaSemana(ano, mes, dia);
  return mesclar(
    horario.faixas
      .filter((faixa) => faixa.diaSemana === semana)
      .map((faixa) => ({ de: minutosDoRelogio(faixa.inicio), ate: minutosDoRelogio(faixa.fim) })),
  );
}

function intersectar(a: Intervalo, de: Date, ate: Date): Intervalo | null {
  const inicio = a.inicio.getTime() > de.getTime() ? a.inicio : de;
  const fim = a.fim.getTime() < ate.getTime() ? a.fim : ate;
  return fim.getTime() > inicio.getTime() ? { inicio, fim } : null;
}

/**
 * Business-hour intervals between two absolute instants. Null `horario` means uninterrupted 24×7 service.
 */
export function intervalosUteis(
  de: Date,
  ate: Date,
  horario: HourAttendance | null | undefined,
): Intervalo[] {
  if (ate.getTime() <= de.getTime()) return [];
  if (!horario) return [{ inicio: de, fim: ate }];

  const saida: Intervalo[] = [];
  const inicioLocal = partesNoFuso(de, horario.fuso);
  // Start one day early so an interval already in progress is not missed.
  let cursor = Date.UTC(inicioLocal.ano, inicioLocal.mes - 1, inicioLocal.dia) - MS_DIA;
  const limite = ate.getTime() + MS_DIA;

  for (let passo = 0; passo <= SWEEP_DAYS_LIMIT + 2; passo += 1) {
    const dataDoDia = new Date(cursor);
    const ano = dataDoDia.getUTCFullYear();
    const mes = dataDoDia.getUTCMonth() + 1;
    const dia = dataDoDia.getUTCDate();

    for (const faixa of faixasDoDia(horario, ano, mes, dia)) {
      const bruto: Intervalo = {
        inicio: instanteDeLocal(ano, mes, dia, faixa.de, horario.fuso),
        fim: instanteDeLocal(ano, mes, dia, faixa.ate, horario.fuso),
      };
      const recorte = intersectar(bruto, de, ate);
      if (recorte) saida.push(recorte);
    }

    cursor += MS_DIA;
    if (cursor > limite) break;
  }

  return saida.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

/** Subtract waiting periods from business-hour intervals. */
export function subtrairEsperas(
  intervalos: readonly Intervalo[],
  esperas: readonly Espera[] | undefined,
): Intervalo[] {
  if (!esperas || esperas.length === 0) return [...intervalos];

  let atual = [...intervalos];
  for (const espera of esperas) {
    const inicioEspera = espera.inicio.getTime();
    const fimEspera = espera.fim ? espera.fim.getTime() : Number.POSITIVE_INFINITY;
    const proximo: Intervalo[] = [];
    for (const intervalo of atual) {
      const de = intervalo.inicio.getTime();
      const ate = intervalo.fim.getTime();
      if (fimEspera <= de || inicioEspera >= ate) {
        proximo.push(intervalo);
        continue;
      }
      if (inicioEspera > de) proximo.push({ inicio: intervalo.inicio, fim: new Date(inicioEspera) });
      if (fimEspera < ate) proximo.push({ inicio: new Date(fimEspera), fim: intervalo.fim });
    }
    atual = proximo;
  }
  return atual.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

export function durationTotalSeg(intervalos: readonly Intervalo[]): number {
  return intervalos.reduce(
    (total, intervalo) => total + (intervalo.fim.getTime() - intervalo.inicio.getTime()) / 1000,
    0,
  );
}

/**
 * Business seconds between two instants excluding waits; the SLA elapsed time.
 */
export function segundosUteisEntre(
  de: Date,
  ate: Date,
  horario: HourAttendance | null | undefined,
  esperas?: readonly Espera[],
): number {
  return durationTotalSeg(subtrairEsperas(intervalosUteis(de, ate, horario), esperas));
}

/**
 * Advance `segundos` business seconds from `de`, skipping off-hours and waits. Return null if the deadline does not fit within `LIMITE_DIAS_VARREDURA` days, including an empty schedule or open-ended wait. An undefined deadline is information, not silent failure.
 */
export function avancarNoExpediente(
  de: Date,
  segundos: number,
  horario: HourAttendance | null | undefined,
  esperas?: readonly Espera[],
): Date | null {
  if (segundos <= 0) return de;

  // Grow search windows gradually: common cases resolve in two days without scanning a full year.
  // de um ano inteiro.
  for (const dias of [2, 8, 32, 128, SWEEP_DAYS_LIMIT]) {
    const limite = new Date(de.getTime() + dias * MS_DIA);
    const disponiveis = subtrairEsperas(intervalosUteis(de, limite, horario), esperas);

    let restante = segundos;
    for (const intervalo of disponiveis) {
      const duration = (intervalo.fim.getTime() - intervalo.inicio.getTime()) / 1000;
      if (duration >= restante) {
        return new Date(intervalo.inicio.getTime() + restante * 1000);
      }
      restante -= duration;
    }
  }
  return null;
}

/**
 * First business instant at or after `instante`, including itself when open; the next opening from §10.
 */
export function proximaAbertura(
  instante: Date,
  horario: HourAttendance | null | undefined,
): Date | null {
  if (!horario) return instante;
  for (const dias of [2, 8, 32, 128, SWEEP_DAYS_LIMIT]) {
    const limite = new Date(instante.getTime() + dias * MS_DIA);
    const firstMatch = intervalosUteis(instante, limite, horario)[0];
    if (firstMatch) return firstMatch.inicio;
  }
  return null;
}


export function dentroDoExpediente(
  instante: Date,
  horario: HourAttendance | null | undefined,
): boolean {
  if (!horario) return true;
  const p = partesNoFuso(instante, horario.fuso);
  const minutos = p.hora * 60 + p.minuto + p.segundo / 60;
  return faixasDoDia(horario, p.ano, p.mes, p.dia).some(
    (faixa) => minutos >= faixa.de && minutos < faixa.ate,
  );
}
