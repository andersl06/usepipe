/**
 * Empty-state illustration.
 *
 * Blip bundle measurements showed `bds-illustration` packaged as a component (`referencias-blip/pesquisa/blip-design-system.md`, section 4). An illustration is a component rather than a loose image, allowing Blip-style empty states without a photo. Photos age quickly in an operations product, add weight, and clash with dark mode.
 *
 * The drawing follows the brand symbol's language: monoline, even stroke, rounded ends and curves, and intentional gaps between parts (docs/marca/MARCA.md). Each scene uses two colors: the neutral stroke inherits `currentColor` from `.ilustracao`, while the accent comes from the extended palette, allowed only in charts and illustrations.
 */

import type { ReactNode, SVGProps } from 'react';

/**
 * Each scene corresponds to a real Pipe empty state:
 *
 * - `empty`: a list has nothing yet; an empty pipe.
 * - `busca`: a filter found nothing; a lens over the pipe.
 * - `concluido`: the queue is cleared; the one empty state that is good news.
 * - `error`: the screen failed to load; a broken pipe.
 */
export type IllustrationName = 'vazio' | 'busca' | 'concluido' | 'erro';

export type IllustrationProps = {
  nome?: IllustrationName;

  tamanho?: number;
} & Omit<SVGProps<SVGSVGElement>, 'name'>;

/*
 * A stroke of 6 on a 120-unit grid is half the brand symbol's 12-on-120 proportion because the illustration is larger than the logo.
 */
const TRACO = 6;

export function Illustration({ nome = 'vazio', tamanho = 96, className, ...resto }: IllustrationProps) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 120 120"
      fill="none"
      strokeWidth={TRACO}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={ROTULOS[nome]}
      className={className ? `illustration ${className}` : 'illustration'}
      {...resto}
    >
      {CENAS[nome]}
    </svg>
  );
}

/** Alternative text. The illustration is decorative, but screen-reader users deserve a description. */
const ROTULOS: Record<IllustrationName, string> = {
  vazio: 'Nada aqui ainda',
  busca: 'Nenhum resultado',
  concluido: 'Tudo resolvido',
  erro: 'Não foi possível carregar',
};

const CENAS: Record<IllustrationName, ReactNode> = {

  vazio: (
    <>
      <path d="M18 96V44a18 18 0 0 1 18-18h16" stroke="currentColor" />
      <path d="M102 24v52a18 18 0 0 1-18 18H68" stroke="currentColor" />
      <circle cx="60" cy="60" r="4" fill="var(--p-grafico-1)" stroke="none" />
    </>
  ),


  busca: (
    <>
      <path d="M18 92V48a16 16 0 0 1 16-16h20" stroke="currentColor" />
      <path d="M102 32v44a16 16 0 0 1-16 16H72" stroke="currentColor" />
      <circle cx="60" cy="58" r="20" stroke="var(--p-grafico-1)" />
      <path d="M74 72l14 14" stroke="var(--p-grafico-1)" />
    </>
  ),

  /*
   * The queue is empty. The accent uses the series' dark green, not the brand color: illustrations do not use brand paint.
   */
  concluido: (
    <>
      <path d="M18 92V48a16 16 0 0 1 16-16h52" stroke="currentColor" />
      <circle cx="78" cy="74" r="24" stroke="var(--p-grafico-5)" />
      <path d="M68 74l7 7 14-15" stroke="var(--p-grafico-5)" />
    </>
  ),


  erro: (
    <>
      <path d="M18 92V48a16 16 0 0 1 16-16h14" stroke="currentColor" />
      <path d="M102 32v44a16 16 0 0 1-16 16H72" stroke="currentColor" />
      <path d="M56 26l-8 22 16 6-10 24" stroke="var(--p-grafico-4)" />
    </>
  ),
};
