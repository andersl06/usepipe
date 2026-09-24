/**
 * Ilustração de estado vazio.
 *
 * Existe porque a medição do bundle da Blip mostrou `bds-illustration`
 * empacotado como componente (referencias-blip/pesquisa/blip-design-system.md, seção 4):
 * ilustração é componente, não imagem solta, e é assim que eles preenchem
 * estado vazio sem depender de foto. Foto num produto de operação envelhece,
 * pesa e nunca combina com o tema escuro.
 *
 * Desenho: a mesma linguagem do símbolo da marca — monoline, traço uniforme,
 * pontas e curvas arredondadas, e o vão entre as peças fazendo parte do
 * desenho (docs/marca/MARCA.md). Duas cores por cena: o traço neutro herda
 * `currentColor` da classe `.ilustracao`, e o acento vem da paleta estendida,
 * que junto com o gráfico é o único lugar onde ela pode aparecer.
 */

import type { ReactNode, SVGProps } from 'react';

/**
 * As cenas. Cada uma existe porque um estado vazio real do Pipe precisa dela:
 *
 * - `vazio`    — a lista não tem nada ainda. Tubulação por onde nada passou.
 * - `busca`    — o filtro não achou nada. Tubulação com a lente por cima.
 * - `concluido` — a fila zerou. É o único estado vazio que é boa notícia.
 * - `erro`     — a tela não conseguiu carregar. Tubulação partida.
 */
export type NomeDeIlustracao = 'vazio' | 'busca' | 'concluido' | 'erro';

export type PropsDeIlustracao = {
  nome?: NomeDeIlustracao;
  /** Largura em px. Padrão 96 — cabe num cartão sem virar o assunto da tela. */
  tamanho?: number;
} & Omit<SVGProps<SVGSVGElement>, 'name'>;

/* Traço uniforme de 6 na grade de 120, que é a proporção do símbolo (12 em
   120) reduzida à metade porque a ilustração é maior que o logotipo. */
const TRACO = 6;

export function Ilustracao({ nome = 'vazio', tamanho = 96, className, ...resto }: PropsDeIlustracao) {
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
      className={className ? `ilustracao ${className}` : 'ilustracao'}
      {...resto}
    >
      {CENAS[nome]}
    </svg>
  );
}

/** Texto alternativo. A ilustração é decorativa, mas quem lê tela merece saber. */
const ROTULOS: Record<NomeDeIlustracao, string> = {
  vazio: 'Nada aqui ainda',
  busca: 'Nenhum resultado',
  concluido: 'Tudo resolvido',
  erro: 'Não foi possível carregar',
};

const CENAS: Record<NomeDeIlustracao, ReactNode> = {
  /* Dois cotovelos que não se encontram: o vão é o vazio. */
  vazio: (
    <>
      <path d="M18 96V44a18 18 0 0 1 18-18h16" stroke="currentColor" />
      <path d="M102 24v52a18 18 0 0 1-18 18H68" stroke="currentColor" />
      <circle cx="60" cy="60" r="4" fill="var(--p-grafico-1)" stroke="none" />
    </>
  ),

  /* A mesma tubulação, com a lente por cima: procurou e não achou. */
  busca: (
    <>
      <path d="M18 92V48a16 16 0 0 1 16-16h20" stroke="currentColor" />
      <path d="M102 32v44a16 16 0 0 1-16 16H72" stroke="currentColor" />
      <circle cx="60" cy="58" r="20" stroke="var(--p-grafico-1)" />
      <path d="M74 72l14 14" stroke="var(--p-grafico-1)" />
    </>
  ),

  /* Fila zerada. O acento é o verde escuro da série, não a cor de marca:
     ilustração não pinta com a marca. */
  concluido: (
    <>
      <path d="M18 92V48a16 16 0 0 1 16-16h52" stroke="currentColor" />
      <circle cx="78" cy="74" r="24" stroke="var(--p-grafico-5)" />
      <path d="M68 74l7 7 14-15" stroke="var(--p-grafico-5)" />
    </>
  ),

  /* Tubulação partida. Terracota, que é a cor do que exige ação. */
  erro: (
    <>
      <path d="M18 92V48a16 16 0 0 1 16-16h14" stroke="currentColor" />
      <path d="M102 32v44a16 16 0 0 1-16 16H72" stroke="currentColor" />
      <path d="M56 26l-8 22 16 6-10 24" stroke="var(--p-grafico-4)" />
    </>
  ),
};
