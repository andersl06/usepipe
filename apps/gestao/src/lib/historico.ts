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
import { consultar, type Janela } from './banco';
import { ticketDe } from './monitoramento';

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

export async function carregarCatalogos(): Promise<Catalogos> {
  return consultar(async (tx) => ({
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
  janela: Janela,
  filtro: FiltroHistorico = {},
): Promise<{ linhas: LinhaHistorico[]; truncado: boolean }> {
  return consultar(async (tx) => {
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
