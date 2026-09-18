/**
 * As regras do sidebar "Novo modelo de mensagem" — o controlador
 * `CreateMessageTemplateSidebarController` (`dD`) de portal.js, sem a tela.
 * Puras de propósito: `tests/conteudos-regras.test.ts` trava o que sai daqui.
 */

/** `oD`: TEXT, IMAGE, DOCUMENT, VIDEO, PAYMENT, CAROUSEL — e `default` antes da escolha. */
export const TIPOS_DE_CONTEUDO = [
  'texto',
  'imagem',
  'documento',
  'video',
  'pagamento',
  'carrossel',
] as const;
export type TipoDeConteudo = (typeof TIPOS_DE_CONTEUDO)[number];

/** `fillTemplateCategories` com `isNewestMessageTemplateCategoriesEnabled`: AUTHENTICATION, MARKETING, UTILITY. */
export const CATEGORIAS = ['autenticacao', 'marketing', 'utilidade'] as const;
export type Categoria = (typeof CATEGORIAS)[number];

/**
 * As flags que o `$onInit` consulta (`checkFeatures`). No Pipe, o schema de
 * `template_mensagem` aceita cabeçalho de imagem/vídeo/documento e não modela
 * pagamento nem carrossel — é daí que saem os padrões.
 */
export interface FlagsDoModelo {
  midia: boolean;
  video: boolean;
  pagamento: boolean;
  carrossel: boolean;
}
export const FLAGS_DO_PIPE: FlagsDoModelo = {
  midia: true,
  video: true,
  pagamento: false,
  carrossel: false,
};

/**
 * O `menu-list` do template, linha a linha, com os `ng-if` de cada bloco:
 *
 *   linha 1: text · image (isMediaMessageTemplateEnabled) · document (idem)
 *   linha 2: video (media && video) · payment (payment && isUtilityType) ·
 *            carousel (carousel)
 *
 * O bloco inteiro só existe com `messageTemplateType === 'default'`,
 * `!isAuthenticationType()` e `!isEmptyCategory()` — ver `mostrarEscolhaDeBloco`.
 */
export function blocosDoMenu(
  categoria: Categoria | '',
  flags: FlagsDoModelo = FLAGS_DO_PIPE,
): TipoDeConteudo[][] {
  const linha1: TipoDeConteudo[] = ['texto'];
  if (flags.midia) linha1.push('imagem', 'documento');
  const linha2: TipoDeConteudo[] = [];
  if (flags.midia && flags.video) linha2.push('video');
  if (flags.pagamento && categoria === 'utilidade') linha2.push('pagamento');
  if (flags.carrossel) linha2.push('carrossel');
  return linha2.length ? [linha1, linha2] : [linha1];
}

/** Compatibilidade: a lista achatada dos tipos que o menu oferece. */
export function tiposDisponiveis(
  categoria: string,
  flags: FlagsDoModelo = { ...FLAGS_DO_PIPE, pagamento: true, carrossel: true },
): TipoDeConteudo[] {
  return blocosDoMenu(categoria as Categoria, flags).flat();
}

/** `ng-if="$ctrl.messageTemplateType === 'default' && !isAuthenticationType() && !isEmptyCategory()"` */
export function mostrarEscolhaDeBloco(tipo: TipoDeConteudo | 'default', categoria: Categoria | '') {
  return tipo === 'default' && categoria !== 'autenticacao' && categoria !== '';
}

/**
 * `.back-button`: `ng-if="messageTemplateType !== 'default' && $index === 0 &&
 * !thereTranslations() && !isAuthenticationType()"`.
 */
export function mostrarVoltar(
  tipo: TipoDeConteudo | 'default',
  categoria: Categoria | '',
  totalDeTraducoes: number,
) {
  return tipo !== 'default' && totalDeTraducoes <= 1 && categoria !== 'autenticacao';
}

/** `isTemplateNameInvalid`: `/^[a-z]([a-z0-9_])*$/` e até 512 caracteres. */
export function erroDoNome(
  nome: string,
  existentes: readonly string[] = [],
): 'invalido' | 'usado' | 'comprido' | null {
  if (!/^[a-z]([a-z0-9_])*$/.test(nome)) return 'invalido';
  if (nome.length > 512) return 'comprido';
  if (existentes.includes(nome.trim())) return 'usado';
  return null;
}

export interface Traducao {
  idioma: string;
  texto: string;
}

/** `areTranslationsValid` para os tipos que o Pipe modela (texto e mídia exigem idioma + texto). */
export function traducoesValidas(
  tipo: TipoDeConteudo | 'default',
  categoria: Categoria | '',
  traducoes: readonly Traducao[],
) {
  if (categoria === 'autenticacao') return traducoes.every((t) => t.idioma);
  if (tipo === 'default') return false;
  return traducoes.every((t) => t.idioma && t.texto);
}

/** `invalidTranlationLanguages`: idioma repetido em outra tradução. */
export function idiomasRepetidos(traducoes: readonly Traducao[]): string[] {
  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const t of traducoes) {
    if (!t.idioma) continue;
    if (vistos.has(t.idioma)) repetidos.add(t.idioma);
    vistos.add(t.idioma);
  }
  return [...repetidos];
}

/** `isMessageTemplateValid`: nome ok, categoria, traduções e idiomas. */
export function modeloValido(dados: {
  nome: string;
  categoria: Categoria | '';
  tipo: TipoDeConteudo | 'default';
  traducoes: readonly Traducao[];
  existentes?: readonly string[];
}) {
  return (
    !!dados.nome &&
    erroDoNome(dados.nome, dados.existentes) === null &&
    !!dados.categoria &&
    traducoesValidas(dados.tipo, dados.categoria, dados.traducoes) &&
    idiomasRepetidos(dados.traducoes).length === 0
  );
}

/**
 * O que a lista mostra (`messagetemplate.html`): sem canal WhatsApp é o
 * `unavailable-warning`; com canal e sem modelos, o `no-results`; senão a lista.
 */
export function estadoDaLista(temWhatsapp: boolean, totalDeModelos: number) {
  if (!temWhatsapp) return 'indisponivel' as const;
  return totalDeModelos === 0 ? ('vazio' as const) : ('lista' as const);
}
