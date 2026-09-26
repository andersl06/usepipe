/**
 * Desk date and time formats follow the reference `DateUtils` (`~/desk-clone/fonte-original/app.js`, `getRelativeDate` and `getChatDisplayDate`), reimplemented with `Intl` instead of moment. Card relative time is `HH:mm` today and elapsed time without a suffix (`fromNow(true)`, e.g. `um dia`, `2 dias`, `um mês`) on other days. Bubble time is `HH:mm` today and abbreviated full date (`lll` in pt-BR, e.g. `26 de Ago de 2026 12:41`) otherwise.
 */

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const DATA_LLL = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function mesmoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** `HH:mm`, o `LT` do pt-BR. */
export function hora(instante: Date): string {
  return HORA.format(instante);
}

/**
 * Match moment's pt-BR `lll` output (`26 de Ago de 2026 12:41`): capitalize the abbreviated month and remove its period, which `Intl` does not do by itself (`set.` becomes `Set`).
 */
export function dataAbreviada(instante: Date): string {
  const partes = DATA_LLL.formatToParts(instante);
  return partes
    .map((p) => {
      if (p.type === 'month') {
        const m = p.value.replace('.', '');
        return m.charAt(0).toUpperCase() + m.slice(1);
      }
      if (p.type === 'literal' && p.value.includes(',')) return ' ';
      return p.value;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Elapsed time without a suffix follows moment `relativeTime` thresholds (45 s, 90 s, 45 min, 90 min, 22 h, 36 h, 26 d, 45 d, 320 d, 548 d) and uses pt-br words.
 */
export function timeElapsed(de: Date, agora: Date): string {
  const seg = Math.round(Math.abs(agora.getTime() - de.getTime()) / 1000);
  const min = Math.round(seg / 60);
  const h = Math.round(min / 60);
  const d = Math.round(h / 24);
  const mes = Math.round(d / 30.4);
  const ano = Math.round(d / 365);
  if (seg < 45) return 'poucos segundos';
  if (seg < 90) return 'um minuto';
  if (min < 45) return `${min} minutos`;
  if (min < 90) return 'uma hora';
  if (h < 22) return `${h} horas`;
  if (h < 36) return 'um dia';
  if (d < 26) return `${d} dias`;
  if (d < 45) return 'um mês';
  if (d < 320) return `${mes} meses`;
  if (d < 548) return 'um ano';
  return `${ano} anos`;
}


export function horarioRelativo(instante: Date, agora = new Date()): string {
  return mesmoDia(instante, agora) ? hora(instante) : timeElapsed(instante, agora);
}


export function horarioDoBalao(instante: Date, agora = new Date()): string {
  return mesmoDia(instante, agora) ? hora(instante) : dataAbreviada(instante);
}

/** Format `00:00:00` for standby and pause timers (`AgentPauseTimer`). */
export function cronometro(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(hh)}:${dois(mm)}:${dois(ss)}`;
}


export function initials(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '';
  const first = partes[0]?.charAt(0) ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.charAt(0) ?? '') : '';
  return (first + ultima).toUpperCase();
}
