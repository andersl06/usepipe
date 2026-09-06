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
export const ROTULO_ATIVIDADE: Record<string, string> = {
  nota: 'Nota',
  ligacao: 'Ligação',
  reuniao: 'Reunião',
  email: 'E-mail',
  conversa: 'Conversa',
  tarefa: 'Tarefa',
  mudanca_fase: 'Mudança de fase',
};

/** O status cru vira rótulo aqui, uma vez só para a listagem e para a ficha. */
export const ROTULO_STATUS: Record<string, string> = {
  novo: 'Novo',
  em_contato: 'Em contato',
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

export function abaValida(valor: string | undefined): Aba {
  return (ABAS.find((a) => a.chave === valor)?.chave ?? 'todos') as Aba;
}

/** A listagem é tela de trabalho, não de exportação. */
export const LIMITE_LISTA = 200;

export interface LinhaLead {
  id: string;
  nome: string;
  origem: string | null;
  score: number | null;
  faixa: string | null;
  fila: string | null;
  proprietario: string | null;
  status: string;
  fase: string | null;
  diasNaFase: number | null;
  ultimaAtividade: Date | null;
  ultimaAtividadeTipo: string | null;
}

export interface Proprietario {
  id: string;
  nome: string;
}

/**
 * Como agrupar a lista. É o que substitui os quatro relatórios que eram item de
 * menu: "por proprietário" e "origem e campanha" são a mesma lista, dobrada por
 * uma coluna. Relatório que é recorte de lista mora na lista.
 */
export const AGRUPAMENTOS = [
  { chave: 'nenhum', rotulo: 'Sem agrupamento' },
  { chave: 'proprietario', rotulo: 'Proprietário' },
  { chave: 'origem', rotulo: 'Origem' },
  { chave: 'fase', rotulo: 'Fase' },
  { chave: 'faixa', rotulo: 'Faixa de score' },
] as const;

export type Agrupamento = (typeof AGRUPAMENTOS)[number]['chave'];

export function agrupamentoValido(valor: string | undefined): Agrupamento {
  return (AGRUPAMENTOS.find((a) => a.chave === valor)?.chave ?? 'nenhum') as Agrupamento;
}

/**
 * Qual coluna da tabela o cabeçalho do grupo já está dizendo.
 *
 * Lista agrupada por proprietário com uma coluna "Proprietário" repete o mesmo
 * nome em cada linha do grupo: é largura gasta para dizer o que o cabeçalho
 * acabou de dizer. As chaves do agrupamento e as das colunas são as mesmas de
 * propósito, e é o que mantém as duas listas casadas sem uma tabela de-para.
 */
export function colunaDoAgrupamento(por: Agrupamento): string | null {
  return por === 'nenhum' ? null : por;
}

export interface Grupo {
  titulo: string;
  linhas: LinhaLead[];
}

/** Dobra a lista pela coluna escolhida, preservando a ordem de dentro do grupo. */
export function agrupar(linhas: LinhaLead[], por: Agrupamento): Grupo[] {
  if (por === 'nenhum') return [{ titulo: '', linhas }];
  const chaveDe = (l: LinhaLead) =>
    por === 'proprietario'
      ? (l.proprietario ?? 'Sem proprietário')
      : por === 'origem'
        ? (l.origem ?? 'Sem origem')
        : por === 'fase'
          ? (l.fase ?? 'Sem fase')
          : (l.faixa ?? 'Sem score');

  const mapa = new Map<string, LinhaLead[]>();
  for (const l of linhas) {
    const chave = chaveDe(l);
    const atual = mapa.get(chave);
    if (atual) atual.push(l);
    else mapa.set(chave, [l]);
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

export type Ordem = (typeof ORDENAVEIS)[number] | 'nenhuma';
export type Direcao = 'asc' | 'desc';

export function ordemValida(valor: string | undefined): Ordem {
  return ORDENAVEIS.find((o) => o === valor) ?? 'nenhuma';
}

export function direcaoValida(valor: string | undefined): Direcao {
  return valor === 'asc' ? 'asc' : 'desc';
}

export function colunaOrdenavel(chave: string): boolean {
  return ORDENAVEIS.some((o) => o === chave);
}

/**
 * Para que lado a coluna começa quando ninguém a ordenou ainda.
 *
 * Número começa no maior (o score alto é o que interessa), texto começa no A.
 * Clicar em "Proprietário" e receber a lista do Z ao A é a coisa que faz a
 * pessoa clicar duas vezes em toda coluna nova.
 */
export function direcaoInicial(chave: string): Direcao {
  return chave === 'score' || chave === 'dias' ? 'desc' : 'asc';
}
