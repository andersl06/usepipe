/** Formatação da tela. Mesma régua da Gestão, para as três telas lerem igual. */

export function numero(value: number | null | undefined, casas = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

export function percentual(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined || Number.isNaN(fraction)) return '—';
  return `${(fraction * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
}

export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

/** Soma de coluna do funil: `R$ 812 mil` cabe onde `R$ 812.400` não cabe. */
export function moneyCurto(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (Math.abs(value) >= 1_000_000) return `R$ ${numero(value / 1_000_000, 1)} mi`;
  if (Math.abs(value) >= 1_000) return `R$ ${numero(value / 1_000)} mil`;
  return money(value);
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

export function data(instante: Date | null | undefined, fuso: string): string {
  if (!instante) return '—';
  return instante.toLocaleDateString('pt-BR', {
    timeZone: fuso,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** "há 4 min", "há 3 h", "ontem", "27/08" — a coluna de última atividade da listagem. */
export function desde(instante: Date | null | undefined, fuso: string, agora = new Date()): string {
  if (!instante) return '—';
  const seg = Math.max(0, Math.round((agora.getTime() - instante.getTime()) / 1000));
  if (seg < 60) return 'agora';
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `há ${Math.floor(seg / 3600)} h`;
  const dias = Math.floor(seg / 86400);
  if (dias === 1) return 'ontem';
  if (dias < 7) return `há ${dias} dias`;
  return data(instante, fuso);
}

/**
 * CPF ou CNPJ com máscara. O documento é guardado em `text` sem pontuação —
 * o CNPJ alfanumérico de 2026 quebra coluna numérica e máscara fixa —, então
 * a máscara é da tela e não do banco. Documento com tamanho fora do esperado
 * sai como veio, em vez de sair picado errado.
 */
export function document(value: string | null | undefined): string {
  if (!value) return '—';
  const cru = value.replace(/[^0-9A-Za-z]/g, '');
  if (cru.length === 11) return cru.replace(/^(.{3})(.{3})(.{3})(.{2})$/, '$1.$2.$3-$4');
  if (cru.length === 14) return cru.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
  return value;
}

/** Pontos da explicação do score: sinal explícito, porque a regra pode tirar ponto. */
export function pontos(value: number): string {
  return value >= 0 ? `+${value}` : `−${Math.abs(value)}`;
}

/*
 * Não há `classeDaFaixa` aqui, e a ausência é a decisão: faixa de score é
 * categoria, não estado. Ela diz para onde o lead foi roteado, não que alguém
 * precise agir — e categoria usa a `Etiqueta` neutra do `@pipe/ui`, como fase,
 * origem e fila. A função existia para escolher entre verde e ocre, o que
 * pintava uma coluna inteira da lista e disputava atenção com as duas que
 * realmente pedem ação: dias na fase e desqualificação.
 */
