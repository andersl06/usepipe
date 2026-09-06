/**
 * Ícones que a tela do atendente pede e o `@pipe/ui` ainda não tem.
 *
 * Mesma origem e mesmas convenções do `Icone` do pacote: desenhos do Tabler
 * Icons (MIT, © Paweł Kuna), grade de 24, traço arredondado, sem
 * preenchimento. Ficam aqui, e não em `packages/ui`, pela mesma razão que os
 * da Gestão ficam lá: a entrega não abre o pacote. Quando o terceiro
 * aplicativo pedir os mesmos desenhos, o arquivo sobe para a fachada
 * `icones.tsx` sem mudar nenhuma chamada.
 */

import type { SVGProps } from 'react';

const CAMINHOS = {
  conversa:
    'M8 9h8M8 13h6M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3z',
  externo: 'M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6M11 13l9 -9M15 4h5v5',
} as const;

export type NomeDeIconeDesk = keyof typeof CAMINHOS;

export function IconeDesk({
  nome,
  tamanho = 24,
  ...resto
}: { nome: NomeDeIconeDesk; tamanho?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
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
