/**
 * Rules for the "New message template" sidebar — the origin's `CreateMessageTemplateSidebarController` (`dD`) from portal.js, without the screen. Pure by design: `tests/conteudos-regras.test.ts` locks down what comes out of here.
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
 * The flags `$onInit` checks (`checkFeatures`). In Pipe, the `template_mensagem` schema accepts an image/video/document header and does not model payment or carousel — that's where the defaults come from.
 */
export interface TemplateFlags {
  media: boolean;
  video: boolean;
  payment: boolean;
  carrossel: boolean;
}
export const FLAGS_DO_PIPE: TemplateFlags = {
  media: true,
  video: true,
  payment: false,
  carrossel: false,
};

/**
 * The template's `menu-list`, line by line, with each block's `ng-if`:
 *
 *   row 1: text · image (isMediaMessageTemplateEnabled) · document (same)
 *   row 2: video (media && video) · payment (payment && isUtilityType) · carousel (carousel)
 *
 * The whole block only exists when `messageTemplateType === 'default'`, `!isAuthenticationType()`, and `!isEmptyCategory()` — see `mostrarEscolhaDeBloco`.
 */
export function blocosDoMenu(
  categoria: Categoria | '',
  flags: TemplateFlags = FLAGS_DO_PIPE,
): TipoDeConteudo[][] {
  const linha1: TipoDeConteudo[] = ['texto'];
  if (flags.media) linha1.push('imagem', 'documento');
  const linha2: TipoDeConteudo[] = [];
  if (flags.media && flags.video) linha2.push('video');
  if (flags.payment && categoria === 'utilidade') linha2.push('pagamento');
  if (flags.carrossel) linha2.push('carrossel');
  return linha2.length ? [linha1, linha2] : [linha1];
}

/** `ng-if="$ctrl.messageTemplateType === 'default' && !isAuthenticationType() && !isEmptyCategory()"` */
export function blockShowChoice(tipo: TipoDeConteudo | 'default', categoria: Categoria | '') {
  return tipo === 'default' && categoria !== 'autenticacao' && categoria !== '';
}

/**
 * `.back-button`: `ng-if="messageTemplateType !== 'default' && $index === 0 &&
 * !thereTranslations() && !isAuthenticationType()"`.
 */
export function mostrarVoltar(
  tipo: TipoDeConteudo | 'default',
  categoria: Categoria | '',
  translationsTotal: number,
) {
  return tipo !== 'default' && translationsTotal <= 1 && categoria !== 'autenticacao';
}

/** `isTemplateNameInvalid`: `/^[a-z]([a-z0-9_])*$/` and up to 512 characters. */
export function nameError(
  nome: string,
  existentes: readonly string[] = [],
): 'invalido' | 'usado' | 'comprido' | null {
  if (!/^[a-z]([a-z0-9_])*$/.test(nome)) return 'invalido';
  if (nome.length > 512) return 'comprido';
  if (existentes.includes(nome.trim())) return 'usado';
  return null;
}

export interface Translation {
  idioma: string;
  texto: string;
  acoes?: readonly { texto: string; valor: string }[];
}

/** Ação com só um dos dois campos preenchidos; a totalmente vazia é ignorada no envio. */
export function actionIncomplete(a: { texto: string; valor: string }): boolean {
  return Boolean(a.texto.trim()) !== Boolean(a.valor.trim());
}

/** `areTranslationsValid` for the types Pipe models (text and media require language + text). */
export function translationsValid(
  tipo: TipoDeConteudo | 'default',
  categoria: Categoria | '',
  translations: readonly Translation[],
) {
  if (translations.some((t) => t.acoes?.some(actionIncomplete))) return false;
  if (categoria === 'autenticacao') return translations.every((t) => t.idioma);
  if (tipo === 'default') return false;
  return translations.every((t) => t.idioma && t.texto);
}

/** `invalidTranlationLanguages`: a language repeated in another translation. */
export function idiomasRepetidos(translations: readonly Translation[]): string[] {
  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const t of translations) {
    if (!t.idioma) continue;
    if (vistos.has(t.idioma)) repetidos.add(t.idioma);
    vistos.add(t.idioma);
  }
  return [...repetidos];
}

/** `isMessageTemplateValid`: name ok, category, translations, and languages. */
export function templateValid(data: {
  nome: string;
  categoria: Categoria | '';
  tipo: TipoDeConteudo | 'default';
  translations: readonly Translation[];
  existentes?: readonly string[];
}) {
  return (
    !!data.nome &&
    nameError(data.nome, data.existentes) === null &&
    !!data.categoria &&
    translationsValid(data.tipo, data.categoria, data.translations) &&
    idiomasRepetidos(data.translations).length === 0
  );
}

/**
 * What the list shows (`messagetemplate.html`): without a WhatsApp channel it's the `unavailable-warning`; with a channel and no templates, the `no-results`; otherwise the list.
 */
export function listState(temWhatsapp: boolean, totalDeModelos: number) {
  if (!temWhatsapp) return 'indisponivel' as const;
  return totalDeModelos === 0 ? ('vazio' as const) : ('lista' as const);
}
