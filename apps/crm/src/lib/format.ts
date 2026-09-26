/** Screen formatting. Same ruler as Gestão, so the three screens read alike. */

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

/** Funnel column sum: `R$ 812k` fits where `R$ 812,400` doesn't. */
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

/** "4 min ago", "3 h ago", "yesterday", "08/27" — the listing's last-activity column. */
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
 * CPF or CNPJ, masked. The document is stored in `text` with no punctuation —
 * 2026's alphanumeric CNPJ breaks a numeric column and a fixed mask — so the
 * mask belongs to the screen, not the database. A document of an unexpected
 * length comes out as it came in, instead of coming out chopped up wrong.
 */
export function document(value: string | null | undefined): string {
  if (!value) return '—';
  const cru = value.replace(/[^0-9A-Za-z]/g, '');
  if (cru.length === 11) return cru.replace(/^(.{3})(.{3})(.{3})(.{2})$/, '$1.$2.$3-$4');
  if (cru.length === 14) return cru.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
  return value;
}

/** Points in the score explanation: explicit sign, because a rule can subtract points. */
export function pontos(value: number): string {
  return value >= 0 ? `+${value}` : `−${Math.abs(value)}`;
}

/*
 * There's no `classeDaFaixa` here, and the absence is the decision: a score band
 * is a category, not a state. It says where the lead got routed, not that
 * someone needs to act — and a category uses `@pipe/ui`'s neutral `Etiqueta`,
 * like stage, source, and queue. The function used to choose between green and
 * ochre, which painted a whole list column and competed for attention with the
 * two that actually call for action: days in stage and disqualification.
 */
