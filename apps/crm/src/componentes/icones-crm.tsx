/**
 * Ícones que a ficha do lead pede e o `@pipe/ui` ainda não tem.
 *
 * Mesma origem e mesmas convenções do `Icone` do pacote: desenhos do Tabler
 * Icons (MIT, © Paweł Kuna), grade de 24, traço arredondado, sem preenchimento.
 * Ficam aqui, e não em `packages/ui`, porque esta entrega não abre o pacote: a
 * regra é escrever local no aplicativo e relatar. Quando um segundo aplicativo
 * pedir os mesmos desenhos, o arquivo sobe para a fachada `icones.tsx` do
 * pacote sem mudar nenhuma chamada.
 *
 * São os tipos da linha do tempo. O Twenty dá um ícone por tipo de evento, e a
 * razão é boa: numa coluna de quarenta linhas, a forma diz o tipo antes de o
 * olho chegar ao texto.
 */

import type { SVGProps } from 'react';

const CAMINHOS = {
  balao:
    'M8 9h8M8 13h6M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3z',
  envelope:
    'M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2zM3 7l9 6l9 -6',
  nota: 'M14 3v4a1 1 0 0 0 1 1h4M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2zM9 9h1M9 13h6M9 17h6',
  /** `tabler:pencil`. O botão de editar da célula inline, que só aparece no hover. */
  lapis: 'M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4M13.5 6.5l4 4',
  telefone:
    'M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2',
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
