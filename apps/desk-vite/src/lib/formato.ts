/**
 * Formatos de data e hora do Desk — as regras de `DateUtils` do pacote da
 * referência (`~/desk-clone/fonte-original/app.js`, classe com `getRelativeDate`
 * e `getChatDisplayDate`), reescritas sobre `Intl` em vez de moment.
 *
 * Duas regras, e só duas, mudam de forma conforme o dia:
 *
 * - **horário relativo do cartão** (`getRelativeDate`): hoje é `HH:mm`; outro
 *   dia é o "há quanto tempo" SEM sufixo (`fromNow(true)`) — "um dia", "2 dias",
 *   "um mês"…
 * - **horário do balão** (`getChatDisplayDate`): hoje é `HH:mm`; outro dia é a
 *   data por extenso abreviada (`lll` em pt-BR: "26 de Ago de 2026 12:41").
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
 * "26 de Ago de 2026 12:41" — o `lll` do moment em pt-BR: mês abreviado com
 * inicial maiúscula e sem ponto, que o `Intl` não dá sozinho ("set." vira "Set").
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
 * "há quanto tempo", sem sufixo — os degraus do `relativeTime` do moment
 * (45 s, 90 s, 45 min, 90 min, 22 h, 36 h, 26 d, 45 d, 320 d, 548 d), com as
 * palavras do `pt-br`.
 */
export function tempoDecorrido(de: Date, agora: Date): string {
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

/** O horário do cartão da lista (`lastMessage.relativeDate`). */
export function horarioRelativo(instante: Date, agora = new Date()): string {
  return mesmoDia(instante, agora) ? hora(instante) : tempoDecorrido(instante, agora);
}

/** O horário abaixo do balão (`getChatDisplayDate`). */
export function horarioDoBalao(instante: Date, agora = new Date()): string {
  return mesmoDia(instante, agora) ? hora(instante) : dataAbreviada(instante);
}

/** `00:00:00` — o cronômetro do modo de espera e da pausa (`AgentPauseTimer`). */
export function cronometro(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(hh)}:${dois(mm)}:${dois(ss)}`;
}

/** Iniciais do avatar (`bds-avatar name=`): primeira letra do primeiro e do último nome. */
export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '';
  const primeira = partes[0]?.charAt(0) ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.charAt(0) ?? '') : '';
  return (primeira + ultima).toUpperCase();
}
