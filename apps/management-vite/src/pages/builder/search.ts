import type { Block, Mapa } from './model';
import { cardsOf } from './conteudo';

/**
 * Builder search (magnifier) matches Blip's floating filter: normalize the typed term and the
 * candidate texts the same way (NFD without diacritics, lowercase), then a plain substring
 * check — never a `RegExp` built from user input (search never matches by id).
 */

export const SEARCH_FIELDS = ['title', 'tags', 'content', 'actions', 'output'] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];

export interface ParsedSearch {
  campo: SearchField | null;
  termo: string;
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
    .replace(/\s+/g, ' ');
}

/** `title: Início` -> `{ campo: 'title', termo: 'inicio' }`; no prefix -> `{ campo: null, termo }`. */
export function parseSearch(texto: string): ParsedSearch {
  const bruto = texto.trim();
  const minusculo = bruto.toLocaleLowerCase('pt-BR');
  for (const campo of SEARCH_FIELDS) {
    const prefixo = `${campo}:`;
    if (minusculo.startsWith(prefixo)) {
      return { campo, termo: normalizar(bruto.slice(prefixo.length)) };
    }
  }
  return { campo: null, termo: normalizar(bruto) };
}

const titleTexts = (block: Block): string[] => [block.$title ?? ''];

const tagTexts = (block: Block): string[] =>
  (block.$tags ?? [])
    .map((tag) => (tag as { label?: unknown }).label)
    .filter((label): label is string => typeof label === 'string');

const outputTexts = (block: Block): string[] => {
  const textos: string[] = [];
  for (const saida of block.$conditionOutputs ?? []) {
    for (const condicao of saida.conditions ?? []) {
      if (condicao.variable) textos.push(condicao.variable);
      for (const valor of condicao.values ?? []) textos.push(valor);
    }
  }
  return textos;
};

/** Flatten string values from an action's `settings`, whatever its shape (catalog field or imported). */
function stringValuesOf(valor: unknown): string[] {
  if (typeof valor === 'string') return [valor];
  if (Array.isArray(valor)) return valor.flatMap(stringValuesOf);
  if (valor && typeof valor === 'object') return Object.values(valor).flatMap(stringValuesOf);
  return [];
}

const actionTexts = (block: Block): string[] => {
  const textos: string[] = [];
  for (const acao of [...(block.$enteringCustomActions ?? []), ...(block.$leavingCustomActions ?? [])]) {
    if (acao.$title) textos.push(acao.$title);
    textos.push(...stringValuesOf(acao.settings));
  }
  return textos;
};

const contentTexts = (block: Block): string[] => {
  const textos: string[] = [];
  for (const cartao of cardsOf(block)) {
    switch (cartao.tipo) {
      case 'texto':
      case 'pedirLocalizacao':
      case 'webLink':
        textos.push(cartao.texto);
        break;
      case 'menu':
      case 'quickReply':
        textos.push(cartao.texto, ...cartao.options.map((opcao) => opcao.text));
        break;
      case 'dinamico':
        textos.push(cartao.variavel);
        break;
      case 'midia':
        textos.push(cartao.legenda);
        break;
      default:
        break;
    }
  }
  return textos;
};

const TEXTS_BY_FIELD: Record<SearchField, (block: Block) => string[]> = {
  title: titleTexts,
  tags: tagTexts,
  content: contentTexts,
  actions: actionTexts,
  output: outputTexts,
};

/**
 * Whether `block` matches `parsed`: with a field prefix, only that field is searched; without
 * one, title, tags, output conditions, actions and content are all searched. Never the id.
 */
export function matchBlock(block: Block, parsed: ParsedSearch): boolean {
  if (!parsed.termo) return true;
  const listas = parsed.campo
    ? [TEXTS_BY_FIELD[parsed.campo](block)]
    : SEARCH_FIELDS.map((campo) => TEXTS_BY_FIELD[campo](block));
  return listas.some((lista) => lista.some((texto) => normalizar(texto).includes(parsed.termo)));
}

/** Blip filters only after typing stops: `debouncedMakeSearch = debounce(makeSearch, 500)`. */
export const SEARCH_DEBOUNCE_MS = 500;

/**
 * Blip dims non-matches (`no-match-node`, opacity .2) and hides connectors (`hide-conns`) only
 * while `searchedStates.length > 0`, so a term that matches nothing leaves the canvas intact.
 */
export function isSearchDimming(matches: Set<string> | null): matches is Set<string> {
  return matches !== null && matches.size > 0;
}

/** Empty term -> `null` (no search active); term with no match -> empty `Set`. */
export function searchMatches(mapa: Mapa, texto: string): Set<string> | null {
  const parsed = parseSearch(texto);
  if (!parsed.termo) return null;
  const ids = new Set<string>();
  for (const block of Object.values(mapa)) {
    if (matchBlock(block, parsed)) ids.add(block.id);
  }
  return ids;
}
