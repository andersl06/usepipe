/**
 * Icons the lead record needs that `@pipe/ui` doesn't have yet.
 *
 * Same origin and same conventions as the package's `Icone`: Tabler Icons
 * drawings (MIT, © Paweł Kuna), 24 grid, rounded stroke, no fill. They live
 * here, not in `packages/ui`, because this delivery doesn't open the package:
 * the rule is to write it locally in the app and report it. When a second app
 * asks for the same drawings, the file moves up to the package's `icones.tsx`
 * facade without changing a single call site.
 *
 * They're the timeline's event types. Twenty gives one icon per event type, and
 * the reasoning is sound: in a forty-row column, the shape tells the type
 * before the eye reaches the text.
 */

import type { SVGProps } from 'react';

const CAMINHOS = {
  balao:
    'M8 9h8M8 13h6M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3z',
  envelope:
    'M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2zM3 7l9 6l9 -6',
  nota: 'M14 3v4a1 1 0 0 0 1 1h4M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2zM9 9h1M9 13h6M9 17h6',
  /** `tabler:pencil`. The inline cell's edit button, which only shows on hover. */
  lapis: 'M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4M13.5 6.5l4 4',
  telefone:
    'M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2',
  /** `tabler:layout-columns`. The button that opens the columns panel. */
  colunas: 'M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2zM12 4v16',
  /** `tabler:grip-vertical`. The panel's drag handle — the same one Twenty uses. */
  arrastar:
    'M9 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M9 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M9 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M15 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M15 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M15 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  /** `tabler:eye`. Mostra a coluna oculta. */
  olho: 'M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6',
  /** `tabler:eye-off`. Hides the visible column. */
  'olho-fechado':
    'M10.585 10.587a2 2 0 0 0 2.829 2.828M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87M3 3l18 18',
} as const;

export type NomeDeIconeCrm = keyof typeof CAMINHOS;

export function IconeCrm({
  nome,
  tamanho = 16,
  ...resto
}: { nome: NomeDeIconeCrm; tamanho?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
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
