import type { HorarioCadastrado } from './registrations';

/**
 * Regras puras do formulário de Horários: rascunho, validação e pedido ao servidor. São as mesmas regras que `apps/api/src/domain/management/horarios.ts` aplica; o servidor continua sendo quem decide.
 */

export const NOME_DO_HORARIO_MAX = 100;
export const TITULO_DO_PERIODO_MAX = 100;
export const PERIODO_DIAS_MAX = 90;
export const DESCRICAO_DO_HORARIO_MAX = 300;
/** Segunda a Domingo, na ordem da tela; o número é o dia da semana do servidor (0 = domingo). */
export const DIAS_NA_TELA = [
  { dia: 1, rotulo: 'Segunda-feira' },
  { dia: 2, rotulo: 'Terça-feira' },
  { dia: 3, rotulo: 'Quarta-feira' },
  { dia: 4, rotulo: 'Quinta-feira' },
  { dia: 5, rotulo: 'Sexta-feira' },
  { dia: 6, rotulo: 'Sábado' },
  { dia: 0, rotulo: 'Domingo' },
] as const;

export interface FaixaRascunho {
  start: string;
  end: string;
}

export interface PeriodoRascunho {
  chave: string;
  title: string;
  fullDay: boolean;
  from: string;
  fromTime: string;
  to: string;
  toTime: string;
}

export interface RascunhoDeHorario {
  name: string;
  description: string;
  regular: boolean;
  queueIds: string[];
  faixas: Record<number, FaixaRascunho[]>;
  periods: PeriodoRascunho[];
}

export const FAIXA_PADRAO: FaixaRascunho = { start: '08:00', end: '18:00' };

let contador = 0;
export const novaChave = (): string => `p${(contador += 1)}`;

export function rascunhoDe(horario?: HorarioCadastrado): RascunhoDeHorario {
  const faixas: Record<number, FaixaRascunho[]> = {};
  for (const f of horario?.faixas ?? []) {
    (faixas[f.dayWeek] ??= []).push({ start: f.start, end: f.end });
  }
  return {
    name: horario?.name ?? '',
    description: horario?.description ?? '',
    regular: horario?.regular ?? false,
    queueIds: horario?.queueIds ?? [],
    faixas,
    periods: (horario?.periods ?? []).map((p) => ({ chave: novaChave(), ...p })),
  };
}

const minutos = (hora: string): number => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
const dia = (data: string): number => Math.floor(Date.parse(`${data}T00:00:00Z`) / 86_400_000);
const rotuloDoDia = (d: number): string => DIAS_NA_TELA.find((x) => x.dia === d)?.rotulo ?? 'um dia';

/** Data de hoje (`AAAA-MM-DD`) no fuso do horário, não no do navegador nem no UTC. */
export function hojeNoFuso(agora: Date, fuso: string): string {
  return agora.toLocaleDateString('en-CA', { timeZone: fuso });
}

/** Dias de `from` a `to` contando os dois. */
export function diasDoPeriodo(from: string, to: string): number {
  return dia(to) - dia(from) + 1;
}

/** Chaves `AAAA-MM-DDTHH:MM` de começo e fim; o dia completo termina à meia-noite do dia seguinte. */
function limites(p: PeriodoRascunho): { inicio: string; fim: string } {
  if (!p.fullDay) return { inicio: `${p.from}T${p.fromTime}`, fim: `${p.to}T${p.toTime}` };
  const seguinte = new Date((dia(p.to) + 1) * 86_400_000).toISOString().slice(0, 10);
  return { inicio: `${p.from}T00:00`, fim: `${seguinte}T00:00` };
}

export function erroDoPeriodo(p: PeriodoRascunho): string | null {
  if (!p.from || !p.to) return 'Informe as datas do período.';
  if (p.to < p.from) return 'O fim do período é anterior ao início.';
  if (!p.fullDay && `${p.to}T${p.toTime}` <= `${p.from}T${p.fromTime}`) {
    return 'O fim do período tem de ser depois do início.';
  }
  if (diasDoPeriodo(p.from, p.to) > PERIODO_DIAS_MAX) {
    return `Cada período tem no máximo ${PERIODO_DIAS_MAX} dias.`;
  }
  return null;
}

/** Primeiro problema do rascunho, ou `null` se pode salvar. */
export function erroDoRascunho(r: RascunhoDeHorario): string | null {
  if (!r.name.trim()) return 'Informe o nome do horário.';
  if (r.description.length > DESCRICAO_DO_HORARIO_MAX) {
    return `A descrição tem até ${DESCRICAO_DO_HORARIO_MAX} caracteres.`;
  }
  for (const [d, lista] of Object.entries(r.faixas)) {
    const ordenadas = [...lista].sort((a, b) => minutos(a.start) - minutos(b.start));
    for (const f of ordenadas) {
      if (minutos(f.end) <= minutos(f.start)) {
        return `Em ${rotuloDoDia(Number(d))}, o fim tem de ser depois do início.`;
      }
    }
    for (let i = 1; i < ordenadas.length; i += 1) {
      if (minutos(ordenadas[i]!.start) < minutos(ordenadas[i - 1]!.end)) {
        return `Em ${rotuloDoDia(Number(d))}, há faixas que se sobrepõem.`;
      }
    }
  }
  for (const p of r.periods) {
    const erro = erroDoPeriodo(p);
    if (erro) return erro;
  }
  const porInicio = r.periods.map(limites).sort((a, b) => a.inicio.localeCompare(b.inicio));
  for (let i = 1; i < porInicio.length; i += 1) {
    if (porInicio[i]!.inicio < porInicio[i - 1]!.fim) return 'Há períodos sem atendimento que se sobrepõem.';
  }
  return null;
}

export function pedidoDeHorario(r: RascunhoDeHorario) {
  return {
    name: r.name.trim(),
    description: r.description.trim() || null,
    regular: r.regular,
    queueIds: r.queueIds,
    faixas: Object.entries(r.faixas).flatMap(([d, lista]) =>
      lista.map((f) => ({ dayWeek: Number(d), start: f.start, end: f.end })),
    ),
    periods: r.periods.map((p) => ({
      title: p.title.trim(),
      fullDay: p.fullDay,
      from: p.from,
      fromTime: p.fromTime,
      to: p.to,
      toTime: p.toTime,
    })),
  };
}

/**
 * Texto do alerta de exclusão. Com outro horário regular, as filas vinculadas passam a operar nele (D-H02); sem ele, funcionam 24 horas.
 */
export function avisoDeExclusao(alvo: Pick<HorarioCadastrado, 'id' | 'regular'>, todos: readonly Pick<HorarioCadastrado, 'id' | 'regular'>[]): string {
  const haOutroRegular = todos.some((h) => h.regular && h.id !== alvo.id);
  if (haOutroRegular) {
    return 'Automaticamente, as filas que estão vinculadas a ele passarão a operar no Horário regular, mas elas podem ser vinculadas a outro horário posteriormente.';
  }
  return alvo.regular
    ? 'Este é o Horário regular da operação. Sem ele, as filas que estão vinculadas a ele e as que não têm horário próprio passarão a funcionar 24 horas, até que outro horário seja definido como regular.'
    : 'Não há outro Horário regular definido: as filas que estão vinculadas a ele passarão a funcionar 24 horas, mas elas podem ser vinculadas a outro horário posteriormente.';
}

/** Resumo da programação para o cartão da lista: `Seg a Sex 08:00–18:00`. */
export function resumoDaProgramacao(faixas: HorarioCadastrado['faixas']): string {
  if (faixas.length === 0) return 'Sem programação';
  const curto = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const porDia = DIAS_NA_TELA.map(({ dia: d }) =>
    faixas
      .filter((f) => f.dayWeek === d)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((f) => `${f.start}–${f.end}`)
      .join(', '),
  );
  const grupos: string[] = [];
  let i = 0;
  while (i < DIAS_NA_TELA.length) {
    const texto = porDia[i]!;
    let j = i;
    while (j + 1 < DIAS_NA_TELA.length && porDia[j + 1] === texto) j += 1;
    if (texto) {
      const a = curto[DIAS_NA_TELA[i]!.dia]!;
      const b = curto[DIAS_NA_TELA[j]!.dia]!;
      grupos.push(`${i === j ? a : `${a} a ${b}`} ${texto}`);
    }
    i = j + 1;
  }
  return grupos.join(' · ');
}
