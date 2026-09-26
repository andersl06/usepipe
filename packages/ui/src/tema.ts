/**
 * Adapted from twenty-ui (MIT): https://github.com/twentyhq/twenty/blob/main/packages/twenty-ui/src/theme/constants/ThemeCommon.ts
 *
 * We borrowed its SHAPE, not its values: a typed TypeScript theme object, `espaco()` as a 4px-multiple function, a radius scale, and centralized density tokens. Values are Pipe's (docs/marca/MARCA.md); role-based organization comes from Blip measurements (`referencias-blip/pesquisa/blip-design-system.md`).
 *
 * This object mirrors `estilos/tokens.css` in typed form for code that needs a TypeScript value, such as layout calculations, canvas charts, and tests. CSS authors should use the custom property instead of importing this object.
 *
 * Colors deliberately reference custom properties, so a component reading `TEMA.marca.cor` changes theme without knowing that themes exist.
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

  /** Four content steps, following Blip's order. */
  conteudo: {
    padrao: 'var(--p-conteudo)',
    desabilitado: 'var(--p-conteudo-desabilitado)',
    fantasma: 'var(--p-conteudo-fantasma)',
    claro: 'var(--p-conteudo-claro)',
  },

  /** Three strengths of translucent ink; never an opaque hex value. */
  linha: {
    fraca: 'var(--p-linha)',
    media: 'var(--p-linha-media)',
    forte: 'var(--p-linha-forte)',
  },

  /**
   * ONE brand color for primary actions, active state, and focus only. Never use it for labels, numbers, titles, or category tags.
   */
  marca: {
    cor: 'var(--p-marca)',
    forte: 'var(--p-marca-forte)',
    suave: 'var(--p-marca-suave)',
    linha: 'var(--p-marca-linha)',
    conteudo: 'var(--p-marca-conteudo)',
  },

  /**
   * A state is a PAIR: pastel background, dark foreground, and the line connecting them. Never use colored content alone; all three variables travel together so two files cannot give the state two different colors.
   */
  estado: {
    erro: {
      fundo: 'var(--p-error-background)',
      linha: 'var(--p-error-line)',
      conteudo: 'var(--p-error-content)',
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
   * EXTENDED PALETTE - ONLY FOR CHARTS AND ILLUSTRATIONS.
   *
   * Terracotta, ochre, deep blue, and sage live here only. None belongs in interface chrome, tags, borders, icons, or text. Spreading them across the interface made the screen look like a carousel.
   *
   * The order of `serie` is the chart series order.
   */
  grafico: {
    serie: [
      'var(--p-grafico-1)',
      'var(--p-grafico-2)',
      'var(--p-grafico-3)',
      'var(--p-grafico-4)',
      'var(--p-grafico-5)',
    ],
    trilho: 'var(--p-chart-rail)',
  },

  fonte: {
    corpo: 'var(--p-fonte)',
    /** Tabular numbers and section labels only; never stage, queue, or source names. */
    mono: 'var(--p-fonte-mono)',
    /**
     * Three sizes carry the application: 16, 14, and 12. Size 10 is reserved for truly secondary text. `titulo` and `numero` are role-named exceptions so they remain exceptions. Sizes are in px, never rem.
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

  /** Density scale. See docs/specs/2026-09-05-design-system.md, section 5. */
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


  multiplicadorDeEspaco: 4,
} as const;

/**
 * `espaco(2)` yields `'8px'`; `espaco(1, 2)` yields `'4px 8px'`.
 *
 * This makes accidental spacing outside a multiple of 4 impossible, using the same approach as twenty-ui's `spacing()`.
 */
export function espaco(...multiplos: number[]): string {
  return multiplos.map((m) => `${m * TEMA.multiplicadorDeEspaco}px`).join(' ');
}

export type Tema = typeof TEMA;


export type StateName = keyof typeof TEMA.estado;
