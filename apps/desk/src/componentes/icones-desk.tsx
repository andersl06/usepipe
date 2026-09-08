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
  ajuda:
    'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M12 17l0 .01M12 13.5a1.5 1.5 0 0 1 1 -1.5a2.6 2.6 0 1 0 -3 -4',
  contatos:
    'M20 6v12a2 2 0 0 1 -2 2h-11a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1h11a2 2 0 0 1 2 2zM10 16h6M11 11m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M4 8h3M4 12h3M4 16h3',
  conversa:
    'M8 9h8M8 13h6M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3z',
  externo: 'M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6M11 13l9 -9M15 4h5v5',
  massa: 'M15 5v2M15 11v2M15 17v2M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-3a2 2 0 0 0 0 -4v-3a2 2 0 0 1 2 -2',
  metricas: 'M4 19h16M4 15l4 -6l4 2l4 -5l4 4',
  microfone:
    'M9 2m0 3a3 3 0 0 1 3 -3h0a3 3 0 0 1 3 3v5a3 3 0 0 1 -3 3h0a3 3 0 0 1 -3 -3zM5 10a7 7 0 0 0 14 0M8 21h8M12 17v4',
  /*
   * Os quatro canais, para o selo sobre o rosto do cliente no cartão da lista.
   *
   * São desenhos NOSSOS, não os logotipos das plataformas: forma de marca é
   * protegida, e um envelope, um globo e um balão dizem a mesma coisa sem
   * pedir licença a ninguém. Mesma grade de 24 e mesmo traço do resto do
   * arquivo, para o selo não destoar dos ícones do trilho.
   */
  canal_whatsapp: 'M21 11.5a8.38 8.38 0 0 1 -9 8.5a8.5 8.5 0 0 1 -3.8 -.9L3 21l1.9 -5.2a8.5 8.5 0 0 1 -.9 -3.8a8.38 8.38 0 0 1 8.5 -9a8.38 8.38 0 0 1 8.5 8.5zM9 9.5c0 3 2.5 5.5 5.5 5.5M9 9.5h1.5l1 2l-1.2 1M14.5 15v-1.5l2 -1l1 1',
  canal_instagram:
    'M4 8a4 4 0 0 1 4 -4h8a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4zM12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0 -7M16.5 7.5v.01',
  canal_email: 'M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2zM3 7.5l9 6l9 -6',
  canal_site:
    'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0 -18',

  /* Avião de papel: é o ícone de "mensagem ativa" deles. */
  paperplane: 'M10 14l11 -11M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5',
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
