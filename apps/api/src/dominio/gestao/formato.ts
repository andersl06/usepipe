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

/**
 * Duração longa, para relatório: `4h 12min`.
 *
 * O arredondamento é feito sobre o total de minutos, e não sobre o resto da
 * hora: arredondando o resto separado, 7.190 segundos viravam `1h 60min` —
 * 59,8 minutos sobem para 60 e a hora não acompanha.
 */
export function duracaoLonga(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined || Number.isNaN(segundos)) return '—';
  const minutos = Math.round(Math.max(0, segundos) / 60);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
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
  if (fracao === null || fracao === undefined || Number.isNaN(fracao)) return '—';
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
 * Os dois filtros que vêm da URL, conferidos ANTES de virar consulta.
 *
 * A querystring é entrada de fora: link colado, marcador antigo, robô. Sem
 * conferência, `?fila=abc` chegava ao Postgres como `abc::uuid` e a tela
 * inteira devolvia 500 — erro de servidor para o que é, no máximo, um filtro
 * torto. Valor que não passa vira `undefined`, e `undefined` é "sem filtro":
 * a tela abre, e abre mostrando tudo.
 *
 * Ficam aqui, e não num arquivo novo, porque `formato.ts` já é o módulo puro
 * que todas essas telas importam — e é ele que já sabe o formato `AAAA-MM-DD`.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidOuNada(bruto: string | undefined): string | undefined {
  return bruto && UUID.test(bruto) ? bruto : undefined;
}

/** `AAAA-MM-DD` que o Postgres aceita — inclusive 31/02, que ele mesmo recusa. */
export function dataOuNada(bruto: string | undefined): string | undefined {
  if (!bruto || !/^\d{4}-\d{2}-\d{2}$/.test(bruto)) return undefined;
  const data = new Date(`${bruto}T00:00:00Z`);
  return Number.isNaN(data.getTime()) || dataIso(data, 'UTC') !== bruto ? undefined : bruto;
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

/**
 * `HH:MM` válido, com `24:00` aceito porque o core trata meia-noite do dia
 * seguinte. Compartilhado entre `acoes/regras.ts` (criar) e `cadastros.ts`
 * (editar faixa/exceção) — duas cópias da mesma validação são duas chances de
 * divergir.
 */
export function relogioValido(valor: string): boolean {
  return valor === '24:00' || /^([01]\d|2[0-3]):[0-5]\d$/.test(valor);
}

/** Minutos desde meia-noite, para comparar início/fim e detectar sobreposição. */
export function minutosDoRelogio(relogio: string): number {
  const [h, m] = relogio.split(':');
  return Number(h) * 60 + Number(m);
}
