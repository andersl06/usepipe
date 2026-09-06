/**
 * Ícones que a tela de Monitoramento pede e o `@pipe/ui` ainda não tem.
 *
 * Mesma origem e mesmas convenções do `Icone` do pacote: desenhos do Tabler
 * Icons (MIT, © Paweł Kuna), grade de 24, traço arredondado, sem preenchimento.
 * Ficam aqui, e não em `packages/ui`, porque a entrega não abre o pacote — a
 * regra de trabalho é escrever local na Gestão e relatar. Quando um segundo
 * aplicativo pedir os mesmos desenhos, o arquivo inteiro sobe para a fachada
 * `icones.tsx` do pacote sem mudar nenhuma chamada.
 */

import type { SVGProps } from 'react';

const CAMINHOS = {
  ajuda: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M12 17h.01M12 13.5a1.5 1.5 0 0 1 1 -1.5a2.6 2.6 0 1 0 -3 -4',
  atualizar: 'M20 11a8.1 8.1 0 0 0 -15.5 -2M4 5v4h4M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4',
  baixo: 'M6 9l6 6l6 -6',
  externo: 'M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6M11 13l9 -9M15 4h5v5',
  informacao: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M12 8h.01M11 12h1v4h1',
  sino: 'M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6M9 17v1a3 3 0 0 0 6 0v-1',
  telaCheia: 'M4 8v-2a2 2 0 0 1 2 -2h2M4 16v2a2 2 0 0 0 2 2h2M16 4h2a2 2 0 0 1 2 2v2M16 20h2a2 2 0 0 0 2 -2v-2',
} as const;

export type NomeDeIconeGestao = keyof typeof CAMINHOS;

export function IconeGestao({
  nome,
  tamanho = 16,
  ...resto
}: { nome: NomeDeIconeGestao; tamanho?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
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
