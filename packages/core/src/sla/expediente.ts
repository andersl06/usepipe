/**
 * Horário de atendimento — §10 da spec de métricas e `horario_atendimento` /
 * `horario_faixa` / `horario_excecao` do modelo de dados (§4).
 *
 * Expediente por fila, com fuso do tenant e exceções por feriado. Conversa que
 * chega fora do expediente entra na fila com marcação própria e o relógio de SLA
 * só começa a correr na abertura seguinte — senão todo SLA estoura durante a
 * madrugada.
 *
 * Zero dependência: a conversão de fuso usa `Intl.DateTimeFormat`, que já vem no
 * runtime. Nada de biblioteca de data.
 */

export interface FaixaExpediente {
  /** 0 = domingo … 6 = sábado, igual a `Date.prototype.getUTCDay`. */
  diaSemana: number;
  /** `HH:MM` no fuso do tenant. */
  inicio: string;
  /** `HH:MM` no fuso do tenant. `24:00` é meia-noite do dia seguinte. */
  fim: string;
}

export interface ExcecaoExpediente {
  /** `AAAA-MM-DD` no fuso do tenant. */
  data: string;
  fechado: boolean;
  inicio?: string | null;
  fim?: string | null;
  motivo?: string | null;
}

export interface HorarioAtendimento {
  /** Identificador IANA, por exemplo `America/Sao_Paulo`. */
  fuso: string;
  faixas: readonly FaixaExpediente[];
  excecoes?: readonly ExcecaoExpediente[];
}

export interface Intervalo {
  inicio: Date;
  fim: Date;
}

/** Janela em que o relógio fica parado (conversa aguardando o cliente). */
export interface Espera {
  inicio: Date;
  /** `null` = espera ainda aberta. */
  fim: Date | null;
}

const MS_DIA = 86_400_000;
/** Teto de varredura, para horário sem nenhuma faixa não virar laço infinito. */
export const LIMITE_DIAS_VARREDURA = 366;

interface PartesLocais {
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

/** Quebra um instante nas partes de calendário do fuso do tenant. */
export function partesNoFuso(instante: Date, fuso: string): PartesLocais {
  const partes = formatador(fuso).formatToParts(instante);
  const mapa: Record<string, string> = {};
  for (const parte of partes) {
    if (parte.type !== 'literal') mapa[parte.type] = parte.value;
  }
  // Alguns runtimes devolvem "24" para meia-noite com hour12:false.
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
function deslocamentoMs(instante: Date, fuso: string): number {
  const p = partesNoFuso(instante, fuso);
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  // Zera os milissegundos dos dois lados para o deslocamento sair exato.
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

/**
 * Instante absoluto de uma data-hora local do tenant.
 *
 * Duas passadas: a primeira estima o deslocamento, a segunda corrige quando a
 * estimativa caiu do outro lado de uma virada de horário de verão.
 */
export function instanteDeLocal(
  ano: number,
  mes: number,
  dia: number,
  minutosDoDia: number,
  fuso: string,
): Date {
  const alvoUtc = Date.UTC(ano, mes - 1, dia, 0, 0, 0) + minutosDoDia * 60_000;
  const primeira = new Date(alvoUtc - deslocamentoMs(new Date(alvoUtc), fuso));
  const segunda = new Date(alvoUtc - deslocamentoMs(primeira, fuso));
  return segunda;
}

/** `HH:MM` para minutos desde a meia-noite. Aceita `24:00`. */
export function minutosDoRelogio(relogio: string): number {
  const [h, m] = relogio.split(':');
  const horas = Number(h);
  const minutos = Number(m ?? '0');
  if (!Number.isFinite(horas) || !Number.isFinite(minutos)) {
    throw new Error(`Horário inválido: ${relogio}`);
  }
  return horas * 60 + minutos;
}

function chaveDoDia(ano: number, mes: number, dia: number): string {
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
 * Faixas de expediente de um dia do calendário local, em minutos do dia.
 * Exceção do dia manda sobre a faixa semanal — é assim que feriado funciona.
 */
export function faixasDoDia(
  horario: HorarioAtendimento,
  ano: number,
  mes: number,
  dia: number,
): { de: number; ate: number }[] {
  const excecao = horario.excecoes?.find((e) => e.data === chaveDoDia(ano, mes, dia));
  if (excecao) {
    if (excecao.fechado) return [];
    if (excecao.inicio && excecao.fim) {
      return mesclar([{ de: minutosDoRelogio(excecao.inicio), ate: minutosDoRelogio(excecao.fim) }]);
    }
    // Exceção aberta sem horário próprio cai no expediente normal do dia.
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
 * Intervalos de expediente entre dois instantes, já em tempo absoluto.
 * `horario` nulo significa atendimento ininterrupto (24×7).
 */
export function intervalosUteis(
  de: Date,
  ate: Date,
  horario: HorarioAtendimento | null | undefined,
): Intervalo[] {
  if (ate.getTime() <= de.getTime()) return [];
  if (!horario) return [{ inicio: de, fim: ate }];

  const saida: Intervalo[] = [];
  const inicioLocal = partesNoFuso(de, horario.fuso);
  // Começa um dia antes para não perder faixa que já estava correndo.
  let cursor = Date.UTC(inicioLocal.ano, inicioLocal.mes - 1, inicioLocal.dia) - MS_DIA;
  const limite = ate.getTime() + MS_DIA;

  for (let passo = 0; passo <= LIMITE_DIAS_VARREDURA + 2; passo += 1) {
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

/** Remove das faixas o que estiver coberto por uma espera. */
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

export function duracaoTotalSeg(intervalos: readonly Intervalo[]): number {
  return intervalos.reduce(
    (total, intervalo) => total + (intervalo.fim.getTime() - intervalo.inicio.getTime()) / 1000,
    0,
  );
}

/**
 * Segundos úteis entre dois instantes, descontando as esperas.
 * É o "decorrido" do SLA.
 */
export function segundosUteisEntre(
  de: Date,
  ate: Date,
  horario: HorarioAtendimento | null | undefined,
  esperas?: readonly Espera[],
): number {
  return duracaoTotalSeg(subtrairEsperas(intervalosUteis(de, ate, horario), esperas));
}

/**
 * Avança `segundos` de tempo útil a partir de `de`, pulando o que está fora do
 * expediente e o que está em espera.
 *
 * Devolve `null` quando o prazo não cabe em `LIMITE_DIAS_VARREDURA` dias — é o
 * caso de expediente vazio ou de espera aberta sem fim: prazo indefinido é
 * informação, não erro silencioso.
 */
export function avancarNoExpediente(
  de: Date,
  segundos: number,
  horario: HorarioAtendimento | null | undefined,
  esperas?: readonly Espera[],
): Date | null {
  if (segundos <= 0) return de;

  // Janelas crescentes: o caso comum resolve em dois dias e não paga a varredura
  // de um ano inteiro.
  for (const dias of [2, 8, 32, 128, LIMITE_DIAS_VARREDURA]) {
    const limite = new Date(de.getTime() + dias * MS_DIA);
    const disponiveis = subtrairEsperas(intervalosUteis(de, limite, horario), esperas);

    let restante = segundos;
    for (const intervalo of disponiveis) {
      const duracao = (intervalo.fim.getTime() - intervalo.inicio.getTime()) / 1000;
      if (duracao >= restante) {
        return new Date(intervalo.inicio.getTime() + restante * 1000);
      }
      restante -= duracao;
    }
  }
  return null;
}

/**
 * Primeiro instante de expediente a partir de `instante` (ele mesmo, se já
 * estiver dentro). É a "abertura seguinte" da §10.
 */
export function proximaAbertura(
  instante: Date,
  horario: HorarioAtendimento | null | undefined,
): Date | null {
  if (!horario) return instante;
  for (const dias of [2, 8, 32, 128, LIMITE_DIAS_VARREDURA]) {
    const limite = new Date(instante.getTime() + dias * MS_DIA);
    const primeiro = intervalosUteis(instante, limite, horario)[0];
    if (primeiro) return primeiro.inicio;
  }
  return null;
}

/** Está dentro do expediente neste instante? */
export function dentroDoExpediente(
  instante: Date,
  horario: HorarioAtendimento | null | undefined,
): boolean {
  if (!horario) return true;
  const p = partesNoFuso(instante, horario.fuso);
  const minutos = p.hora * 60 + p.minuto + p.segundo / 60;
  return faixasDoDia(horario, p.ano, p.mes, p.dia).some(
    (faixa) => minutos >= faixa.de && minutos < faixa.ate,
  );
}
