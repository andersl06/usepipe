/**
 * Icon facade using Tabler Icons artwork (MIT), copyright Paweł Kuna. https://github.com/tabler/tabler-icons - MIT license.
 *
 * Twenty uses a facade so components never import the icon package directly. The set actually used by Pipe's three applications is small; copying those SVG paths costs less than loading the whole library and keeps stroke and size under one control point.
 *
 * Switching to `@tabler/icons-react` later means replacing this file's implementation while preserving the `<Icone nome="..." />` interface.
 *
 * All drawings use Tabler's 24-unit grid, rounded strokes, and no fill, matching the brand symbol.
 */

import type { SVGProps } from 'react';


const CAMINHOS = {
  alerta: 'M12 9v4M12 17h.01M10.24 3.957l-8.422 14.06a1.989 1.989 0 0 0 1.7 2.983h16.845a1.989 1.989 0 0 0 1.7 -2.983l-8.423 -14.06a1.989 1.989 0 0 0 -3.4 0z',
  baixo: 'M6 9l6 6l6 -6',
  busca: 'M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0M21 21l-6 -6',
  cima: 'M6 15l6 -6l6 6',
  lapis:
    'M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4M13.5 6.5l4 4',
  calendario:
    'M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2zM16 3v4M8 3v4M4 11h16',
  balao:
    'M8 9h8M8 13h6M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3z',
  chave:
    'M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0zM15.5 6.5l3 3',
  cheque: 'M5 12l5 5l10 -10',
  engrenagem:
    'M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
  esquerda: 'M5 12l14 0M5 12l6 6M5 12l6 -6',
  lixeira: 'M4 7l16 0M10 11l0 6M14 11l0 6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3',
  filtro: 'M4 4h16v2.172a2 2 0 0 1 -.586 1.414l-4.414 4.414v7l-6 2v-8.5l-4.48 -4.928a2 2 0 0 1 -.52 -1.345v-2.227z',
  fila: 'M4 6h16M4 12h16M4 18h12',
  funil: 'M4 4h16v2.172a2 2 0 0 1 -.586 1.414l-4.414 4.414v7l-6 2v-8.5l-4.48 -4.928a2 2 0 0 1 -.52 -1.345v-2.227z',
  grade: 'M4 4h6v6h-6zM14 4h6v6h-6zM4 14h6v6h-6zM14 14h6v6h-6z',
  historico:
    'M12 8v4l3 3M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5',
  lua: 'M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z',
  mais: 'M12 5l0 14M5 12l14 0',
  painel: 'M4 4h6v8h-6zM4 16h6v4h-6zM14 12h6v8h-6zM14 4h6v4h-6z',
  pessoa: 'M12 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2',
  pessoas:
    'M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0 -3 -3.85',
  raio: 'M13 3v7h6l-8 11v-7h-6l8 -11',
  relogio: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M12 7v5l3 3',
  sol: 'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M3 12h1M12 3v1M20 12h1M12 20v1M5.6 5.6l.7 .7M18.4 5.6l-.7 .7M17.7 17.7l.7 .7M6.3 17.7l-.7 .7',
  x: 'M18 6l-12 12M6 6l12 12',
  // The five below are original simple line drawings in the same 24-unit/no-fill style,
  // not copied from Tabler's exact path data (unlike the rest of this map).
  figurinha:
    'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M9 10l.01 0M15 10l.01 0M9.5 15a3.5 3.5 0 0 0 5 0',
  audio: 'M9 17m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M19 15m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M9 17v-13l10 -2v13',
  imagem:
    'M4 4h16v16h-16zM4 15l4 -4l4 4l4 -5l4 5M9 9m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  video: 'M4 4h16v16h-16zM10 9l5 3l-5 3z',
  documento:
    'M14 3v4a1 1 0 0 0 1 1h4M6 3h8l5 5v12a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1v-16a1 1 0 0 1 1 -1zM9 13h6M9 17h6',
  // Builder-only icons (D-33): own drawings for roles the reference has no license-free
  // equivalent for in this file; new names in English (std/CONVENTIONS-EN.md).
  userEngaged:
    'M10 7m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M5 20v-1a4 4 0 0 1 4 -4h2a4 4 0 0 1 1.5 .29M17 15m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M15.2 15.2l1.1 1.1l2.1 -2.1',
  numberedMenu:
    'M4 6m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M4 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M4 18m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M9 6h11M9 12h11M9 18h11',
  location:
    'M12 21s-7 -6.5 -7 -11a7 7 0 0 1 14 0c0 4.5 -7 11 -7 11zM12 10m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
  httpRequest:
    'M4 8h12l-3 -3M16 8l-3 3M20 16h-12l3 -3M8 16l-3 3',
  script:
    'M6 3h9l5 5v13a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1v-16a1 1 0 0 1 1 -1zM14 3v4a1 1 0 0 0 1 1h4M9.5 13l-2 2l2 2M14.5 13l2 2l-2 2',
  testEnvironment:
    'M9 3h6M10 3v5.5l-5 8a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8 -3l-5 -8v-5.5M8 15h8',
  restoreVersion:
    'M9 3h9a1 1 0 0 1 1 1v16a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1v-9M5 8l-3 3l3 3M2 11h9',
  // Block action icons by type (D-33, F-1.2): one drawing per action type, never Blip's artwork.
  trackEvent:
    'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  mergeContact:
    'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-12a1 1 0 0 1 1 -1zM9 11m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M6.5 16c.5 -1.8 1.6 -2.5 2.5 -2.5s2 .7 2.5 2.5M14 10h4M14 14h3',
  redirect:
    'M13 3h6v6M19 3l-9 9M11 5h-5a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-5',
  manageList:
    'M9 6h11M9 12h11M9 18h11M4 6l1 1l2 -2M4 12l1 1l2 -2M4 18l1 1l2 -2',
  blipFunction:
    'M6 3h9l5 5v13a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1v-16a1 1 0 0 1 1 -1zM14 3v4a1 1 0 0 0 1 1h4M10 12c-1 0 -1.5 .7 -1.5 1.6v.8c0 .7 -.3 1.1 -1 1.1c.7 0 1 .4 1 1.1v.8c0 .9 .5 1.6 1.5 1.6M14 12c1 0 1.5 .7 1.5 1.6v.8c0 .7 .3 1.1 1 1.1c-.7 0 -1 .4 -1 1.1v.8c0 .9 -.5 1.6 -1.5 1.6',
  setVariable:
    'M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2zM9 9l6 6M15 9l-6 6',
  processCommand:
    'M4 4h16v16h-16zM8 9l3 3l-3 3M13 15h4',
  executeTemplate:
    'M6 3h9l5 5v13a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1v-16a1 1 0 0 1 1 -1zM14 3v4a1 1 0 0 0 1 1h4M9.5 12.5l-2 2l2 2M14.5 12.5l2 2l-2 2M12.5 11.5l-1 6',
  forwardToAgent:
    'M9 3v4M15 3v4M6 7h12v3a6 6 0 0 1 -12 0zM9 16v2a3 3 0 0 0 6 0v-2M12 18v3',
  actionGeneric:
    'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M10 8l6 4l-6 4z',
  addOutline:
    'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M12 8v8M8 12h8',
  perigo: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M12 8v4M12 16h.01',
} as const;

export type NomeDeIcone = keyof typeof CAMINHOS;

export type PropsDeIcone = {
  nome: NomeDeIcone;
  /** Size in px. Default 16; Twenty's icon scale is 14/16/20/24. */
  tamanho?: number;
} & Omit<SVGProps<SVGSVGElement>, 'name'>;

export function Icone({ nome, tamanho = 16, ...resto }: PropsDeIcone) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...resto}
    >
      <path d={CAMINHOS[nome]} />
    </svg>
  );
}

/**
 * Brand symbol: two pipe elbows fitting together without touching. The gap is part of the design and must remain open (docs/marca/MARCA.md).
 *
 * It was duplicated inline in three components (`desk/trilho.tsx`, `gestao/menu-lateral.tsx`, `crm/menu-lateral.tsx`), each with its own hex value. Now there is one copy, and the second stroke inherits the accent color.
 */
export function Simbolo({ tamanho = 22, ...resto }: { tamanho?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="-12 -12 132 132"
      fill="none"
      strokeWidth={12}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Pipe"
      focusable="false"
      {...resto}
    >
      <path d="M9,99 V36 Q9,9 36,9 H63" stroke="currentColor" />
      <path d="M99,9 V72 Q99,99 72,99 H36" stroke="var(--p-marca)" />
    </svg>
  );
}
