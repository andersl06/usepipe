/**
 * Adaptado de twenty-ui (MIT) — https://github.com/twentyhq/twenty/blob/main/packages/twenty-ui/src/theme/constants/ThemeCommon.ts
 *
 * O que veio de lá é a FORMA, não os valores: tema como objeto TypeScript
 * tipado, `espaco()` como função de múltiplo de 4px, escala de raio e tokens
 * de densidade centralizados. Os valores são os do Pipe (docs/marca/MARCA.md),
 * e a organização por papel veio de medir a Blip
 * (docs/pesquisa/blip-design-system.md).
 *
 * Este objeto é o espelho tipado de `estilos/tokens.css`. Ele existe para o
 * código que precisa de um valor em TypeScript (cálculo de layout, gráfico
 * desenhado em canvas, teste). Quem estiver escrevendo CSS deve usar a custom
 * property — não importar daqui.
 *
 * As cores apontam para a custom property de propósito: assim um componente
 * que leia `TEMA.cor.marca` continua trocando de tema sozinho, sem saber que
 * tema existe.
 */

export const TEMA = {
  /** Cinco degraus, do claro ao escuro. Toda a tela sai daqui. */
  superficie: {
    s0: 'var(--p-superficie-0)',
    s1: 'var(--p-superficie-1)',
    s2: 'var(--p-superficie-2)',
    s3: 'var(--p-superficie-3)',
    s4: 'var(--p-superficie-4)',
  },

  /** Quatro degraus de conteúdo, na ordem da Blip. */
  conteudo: {
    padrao: 'var(--p-conteudo)',
    desabilitado: 'var(--p-conteudo-desabilitado)',
    fantasma: 'var(--p-conteudo-fantasma)',
    claro: 'var(--p-conteudo-claro)',
  },

  /** Tinta translúcida em três forças. Nunca hex opaco. */
  linha: {
    fraca: 'var(--p-linha)',
    media: 'var(--p-linha-media)',
    forte: 'var(--p-linha-forte)',
  },

  /**
   * UMA cor de marca. Pinta ação primária, estado ativo e foco, e nada mais.
   * Não é cor de rótulo, de número, de título nem de etiqueta de categoria.
   */
  marca: {
    cor: 'var(--p-marca)',
    forte: 'var(--p-marca-forte)',
    suave: 'var(--p-marca-suave)',
    linha: 'var(--p-marca-linha)',
    conteudo: 'var(--p-marca-conteudo)',
  },

  /**
   * Estado é um PAR: fundo pastel com conteúdo escuro por cima, mais a linha
   * que os une. Nunca use só o conteúdo colorido — as três variáveis viajam
   * juntas, senão viram duas cores diferentes em dois arquivos.
   */
  estado: {
    erro: {
      fundo: 'var(--p-erro-fundo)',
      linha: 'var(--p-erro-linha)',
      conteudo: 'var(--p-erro-conteudo)',
    },
    alerta: {
      fundo: 'var(--p-alerta-fundo)',
      linha: 'var(--p-alerta-linha)',
      conteudo: 'var(--p-alerta-conteudo)',
    },
    sucesso: {
      fundo: 'var(--p-sucesso-fundo)',
      linha: 'var(--p-sucesso-linha)',
      conteudo: 'var(--p-sucesso-conteudo)',
    },
    info: {
      fundo: 'var(--p-info-fundo)',
      linha: 'var(--p-info-linha)',
      conteudo: 'var(--p-info-conteudo)',
    },
  },

  /**
   * PALETA ESTENDIDA — EXCLUSIVA DE GRÁFICO E ILUSTRAÇÃO.
   *
   * Terracota, ocre, azul profundo e sage moram aqui e só aqui. Nenhuma delas
   * entra em cromo, etiqueta, borda, ícone ou texto de interface. Foi
   * espalhá-las pela interface corrente que fez a tela parecer um carrossel.
   *
   * A ordem de `serie` é a ordem das séries de um gráfico.
   */
  grafico: {
    serie: [
      'var(--p-grafico-1)',
      'var(--p-grafico-2)',
      'var(--p-grafico-3)',
      'var(--p-grafico-4)',
      'var(--p-grafico-5)',
    ],
    trilho: 'var(--p-grafico-trilho)',
  },

  fonte: {
    corpo: 'var(--p-fonte)',
    /** Número tabular e rótulo de seção. Nunca nome de fase, fila ou origem. */
    mono: 'var(--p-fonte-mono)',
    /**
     * Três degraus carregam a aplicação: 16, 14 e 12. O de 10 só para o
     * verdadeiramente secundário. `titulo` e `numero` são exceção nomeada
     * pelo papel, para continuarem sendo exceção. Régua em px, nunca rem.
     */
    tamanho: {
      lg: 'var(--p-t-lg)',
      md: 'var(--p-t-md)',
      sm: 'var(--p-t-sm)',
      xs: 'var(--p-t-xs)',
      titulo: 'var(--p-t-titulo)',
      numero: 'var(--p-t-numero)',
    },
    peso: { normal: 400, medio: 500, forte: 600 },
  },

  /** Um raio padrão e duas exceções com propósito. */
  raio: {
    padrao: 'var(--p-r-md)',
    controle: 'var(--p-r-sm)',
    pilula: 'var(--p-r-pilula)',
  },

  sombra: {
    baixa: 'var(--p-sombra-1)',
    alta: 'var(--p-sombra-2)',
  },

  duracao: {
    instantanea: 'var(--p-dur-instantanea)',
    rapida: 'var(--p-dur-rapida)',
    normal: 'var(--p-dur-normal)',
  },

  /** Régua de densidade. Ver docs/specs/2026-09-05-design-system.md, seção 5. */
  densidade: {
    alturaTopo: 'var(--p-altura-topo)',
    alturaLinhaTabela: 'var(--p-altura-linha-tabela)',
    celulaY: 'var(--p-celula-y)',
    celulaX: 'var(--p-celula-x)',
    larguraLateral: 'var(--p-largura-lateral)',
  },

  icone: {
    tamanho: { sm: 14, md: 16, lg: 20 },
    traco: 1.75,
  },

  /** Multiplicador de espaço. Ver `espaco()`. */
  multiplicadorDeEspaco: 4,
} as const;

/**
 * `espaco(2)` → `'8px'`; `espaco(1, 2)` → `'4px 8px'`.
 *
 * Existe para tornar impossível escrever um espaçamento fora do múltiplo de 4
 * por acidente. Mesmo truque do `spacing()` do twenty-ui.
 */
export function espaco(...multiplos: number[]): string {
  return multiplos.map((m) => `${m * TEMA.multiplicadorDeEspaco}px`).join(' ');
}

export type Tema = typeof TEMA;

/** Os quatro estados. É a mesma lista que a `Etiqueta` aceita como tom. */
export type NomeDeEstado = keyof typeof TEMA.estado;
