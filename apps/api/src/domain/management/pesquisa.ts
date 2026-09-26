/**
 * Survey scale, metrics spec §6. Blip has two incompatible models. Pipe supports both but requires ONE type-derived scale per survey and stores the scale on each response, so a CSAT 4 and NPS 4 cannot be summed together. Do not let the configuration form type an arbitrary scale such as 'CSAT de 0 a 10'. Keep this module pure because the `'use client'` configuration card imports it.
 */

export const TIPOS_DE_PESQUISA = ['csat', 'nps'] as const;
export type TipoDePesquisa = (typeof TIPOS_DE_PESQUISA)[number];

export interface EscalaDePesquisa {
  min: number;
  max: number;
  /** Expose spec §6 boundaries as text so the screen does not repeat numbers by hand. */
  faixas: string;
}

export const ESCALA_BY_TYPE: Record<TipoDePesquisa, EscalaDePesquisa> = {
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

/** Survey trigger: the database accepts free text, but the screen offers these three values. */
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
 * Classify a score within its survey type's scale. Keep this separate from `satisfacao.ts`, which reads the class stored with historical responses; configuration previews what scores will mean before save, without reclassifying the past.
 */
export function classeDaNota(tipo: TipoDePesquisa, nota: number): string | null {
  const escala = ESCALA_BY_TYPE[tipo];
  if (!Number.isFinite(nota) || nota < escala.min || nota > escala.max) return null;
  if (tipo === 'csat') return nota <= 2 ? 'detrator' : nota === 3 ? 'neutro' : 'promotor';
  return nota <= 6 ? 'detrator' : nota <= 8 ? 'neutro' : 'promotor';
}
