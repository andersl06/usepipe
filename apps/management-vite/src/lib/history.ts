import type { StatusClosure } from '@pipe/core';

/**
 * Histórico de conversas encerradas.
 *
 * Mesma regra do monitoramento: o status e os tempos vêm de `evento_atendimento`
 * pelo `@pipe/core`, nunca do campo mutável da conversa.
 */

export interface LinhaHistory {
  id: string;
  ticket: string;
  contactName: string;
  queueName: string | null;
  agentName: string | null;
  encerradaEm: string | null;
  status: StatusClosure | null;
  esperaSeg: number | null;
  firstRespostaSeg: number | null;
  attendanceSeg: number | null;
  etiquetas: string[];
}

export interface HistoryFilter {
  queueId?: string | undefined;
  agentId?: string | undefined;
  etiquetaId?: string | undefined;
}

export interface Catalogos {
  queues: { id: string; nome: string }[];
  agents: { id: string; nome: string }[];
  etiquetas: { id: string; nome: string }[];
}

/** Teto de linhas: o histórico é uma tela de consulta, não de exportação. */
export const HISTORY_LIMIT = 200;

/** Remove selections no longer present in the visible result. */
export function reconciliarMarcados(
  marcados: ReadonlySet<string>,
  idsVisiveis: readonly string[],
): ReadonlySet<string> {
  const visiveis = new Set(idsVisiveis);
  if ([...marcados].every((id) => visiveis.has(id))) return marcados;
  return new Set([...marcados].filter((id) => visiveis.has(id)));
}

/** Select all applies only to the current list, including after filters change. */
export function alternarTodosVisiveis(
  marcados: ReadonlySet<string>,
  idsVisiveis: readonly string[],
): ReadonlySet<string> {
  const current = reconciliarMarcados(marcados, idsVisiveis);
  if (idsVisiveis.length === 0 || idsVisiveis.every((id) => current.has(id))) return new Set();
  return new Set(idsVisiveis);
}

/**
 * Agrupamento da lista — o lugar onde "relatório" mora agora.
 *
 * Os seis itens mortos do grupo Relatórios prometiam exatamente estes recortes:
 * por fila, por atendente, por etiqueta, por desfecho. Nenhum deles precisa de
 * tela própria, porque é a mesma lista dobrada por uma coluna. É a régua da
 * MARCA: relatório vira tela só quando lê a operação por um eixo que a lista não
 * tem — o caso do Esforço, que conta caractere e áudio.
 *
 * A dobra é feita na página já carregada, e não no SQL, porque `carregarHistorico`
 * já tem teto de LIMITE_HISTORICO linhas: agrupar no banco daria grupos calculados
 * sobre um universo diferente do que a tela mostra, que é pior do que não agrupar.
 */
export const GROUPINGS = [
  { chave: 'nenhum', rotulo: 'Sem agrupamento' },
  { chave: 'fila', rotulo: 'Fila' },
  { chave: 'atendente', rotulo: 'Atendente' },
  { chave: 'status', rotulo: 'Desfecho' },
  { chave: 'etiqueta', rotulo: 'Etiqueta' },
] as const;

export type Grouping = (typeof GROUPINGS)[number]['chave'];

export function groupingValid(value: string | undefined): Grouping {
  return (GROUPINGS.find((a) => a.chave === value)?.chave ?? 'nenhum') as Grouping;
}

export interface GroupHistory {
  titulo: string;
  linhas: LinhaHistory[];
}

const ROTULO_DESFECHO: Record<string, string> = {
  perdida: 'Perdida',
  abandonada: 'Abandonada',
  finalizada: 'Finalizada',
  fechada: 'Fechada',
};

/**
 * Dobra a lista pela coluna escolhida, preservando a ordem de dentro do grupo.
 *
 * Por etiqueta a conversa aparece em cada etiqueta que tem: a soma dos grupos
 * passa do total de linhas de propósito, porque a pergunta ali é "quantas
 * conversas encostaram nesta etiqueta", não "como reparto o total".
 */
export function agruparHistory(
  linhas: readonly LinhaHistory[],
  by: Grouping,
): GroupHistory[] {
  if (by === 'nenhum') return [{ titulo: '', linhas: [...linhas] }];

  const chavesDe = (l: LinhaHistory): string[] => {
    if (by === 'fila') return [l.queueName ?? 'Sem fila'];
    if (by === 'atendente') return [l.agentName ?? 'Sem atendente'];
    if (by === 'status') {
      return [l.status ? (ROTULO_DESFECHO[l.status] ?? l.status) : 'Sem desfecho'];
    }
    return l.etiquetas.length > 0 ? l.etiquetas : ['Sem etiqueta'];
  };

  const mapa = new Map<string, LinhaHistory[]>();
  for (const l of linhas) {
    for (const key of chavesDe(l)) {
      const atual = mapa.get(key);
      if (atual) atual.push(l);
      else mapa.set(key, [l]);
    }
  }
  return [...mapa.entries()]
    .map(([titulo, dela]) => ({ titulo, linhas: dela }))
    .sort((a, b) => b.linhas.length - a.linhas.length);
}
