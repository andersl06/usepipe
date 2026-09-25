/**
 * O que a tela de leads sabe sem falar com o banco: rótulo, recorte,
 * agrupamento, ordenação e os tipos que atravessam a fronteira.
 *
 * Este arquivo existe por uma razão mecânica, não estética. A listagem tem uma
 * parte que roda no navegador (largura de coluna, seleção, ação em massa), e um
 * componente de cliente que importasse `leads.ts` arrastaria o driver do
 * Postgres para dentro do pacote do navegador — que é exatamente o erro que o
 * empacotador acusa como `Can't resolve 'fs'`.
 *
 * A regra: **nada aqui importa `@pipe/db` nem `./banco`.** O que precisa de
 * consulta mora em `leads.ts`, que importa daqui e reexporta o que a tela usa.
 */

/** O tipo cru vira rótulo aqui: `mudanca_fase` não é texto de tela. */
export const ROTULO_ACTIVITY: Record<string, string> = {
  nota: 'Nota',
  connection: 'Ligação',
  reuniao: 'Reunião',
  email: 'E-mail',
  conversation: 'Conversa',
  tarefa: 'Tarefa',
  mudanca_fase: 'Mudança de fase',
};

/** O status cru vira rótulo aqui, uma vez só para a listagem e para a ficha. */
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

/** A listagem é tela de trabalho, não de exportação. */
export const LIMITE_LISTA = 200;

export interface LinhaLead {
  id: string;
  nome: string;
  origem: string | null;
  score: number | null;
  faixa: string | null;
  queue: string | null;
  proprietario: string | null;
  /** O id do dono. A listagem edita por id; o nome é só o que ela mostra. */
  proprietarioId: string | null;
  status: string;
  fase: string | null;
  diasNaFase: number | null;
  ultimaActivity: Date | null;
  ultimaActivityTipo: string | null;
}

export interface Proprietario {
  id: string;
  name: string;
}

/**
 * Como agrupar a lista. É o que substitui os quatro relatórios que eram item de
 * menu: "por proprietário" e "origem e campanha" são a mesma lista, dobrada por
 * uma coluna. Relatório que é recorte de lista mora na lista.
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
 * Qual coluna da tabela o cabeçalho do grupo já está dizendo.
 *
 * Lista agrupada por proprietário com uma coluna "Proprietário" repete o mesmo
 * nome em cada linha do grupo: é largura gasta para dizer o que o cabeçalho
 * acabou de dizer. As chaves do agrupamento e as das colunas são as mesmas de
 * propósito, e é o que mantém as duas listas casadas sem uma tabela de-para.
 */
export function groupingColumn(by: Grouping): string | null {
  return by === 'nenhum' ? null : by;
}

export interface Grupo {
  titulo: string;
  linhas: LinhaLead[];
}

/** Dobra a lista pela coluna escolhida, preservando a ordem de dentro do grupo. */
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

/* ------------------------------------------------------------- ordenação
 *
 * A ordenação acontece no BANCO, não na lista já carregada, e a diferença não
 * é de desempenho: é de resposta. A listagem tem teto de 200 linhas. Ordenar as
 * 200 já buscadas responde "os 200 leads mais novos, dispostos por score";
 * ordenar no banco responde "os 200 leads de maior score", que é a pergunta que
 * alguém faz ao clicar em Score.
 *
 * `Fila` e `Última atividade` não entram: a primeira é derivada da faixa por um
 * mapa em memória e a segunda vem de uma segunda consulta. Ordenar por elas
 * exigiria mudar as duas para junção, e nenhuma responde nada que Faixa e Dias
 * na fase já não respondam. Coluna que não ordena simplesmente não vira link,
 * e não existe cabeçalho apagado aqui.
 *
 * Aqui ficam só os NOMES. A tradução de nome para coluna do Postgres mora em
 * `leads.ts`, porque é ela que precisa do esquema.
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

export function columnOrdenavel(key: string): boolean {
  return ORDENAVEIS.some((o) => o === key);
}

/* --------------------------------------------------------- filtro por coluna
 *
 * O filtro vive na URL, como a ordenação e o agrupamento, e por isso **a visão
 * salva o guarda de graça**: a visão é um nome dado a uma consulta, e o filtro
 * já é parte dela. Foi a razão de ele não virar estado de componente.
 *
 * O prefixo `f.` separa o filtro do resto dos parâmetros sem uma lista de nomes
 * reservados: `f.origem=Anúncio Meta` é filtro, `origem` não seria — e amanhã
 * uma coluna nova entra sem risco de colidir com `aba`, `q` ou `dir`.
 *
 * Quatro colunas, e são as categóricas. Score e Dias na fase pedem faixa ("de
 * 60 a 80"), que é outro controle e outra conversa; texto livre já é a busca.
 * Coluna que não filtra simplesmente não aparece no menu.
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
 * O valor que representa "em branco".
 *
 * Filtrar por "sem proprietário" é uma das perguntas mais feitas da tela, e uma
 * string vazia na URL some no caminho — `?f.proprietario=` volta como `''` em
 * alguns navegadores e como ausente em outros. Uma palavra explícita não some.
 */
export const WITHOUT_VALUE = '—';

export function filterValid(key: string): key is FilterKey {
  return FILTRAVEIS.some((f) => f.key === key);
}

/** Lê os `f.*` do que veio na URL, jogando fora o que não é coluna filtrável. */
export function readFilters(params: Record<string, string | string[] | undefined>): SFilter {
  const saida: SFilter = {};
  for (const [key, value] of Object.entries(params)) {
    if (!key.startsWith('f.')) continue;
    const column = key.slice(2);
    // Um parâmetro repetido vira array; o primeiro vale, porque o filtro é de
    // um valor só e dois valores para a mesma coluna é URL adulterada.
    const texto = Array.isArray(value) ? value[0] : value;
    if (filterValid(column) && texto !== undefined && texto !== '') saida[column] = texto;
  }
  return saida;
}

/** Escreve os filtros de volta numa consulta, no mesmo formato que se lê. */
export function escreverFilters(p: URLSearchParams, filters: SFilter): URLSearchParams {
  for (const { key } of FILTRAVEIS) {
    const value = filters[key];
    if (value === undefined) p.delete(`f.${key}`);
    else p.set(`f.${key}`, value);
  }
  return p;
}

/** O texto do chip: "Origem: Anúncio Meta", ou "Origem: sem origem". */
export function filterRotulo(key: FilterKey, value: string): string {
  const rotulo = FILTRAVEIS.find((f) => f.key === key)?.rotulo ?? key;
  return `${rotulo}: ${value === WITHOUT_VALUE ? 'em branco' : value}`;
}

/**
 * Para que lado a coluna começa quando ninguém a ordenou ainda.
 *
 * Número começa no maior (o score alto é o que interessa), texto começa no A.
 * Clicar em "Proprietário" e receber a lista do Z ao A é a coisa que faz a
 * pessoa clicar duas vezes em toda coluna nova.
 */
export function directionInitial(key: string): Direction {
  return key === 'score' || key === 'dias' ? 'desc' : 'asc';
}
