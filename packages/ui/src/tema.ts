/**
 * Adaptado de twenty-ui (MIT) — https://github.com/twentyhq/twenty/blob/main/packages/twenty-ui/src/theme/constants/ThemeCommon.ts
 *
 * O que veio de lá é a FORMA, não os valores: tema como objeto TypeScript
 * tipado, `espaco()` como função de múltiplo de 4px, escala de raio e tokens
 * de componente centralizados. Os valores são os do Pipe (docs/marca/MARCA.md).
 *
 * Este objeto é o espelho tipado de `estilos/tokens.css`. Ele existe para o
 * código que precisa de um valor em TypeScript (cálculo de layout, gráfico
 * desenhado em canvas, teste). Quem estiver escrevendo CSS deve usar a custom
 * property — não importar daqui.
 *
 * As cores apontam para a custom property de propósito: assim um componente
 * que leia `TEMA.cor.destaque` continua trocando de tema sozinho, sem saber
 * que tema existe.
 */

export const TEMA = {
  cor: {
    fundo: 'var(--p-fundo)',
    superficie: 'var(--p-superficie)',
    superficie2: 'var(--p-superficie-2)',
    superficie3: 'var(--p-superficie-3)',
    superficieInversa: 'var(--p-superficie-inversa)',

    tinta: 'var(--p-tinta)',
    tinta2: 'var(--p-tinta-2)',
    tinta3: 'var(--p-tinta-3)',
    tintaInversa: 'var(--p-tinta-inversa)',

    linha: 'var(--p-linha)',
    linhaMedia: 'var(--p-linha-media)',
    linhaForte: 'var(--p-linha-forte)',

    destaque: 'var(--p-destaque)',
    destaqueTinta: 'var(--p-destaque-tinta)',
    destaqueFundo: 'var(--p-destaque-fundo)',
    destaqueLinha: 'var(--p-destaque-linha)',

    /** Matiz cercado: gráfico e barra de dado. Nunca cromo nem etiqueta. */
    dado: 'var(--p-dado)',
    dadoTrilho: 'var(--p-dado-trilho)',
  },

  /**
   * Estado é um TRIO. Nunca use só o texto: fundo, linha e texto viajam
   * juntos, senão viram duas cores diferentes em dois arquivos.
   */
  estado: {
    sucesso: {
      fundo: 'var(--p-sucesso-fundo)',
      linha: 'var(--p-sucesso-linha)',
      tinta: 'var(--p-sucesso-tinta)',
    },
    alerta: {
      fundo: 'var(--p-alerta-fundo)',
      linha: 'var(--p-alerta-linha)',
      tinta: 'var(--p-alerta-tinta)',
    },
    erro: {
      fundo: 'var(--p-erro-fundo)',
      linha: 'var(--p-erro-linha)',
      tinta: 'var(--p-erro-tinta)',
    },
  },

  fonte: {
    corpo: 'var(--p-fonte)',
    /** Só número. Rótulo usa a família do corpo em caixa alta. */
    mono: 'var(--p-fonte-mono)',
    /** Régua em px, nunca rem — ver o topo de tokens.css. */
    tamanho: {
      xs: 'var(--p-t-xs)',
      sm: 'var(--p-t-sm)',
      md: 'var(--p-t-md)',
      lg: 'var(--p-t-lg)',
      xl: 'var(--p-t-xl)',
      xxl: 'var(--p-t-2xl)',
    },
    peso: { normal: 400, medio: 500, forte: 600 },
  },

  raio: {
    xs: 'var(--p-r-xs)',
    sm: 'var(--p-r-sm)',
    md: 'var(--p-r-md)',
    lg: 'var(--p-r-lg)',
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

  /** Densidade medida no Salesforce: linha de 35px, célula de 8px, corpo 13px. */
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
export type NomeDeEstado = keyof typeof TEMA.estado;
