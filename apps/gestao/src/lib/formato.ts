import type { ResultadoMetrica } from '@pipe/core';

/** Duração em `mm:ss`, ou `hh:mm:ss` quando passa de uma hora. Nulo vira travessão. */
export function duracao(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined || Number.isNaN(segundos)) return '—';
  const total = Math.max(0, Math.round(segundos));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dois = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${dois(m)}:${dois(s)}` : `${dois(m)}:${dois(s)}`;
}

/** Duração longa, para relatório: `4h 12min`. */
export function duracaoLonga(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined) return '—';
  const total = Math.max(0, Math.round(segundos));
  const h = Math.floor(total / 3600);
  const m = Math.round((total % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min`;
}

export function numero(valor: number | null | undefined, casas = 0): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

export function percentual(fracao: number | null | undefined): string {
  if (fracao === null || fracao === undefined) return '—';
  return `${(fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
}

/**
 * O denominador da métrica, em texto — "289 de 312 · 23 sem resposta".
 *
 * É a decisão central da spec de métricas (§2): média que esconde o próprio
 * denominador não entra neste produto, porque o número melhora justamente quando
 * o atendimento piora.
 */
export function denominador(r: ResultadoMetrica, rotuloExcluidas = 'sem resposta'): string {
  const total = r.populacao + r.excluidas;
  const base = `${numero(r.populacao)} de ${numero(total)}`;
  return r.excluidas > 0 ? `${base} · ${numero(r.excluidas)} ${rotuloExcluidas}` : base;
}

export function dataHora(instante: Date | null | undefined, fuso: string): string {
  if (!instante) return '—';
  return instante.toLocaleString('pt-BR', {
    timeZone: fuso,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function dataIso(instante: Date, fuso: string): string {
  // `en-CA` devolve `AAAA-MM-DD`, que é o formato aceito por `<input type="date">`.
  return instante.toLocaleDateString('en-CA', { timeZone: fuso });
}

/**
 * 0 = domingo, como o `extract(dow)` do Postgres e o `getUTCDay` do core.
 *
 * Mora aqui, e não em `cadastros.ts`, porque o formulário de horário é
 * componente de cliente: importar valor de `cadastros.ts` arrastaria o drizzle
 * e o pool do Postgres para o pacote do navegador.
 */
export const DIAS_DA_SEMANA = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const;

/** `HH:MM:SS`, que é como o tipo `time` do Postgres volta, vira `HH:MM`. */
export function relogio(valor: string): string {
  return valor.slice(0, 5);
}
