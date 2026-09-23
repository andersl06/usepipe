import type { StatusEncerramento } from '@pipe/core';

/**
 * Histórico de conversas encerradas.
 *
 * Mesma regra do monitoramento: o status e os tempos vêm de `evento_atendimento`
 * pelo `@pipe/core`, nunca do campo mutável da conversa.
 */

export interface LinhaHistorico {
  id: string;
  ticket: string;
  contatoNome: string;
  filaNome: string | null;
  atendenteNome: string | null;
  encerradaEm: string | null;
  status: StatusEncerramento | null;
  esperaSeg: number | null;
  primeiraRespostaSeg: number | null;
  atendimentoSeg: number | null;
  etiquetas: string[];
}

export interface FiltroHistorico {
  filaId?: string | undefined;
  atendenteId?: string | undefined;
  etiquetaId?: string | undefined;
}

export interface Catalogos {
  filas: { id: string; nome: string }[];
  atendentes: { id: string; nome: string }[];
  etiquetas: { id: string; nome: string }[];
}

/** Teto de linhas: o histórico é uma tela de consulta, não de exportação. */
export const LIMITE_HISTORICO = 200;

/** Descarta seleções que não pertencem mais ao resultado visível. */
export function reconciliarMarcados(
  marcados: ReadonlySet<string>,
  idsVisiveis: readonly string[],
): ReadonlySet<string> {
  const visiveis = new Set(idsVisiveis);
  if ([...marcados].every((id) => visiveis.has(id))) return marcados;
  return new Set([...marcados].filter((id) => visiveis.has(id)));
}

/** Selecionar todos atua apenas sobre a lista corrente, inclusive após mudar filtros. */
export function alternarTodosVisiveis(
  marcados: ReadonlySet<string>,
  idsVisiveis: readonly string[],
): ReadonlySet<string> {
  const atuais = reconciliarMarcados(marcados, idsVisiveis);
  if (idsVisiveis.length === 0 || idsVisiveis.every((id) => atuais.has(id))) return new Set();
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
export const AGRUPAMENTOS = [
  { chave: 'nenhum', rotulo: 'Sem agrupamento' },
  { chave: 'fila', rotulo: 'Fila' },
  { chave: 'atendente', rotulo: 'Atendente' },
  { chave: 'status', rotulo: 'Desfecho' },
  { chave: 'etiqueta', rotulo: 'Etiqueta' },
] as const;

export type Agrupamento = (typeof AGRUPAMENTOS)[number]['chave'];

export function agrupamentoValido(valor: string | undefined): Agrupamento {
  return (AGRUPAMENTOS.find((a) => a.chave === valor)?.chave ?? 'nenhum') as Agrupamento;
}

export interface GrupoHistorico {
  titulo: string;
  linhas: LinhaHistorico[];
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
export function agruparHistorico(
  linhas: readonly LinhaHistorico[],
  por: Agrupamento,
): GrupoHistorico[] {
  if (por === 'nenhum') return [{ titulo: '', linhas: [...linhas] }];

  const chavesDe = (l: LinhaHistorico): string[] => {
    if (por === 'fila') return [l.filaNome ?? 'Sem fila'];
    if (por === 'atendente') return [l.atendenteNome ?? 'Sem atendente'];
    if (por === 'status') {
      return [l.status ? (ROTULO_DESFECHO[l.status] ?? l.status) : 'Sem desfecho'];
    }
    return l.etiquetas.length > 0 ? l.etiquetas : ['Sem etiqueta'];
  };

  const mapa = new Map<string, LinhaHistorico[]>();
  for (const l of linhas) {
    for (const chave of chavesDe(l)) {
      const atual = mapa.get(chave);
      if (atual) atual.push(l);
      else mapa.set(chave, [l]);
    }
  }
  return [...mapa.entries()]
    .map(([titulo, dela]) => ({ titulo, linhas: dela }))
    .sort((a, b) => b.linhas.length - a.linhas.length);
}
