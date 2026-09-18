import { and, desc, eq, gte, inArray, isNotNull, lt } from 'drizzle-orm';
import {
  classificarEncerramento,
  derivarMarcos,
  segundosEntre,
  type ConversaEventos,
  type EncerradaPor,
  type EventoAtendimento,
  type StatusEncerramento,
  type TipoEvento,
} from '@pipe/core';
import {
  contato,
  conversa,
  conversaEtiqueta,
  etiqueta,
  eventoAtendimento,
  fila,
  usuario,
} from '@pipe/db/schema';
import type { TransacaoPipe } from '@pipe/db';
import type { Janela } from './janela.js';
import { ticketDe } from './monitoramento.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransacaoPipe, fn: (tx: TransacaoPipe) => Promise<T>): Promise<T> =>
  fn(tx);

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
  encerradaEm: Date | null;
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

export async function carregarCatalogos(tx: TransacaoPipe): Promise<Catalogos> {
  return consultar(tx, async (tx) => ({
    filas: await tx.select({ id: fila.id, nome: fila.nome }).from(fila).orderBy(fila.ordem),
    atendentes: await tx
      .select({ id: usuario.id, nome: usuario.nome })
      .from(usuario)
      .where(eq(usuario.ativo, true))
      .orderBy(usuario.nome),
    etiquetas: await tx
      .select({ id: etiqueta.id, nome: etiqueta.nome })
      .from(etiqueta)
      .orderBy(etiqueta.nome),
  }));
}

export async function carregarHistorico(
  tx: TransacaoPipe,
  janela: Janela,
  filtro: FiltroHistorico = {},
): Promise<{ linhas: LinhaHistorico[]; truncado: boolean }> {
  return consultar(tx, async (tx) => {
    const recorte = [
      filtro.filaId ? eq(conversa.filaId, filtro.filaId) : undefined,
      filtro.atendenteId ? eq(conversa.atendenteId, filtro.atendenteId) : undefined,
    ].filter((c) => c !== undefined);

    const base = tx
      .select({
        id: conversa.id,
        encerradaEm: conversa.encerradaEm,
        filaNome: fila.nome,
        atendenteNome: usuario.nome,
        contatoNome: contato.nome,
      })
      .from(conversa)
      .leftJoin(fila, eq(fila.id, conversa.filaId))
      .leftJoin(usuario, eq(usuario.id, conversa.atendenteId))
      .leftJoin(contato, eq(contato.id, conversa.contatoId));

    const comEtiqueta = filtro.etiquetaId
      ? base.innerJoin(
          conversaEtiqueta,
          and(
            eq(conversaEtiqueta.conversaId, conversa.id),
            eq(conversaEtiqueta.etiquetaId, filtro.etiquetaId),
          ),
        )
      : base;

    const cru = await comEtiqueta
      .where(
        and(
          isNotNull(conversa.encerradaEm),
          gte(conversa.encerradaEm, janela.inicio),
          lt(conversa.encerradaEm, janela.fim),
          ...recorte,
        ),
      )
      .orderBy(desc(conversa.encerradaEm))
      .limit(LIMITE_HISTORICO + 1);

    const truncado = cru.length > LIMITE_HISTORICO;
    const pagina = cru.slice(0, LIMITE_HISTORICO);
    const ids = pagina.map((c) => c.id);
    if (ids.length === 0) return { linhas: [], truncado: false };

    const eventos = await tx
      .select({
        conversaId: eventoAtendimento.conversaId,
        tipo: eventoAtendimento.tipo,
        em: eventoAtendimento.em,
        usuarioId: eventoAtendimento.usuarioId,
        dados: eventoAtendimento.dados,
      })
      .from(eventoAtendimento)
      .where(inArray(eventoAtendimento.conversaId, ids));

    const porConversa = new Map<string, EventoAtendimento[]>();
    for (const e of eventos) {
      const dados = (e.dados ?? {}) as { encerrada_por?: string };
      const evento: EventoAtendimento = {
        conversaId: e.conversaId,
        tipo: e.tipo as TipoEvento,
        em: e.em,
        usuarioId: e.usuarioId,
        encerradaPor: (dados.encerrada_por ?? null) as EncerradaPor | null,
      };
      const atual = porConversa.get(e.conversaId);
      if (atual) atual.push(evento);
      else porConversa.set(e.conversaId, [evento]);
    }

    const etiquetasPorConversa = new Map<string, string[]>();
    for (const l of await tx
      .select({ conversaId: conversaEtiqueta.conversaId, nome: etiqueta.nome })
      .from(conversaEtiqueta)
      .innerJoin(etiqueta, eq(etiqueta.id, conversaEtiqueta.etiquetaId))
      .where(inArray(conversaEtiqueta.conversaId, ids))) {
      const atual = etiquetasPorConversa.get(l.conversaId);
      if (atual) atual.push(l.nome);
      else etiquetasPorConversa.set(l.conversaId, [l.nome]);
    }

    const diferenca = (a: Date | null, b: Date | null) => {
      if (!a || !b) return null;
      const s = segundosEntre(a, b);
      return s < 0 ? null : s;
    };

    const linhas: LinhaHistorico[] = pagina.map((c) => {
      const entrada: ConversaEventos = { conversaId: c.id, eventos: porConversa.get(c.id) ?? [] };
      const marcos = derivarMarcos(entrada);
      return {
        id: c.id,
        ticket: ticketDe(c.id),
        contatoNome: c.contatoNome ?? 'Contato sem nome',
        filaNome: c.filaNome,
        atendenteNome: c.atendenteNome,
        encerradaEm: marcos.encerradaEm ?? c.encerradaEm,
        status: classificarEncerramento(marcos),
        // Espera total do cliente: com resposta, até ela; sem resposta, até o fim.
        esperaSeg: marcos.primeiraRespostaEm
          ? diferenca(marcos.criadaEm, marcos.primeiraRespostaEm)
          : diferenca(marcos.criadaEm, marcos.encerradaEm),
        primeiraRespostaSeg: diferenca(marcos.atribuidaEm, marcos.primeiraRespostaEm),
        atendimentoSeg: diferenca(marcos.primeiraRespostaEm, marcos.encerradaEm),
        etiquetas: etiquetasPorConversa.get(c.id) ?? [],
      };
    });

    return { linhas, truncado };
  });
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
