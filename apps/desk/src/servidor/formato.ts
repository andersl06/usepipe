/**
 * Formatação de tempo. Tudo é formatado no servidor e desce como texto pronto:
 * é o que evita o cliente renderizar uma hora diferente da que o servidor mandou.
 */

const FUSO = 'America/Sao_Paulo';

const HORA_MINUTO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  hour: '2-digit',
  minute: '2-digit',
});

const DIA_MES = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  day: '2-digit',
  month: '2-digit',
});

export function hora(instante: Date): string {
  return HORA_MINUTO.format(instante);
}

export function dia(instante: Date): string {
  return DIA_MES.format(instante);
}

export function diaEHora(instante: Date): string {
  return `${DIA_MES.format(instante)} ${HORA_MINUTO.format(instante)}`;
}

/** `hh:mm` decorrido — a coluna de tempo da lista de atendimentos. */
export function decorrido(desde: Date, agora: Date): string {
  const minutos = Math.max(0, Math.floor((agora.getTime() - desde.getTime()) / 60_000));
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** `21h48`, `38min` — o tempo restante da janela, do jeito que o atendente lê. */
export function duracaoCurta(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}min`;
  return `${h}h${String(m).padStart(2, '0')}`;
}
