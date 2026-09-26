/**
 * Survey scale follows metrics spec Section 6. Blip uses two incompatible market models without merging them; Pipe supports both but requires one type per survey and stores the scale with each response. Otherwise CSAT 4 and NPS 4 could enter the same chart. Type determines scale; do not allow manual scale entry that could create a 0-to-10 CSAT no report can classify. Keep this pure for the `'use client'` configuration card.
 */

export const TIPOS_DE_PESQUISA = ['csat', 'nps'] as const;
export type TipoDePesquisa = (typeof TIPOS_DE_PESQUISA)[number];

export interface EscalaDePesquisa {
  min: number;
  max: number;
  /** Expose metrics-spec Section 6 boundaries as text so the screen does not repeat numeric thresholds. */
  faixas: string;
}

export const ESCALA_BY_TIPO: Record<TipoDePesquisa, EscalaDePesquisa> = {
  csat: { min: 1, max: 5, faixas: 'detrator 1–2 · neutro 3 · promotor 4–5' },
  nps: { min: 0, max: 10, faixas: 'detrator 0–6 · neutro 7–8 · promotor 9–10' },
};

export const ROTULO_TIPO_PESQUISA: Record<TipoDePesquisa, string> = {
  csat: 'CSAT — satisfação, 1 a 5',
  nps: 'NPS — recomendação, 0 a 10',
};

export function tipoDePesquisaValido(bruto: string): bruto is TipoDePesquisa {
  return (TIPOS_DE_PESQUISA as readonly string[]).includes(bruto);
}

/** The database allows free text for survey trigger; this screen offers exactly three choices. */
export const DISPAROS_DE_PESQUISA = ['encerramento', 'primeira_resposta', 'manual'] as const;
export type DisparoDePesquisa = (typeof DISPAROS_DE_PESQUISA)[number];

export const ROTULO_DISPARO: Record<DisparoDePesquisa, string> = {
  encerramento: 'Ao encerrar a conversa',
  primeira_resposta: 'Depois da primeira resposta',
  manual: 'Só quando o atendente pedir',
};

export function disparoValido(bruto: string): bruto is DisparoDePesquisa {
  return (DISPAROS_DE_PESQUISA as readonly string[]).includes(bruto);
}

/**
 * Classify a score within its type's scale for configuration preview. Keep this here, not `satisfacao.ts`: that report reads the class stored with historical responses, while this function shows what a new score WOULD mean before saving. Do not reclassify history.
 */
export function classeDaNota(tipo: TipoDePesquisa, nota: number): string | null {
  const escala = ESCALA_BY_TIPO[tipo];
  if (!Number.isFinite(nota) || nota < escala.min || nota > escala.max) return null;
  if (tipo === 'csat') return nota <= 2 ? 'detrator' : nota === 3 ? 'neutro' : 'promotor';
  return nota <= 6 ? 'detrator' : nota <= 8 ? 'neutro' : 'promotor';
}
