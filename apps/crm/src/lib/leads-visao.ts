/**
 * What the leads screen knows without talking to the database: label, slice,
 * grouping, sorting, and the types that cross the boundary.
 *
 * This file exists for a mechanical reason, not an aesthetic one. The listing
 * has a part that runs in the browser (column width, selection, bulk action),
 * and a client component that imported `leads.ts` would drag the Postgres
 * driver into the browser package — exactly the error the bundler flags as
 * `Can't resolve 'fs'`.
 *
 * The rule: **nothing here imports `@pipe/db` or `./banco`.** Whatever needs a
 * query lives in `leads.ts`, which imports from here and re-exports what the
 * screen uses.
 */

/** The raw type becomes a label here: `mudanca_fase` isn't screen text. */
export const LABEL_ACTIVITY: Record<string, string> = {
  nota: 'Nota',
  connection: 'Ligação',
  reuniao: 'Reunião',
  email: 'E-mail',
  conversation: 'Conversa',
  tarefa: 'Tarefa',
  mudanca_fase: 'Mudança de fase',
};

/** The raw status becomes a label here, once, for both the listing and the record. */
export const ROTULO_STATUS: Record<string, string> = {
  novo: 'Novo',
  inContact: 'Em contato',
  qualificado: 'Qualificado',
  convertido: 'Convertido',
  desqualificado: 'Desqualificado',
};

export const ABAS = [
  { chave: 'todos', rotulo: 'Todos' },
  { chave: 'novos', rotulo: 'Novos' },
  { chave: 'qualificados', rotulo: 'Qualificados' },
  { chave: 'sem-proprietario', rotulo: 'Sem proprietário' },
  { chave: 'parados', rotulo: 'Parados há 7 dias' },
  { chave: 'desqualificados', rotulo: 'Desqualificados' },
] as const;

export type Aba = (typeof ABAS)[number]['chave'];

export function abaValida(value: string | undefined): Aba {
  return (ABAS.find((a) => a.chave === value)?.chave ?? 'todos') as Aba;
}

/** The listing is a work screen, not an export screen. */
export const LIMITE_LISTA = 200;

export interface LinhaLead {
  id: string;
  nome: string;
  origem: string | null;
  score: number | null;
  faixa: string | null;
  queue: string | null;
  proprietario: string | null;
  /** The owner's id. The listing edits by id; the name is only what it displays. */
  proprietarioId: string | null;
  status: string;
  fase: string | null;
  diasNaFase: number | null;
  lastActivity: Date | null;
  lastActivityType: string | null;
}

export interface Proprietario {
  id: string;
  name: string;
}

/**
 * How to group the list. It's what replaces the four reports that used to be
 * menu items: "by owner" and "source and campaign" are the same list, folded
 * by one column. A report that's just a list slice belongs in the list.
 */
export const GROUPINGS = [
  { chave: 'nenhum', rotulo: 'Sem agrupamento' },
  { chave: 'proprietario', rotulo: 'Proprietário' },
  { chave: 'origem', rotulo: 'Origem' },
  { chave: 'fase', rotulo: 'Fase' },
  { chave: 'faixa', rotulo: 'Faixa de score' },
] as const;

export type Grouping = (typeof GROUPINGS)[number]['chave'];

export function groupingValid(value: string | undefined): Grouping {
  return (GROUPINGS.find((a) => a.chave === value)?.chave ?? 'nenhum') as Grouping;
}

/**
 * Which table column the group header is already stating.
 *
 * A list grouped by owner with an "Owner" column repeats the same name on every
 * row of the group: it's width spent saying what the header just said. The
 * grouping keys and the column keys are the same on purpose, which is what
 * keeps the two lists matched without a lookup table.
 */
export function groupingColumn(by: Grouping): string | null {
  return by === 'nenhum' ? null : by;
}

export interface Grupo {
  titulo: string;
  linhas: LinhaLead[];
}

/** Folds the list by the chosen column, preserving the order within each group. */
export function agrupar(linhas: LinhaLead[], by: Grouping): Grupo[] {
  if (by === 'nenhum') return [{ titulo: '', linhas }];
  const keyOf = (l: LinhaLead) =>
    by === 'proprietario'
      ? (l.proprietario ?? 'Sem proprietário')
      : by === 'origem'
        ? (l.origem ?? 'Sem origem')
        : by === 'fase'
          ? (l.fase ?? 'Sem fase')
          : (l.faixa ?? 'Sem score');

  const mapa = new Map<string, LinhaLead[]>();
  for (const l of linhas) {
    const key = keyOf(l);
    const atual = mapa.get(key);
    if (atual) atual.push(l);
    else mapa.set(key, [l]);
  }
  return [...mapa.entries()]
    .map(([titulo, dela]) => ({ titulo, linhas: dela }))
    .sort((a, b) => b.linhas.length - a.linhas.length);
}

/*
 * ------------------------------------------------------------- sorting
 *
 * Sorting happens in the DATABASE, not on the already-loaded list, and the
 * difference isn't performance: it's correctness. The listing caps at 200
 * rows. Sorting the 200 already fetched answers "the 200 newest leads,
 * arranged by score"; sorting in the database answers "the 200
 * highest-scoring leads", which is the question someone is asking by clicking
 * Score.
 *
 * `Fila` and `Última atividade` aren't included: the first is derived from the
 * band through an in-memory map and the second comes from a second query.
 * Sorting by them would require turning both into a join, and neither answers
 * anything Band and Days in stage don't already answer. A column that doesn't
 * sort simply doesn't become a link, and there's no grayed-out header here.
 *
 * Only the NAMES live here. Translating a name into a Postgres column lives in
 * `leads.ts`, because that's what needs the schema.
 */
export const ORDENAVEIS = [
  'lead',
  'origem',
  'score',
  'faixa',
  'proprietario',
  'fase',
  'dias',
] as const;

export type Order = (typeof ORDENAVEIS)[number] | 'nenhuma';
export type Direction = 'asc' | 'desc';

export function orderValid(value: string | undefined): Order {
  return ORDENAVEIS.find((o) => o === value) ?? 'nenhuma';
}

export function directionValid(value: string | undefined): Direction {
  return value === 'asc' ? 'asc' : 'desc';
}

export function columnSortable(key: string): boolean {
  return ORDENAVEIS.some((o) => o === key);
}

/*
 * --------------------------------------------------------- per-column filter
 *
 * The filter lives in the URL, like sorting and grouping, and that's why **the
 * saved view keeps it for free**: a view is a name given to a query, and the
 * filter is already part of it. That's why it never became component state.
 *
 * The `f.` prefix separates the filter from the rest of the parameters without
 * a reserved-name list: `f.origem=Anúncio Meta` is a filter, `origem` wouldn't
 * be — and tomorrow a new column can be added with no risk of colliding with
 * `aba`, `q`, or `dir`.
 *
 * Four columns, and they're the categorical ones. Score and Days in stage ask
 * for a range ("60 to 80"), which is a different control and a different
 * conversation; free text is already the search. A column that doesn't filter
 * simply doesn't show up in the menu.
 */
export const FILTRAVEIS = [
  { key: 'origem', rotulo: 'Origem' },
  { key: 'faixa', rotulo: 'Faixa de score' },
  { key: 'fase', rotulo: 'Fase' },
  { key: 'proprietario', rotulo: 'Proprietário' },
] as const;

export type FilterKey = (typeof FILTRAVEIS)[number]['key'];

/** Coluna filtrada → valor exigido. `SEM_VALOR` pede as linhas em branco. */
export type SFilter = Partial<Record<FilterKey, string>>;

/**
 * The value that represents "blank".
 *
 * Filtering by "no owner" is one of the screen's most common questions, and an
 * empty string in the URL disappears along the way — `?f.proprietario=` comes
 * back as `''` in some browsers and as absent in others. An explicit word
 * doesn't disappear.
 */
export const WITHOUT_VALUE = '—';

export function filterValid(key: string): key is FilterKey {
  return FILTRAVEIS.some((f) => f.key === key);
}

/** Reads the `f.*` params from the URL, discarding anything that isn't a filterable column. */
export function readFilters(params: Record<string, string | string[] | undefined>): SFilter {
  const saida: SFilter = {};
  for (const [key, value] of Object.entries(params)) {
    if (!key.startsWith('f.')) continue;
    const column = key.slice(2);
    // A repeated parameter becomes an array; the first one counts, because the filter is for
    // a single value, and two values for the same column is a tampered URL.
    const texto = Array.isArray(value) ? value[0] : value;
    if (filterValid(column) && texto !== undefined && texto !== '') saida[column] = texto;
  }
  return saida;
}

/** Writes the filters back into a query, in the same format they're read in. */
export function writeFilters(p: URLSearchParams, filters: SFilter): URLSearchParams {
  for (const { key } of FILTRAVEIS) {
    const value = filters[key];
    if (value === undefined) p.delete(`f.${key}`);
    else p.set(`f.${key}`, value);
  }
  return p;
}

/** The chip's text: "Source: Meta Ad", or "Source: no source". */
export function filterLabel(key: FilterKey, value: string): string {
  const rotulo = FILTRAVEIS.find((f) => f.key === key)?.rotulo ?? key;
  return `${rotulo}: ${value === WITHOUT_VALUE ? 'em branco' : value}`;
}

/**
 * Which direction a column starts in when nobody has sorted it yet.
 *
 * A number starts at the highest (a high score is what matters), text starts
 * at A. Clicking "Owner" and getting the list from Z to A is what makes
 * someone click every new column twice.
 */
export function directionInitial(key: string): Direction {
  return key === 'score' || key === 'dias' ? 'desc' : 'asc';
}
