/**
 * `Minhas métricas` periods mirror the reference's five shortcuts plus a custom range capped at 90 days (`referencias-blip/pesquisa/blip-desk-analytics.md`, `.seg` in `~/desk-clone/clone/index.html#metrics`): `Hoje` (default), `Ontem`, `7 Dias`, `30 dias`, `90 dias`, `Personalizado`. Compute dates in the viewer's clock; the `api` only applies the resulting interval.
 */
export type Atalho = 'hoje' | 'ontem' | '7-dias' | '30-dias' | '90-dias' | 'personalizado';

export const ATALHOS: { id: Atalho; rotulo: string }[] = [
  { id: 'personalizado', rotulo: 'Personalizado' },
  { id: 'hoje', rotulo: 'Hoje' },
  { id: 'ontem', rotulo: 'Ontem' },
  { id: '7-dias', rotulo: '7 Dias' },
  { id: '30-dias', rotulo: '30 dias' },
  { id: '90-dias', rotulo: '90 dias' },
];

/** O teto do intervalo personalizado, em dias. */
export const TETO_DE_DIAS = 90;

export interface Intervalo {
  inicio: Date;
  fim: Date;
}

function inicioDoDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fimDoDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function intervaloDoAtalho(
  atalho: Exclude<Atalho, 'personalizado'>,
  agora: Date,
): Intervalo {
  const hoje = inicioDoDia(agora);
  switch (atalho) {
    case 'hoje':
      return { inicio: hoje, fim: agora };
    case 'ontem': {
      const ontem = new Date(hoje);
      ontem.setDate(ontem.getDate() - 1);
      return { inicio: ontem, fim: fimDoDia(ontem) };
    }
    case '7-dias':
      return { inicio: diasAtras(hoje, 6), fim: agora };
    case '30-dias':
      return { inicio: diasAtras(hoje, 29), fim: agora };
    case '90-dias':
      return { inicio: diasAtras(hoje, 89), fim: agora };
  }
}

function diasAtras(dia: Date, n: number): Date {
  const x = new Date(dia);
  x.setDate(x.getDate() - n);
  return x;
}

/**
 * Custom range starts at the beginning of the first day and ends at the end of the last. Swap reversed dates; if longer than the cap, move the start forward to fit.
 */
export function intervaloPersonalizado(de: Date, ate: Date): Intervalo {
  let inicio = inicioDoDia(de);
  let fim = fimDoDia(ate);
  if (inicio > fim) [inicio, fim] = [inicioDoDia(ate), fimDoDia(de)];
  const teto = TETO_DE_DIAS * 86_400_000;
  if (fim.getTime() - inicio.getTime() > teto) inicio = inicioDoDia(new Date(fim.getTime() - teto));
  return { inicio, fim };
}


export function dataCurta(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}


export function diaCurto(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  const mes = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return `${String(d.getDate()).padStart(2, '0')}/${mes}`;
}

/** Format average durations as `00:00:00`, or `-` when no value exists, as in the reference. */
export function timeMedio(segundos: number | null): string {
  if (segundos === null) return '-';
  const s = Math.max(0, Math.round(segundos));
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(Math.floor(s / 3600))}:${dois(Math.floor((s % 3600) / 60))}:${dois(s % 60)}`;
}
