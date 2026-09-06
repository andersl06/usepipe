/**
 * Fachada de ícone — desenhos do Tabler Icons (MIT), © Paweł Kuna.
 * https://github.com/tabler/tabler-icons — licença MIT.
 *
 * Por que uma fachada e não o pacote `@tabler/icons-react`: o Twenty usa a
 * fachada justamente para que nenhum componente importe o pacote direto, e o
 * conjunto que os três aplicativos do Pipe usam de verdade é pequeno. Copiar
 * o caminho SVG dos que usamos custa menos do que carregar a biblioteca
 * inteira, e mantém o traço e o tamanho sob um controle só.
 *
 * Trocar por `@tabler/icons-react` depois é substituir o corpo deste arquivo;
 * a interface `<Icone nome="..." />` não muda.
 *
 * Todos os desenhos usam a grade de 24 do Tabler, traço arredondado, sem
 * preenchimento — as mesmas convenções do símbolo da marca.
 */

import type { SVGProps } from 'react';

/** Caminhos na grade 24×24 do Tabler. Ordem alfabética. */
const CAMINHOS = {
  alerta: 'M12 9v4M12 17h.01M10.24 3.957l-8.422 14.06a1.989 1.989 0 0 0 1.7 2.983h16.845a1.989 1.989 0 0 0 1.7 -2.983l-8.423 -14.06a1.989 1.989 0 0 0 -3.4 0z',
  busca: 'M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0M21 21l-6 -6',
  calendario:
    'M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2zM16 3v4M8 3v4M4 11h16',
  balao:
    'M8 9h8M8 13h6M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3z',
  cheque: 'M5 12l5 5l10 -10',
  engrenagem:
    'M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
  esquerda: 'M5 12l14 0M5 12l6 6M5 12l6 -6',
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
} as const;

export type NomeDeIcone = keyof typeof CAMINHOS;

export type PropsDeIcone = {
  nome: NomeDeIcone;
  /** Tamanho em px. Padrão 16 — a régua de ícone do Twenty é 14/16/20/24. */
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
 * Símbolo da marca: dois cotovelos de tubulação que se encaixam sem se tocar.
 * O vão entre os dois é parte do desenho — nunca fechar (docs/marca/MARCA.md).
 *
 * Estava duplicado inline em três componentes (`desk/trilho.tsx`,
 * `gestao/menu-lateral.tsx`, `crm/menu-lateral.tsx`), cada cópia com o seu
 * próprio hex. Agora é um só, e o segundo traço herda a cor de destaque.
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
