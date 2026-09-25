import { and, asc, eq, gte, isNotNull, lt } from 'drizzle-orm';
import {
  calcularEffortConversation,
  calcularTimeInSession,
  occupancy,
  type EffortConversation,
  type MessageEffort,
} from '@pipe/core';
import { attachment, conversa as conversation, message, user } from '@pipe/db/schema';
import type { TransactionPipe as TransactionPipe } from '@pipe/db';
import type { Window } from './window.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransactionPipe, fn: (tx: TransactionPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/**
 * Relatório de esforço por atendente — §4.4 do desenho.
 *
 * A conta inteira é da régua de `packages/core/src/esforco/`: 200 char/min
 * escrito, 1.000 char/min lido, áudio em 1×, e o texto que veio de resposta
 * pronta ou template **fora** do esforço, em coluna separada. Aqui só se busca a
 * matéria-prima e se soma o que o core devolveu.
 */

export interface EffortOfAgent {
  id: string;
  name: string;
  tickets: number;
  effortSeg: number;
  /** Esforço ÷ tickets. Ponderado por construção (§5 da spec de métricas). */
  effortByTicketSeg: number | null;
  sessionSeg: number;
  occupancy: number | null;
  charsEscritos: number;
  charsLidos: number;
  audioOuvidoSeg: number;
  audioGravadoSeg: number;
  /** Texto que o atendente **não** digitou: resposta pronta e template. */
  charsDeRespostaPronta: number;
  /** O que esse texto acrescentaria ao esforço se fosse contado como digitação. */
  effortResponseReadySeg: number;
  audiosSemMetadado: number;
}

export interface ReportEffort {
  window: Window;
  agents: EffortOfAgent[];
  conversationsConsideradas: number;
  /** Conversas encerradas no período que não geraram esforço de nenhum atendente. */
  conversationsWithoutAgent: number;
}

export async function loadEffort(
  tx: TransactionPipe,
  window: Window,
): Promise<ReportEffort> {
  return consultar(tx, async (tx) => {
    // Mensagens das conversas encerradas dentro do período, com o áudio junto:
    // sem a duração do anexo a régua não tem o que ouvir nem o que falar.
    const linhas = await tx
      .select({
        conversaId: message.conversationId,
        em: message.criadaEm,
        autor: message.autorTipo,
        direcao: message.direction,
        tipo: message.tipo,
        conteudo: message.conteudo,
        usuarioId: message.autorId,
        respostaProntaId: message.respostaProntaId,
        templateId: message.templateId,
        duracaoSeg: attachment.durationSeg,
        bytes: attachment.bytes,
        atendenteId: conversation.atendenteId,
      })
      .from(message)
      .innerJoin(conversation, eq(conversation.id, message.conversationId))
      .leftJoin(attachment, eq(attachment.id, message.attachmentId))
      .where(
        and(
          isNotNull(conversation.encerradaEm),
          gte(conversation.encerradaEm, window.start),
          lt(conversation.encerradaEm, window.end),
        ),
      )
      .orderBy(asc(message.criadaEm));

    const byConversation = new Map<string, { agentId: string | null; msgs: MessageEffort[] }>();
    // Instantes das mensagens de saída de cada atendente — base do tempo em sessão.
    const instantesByAgent = new Map<string, Date[]>();

    for (const l of linhas) {
      const grupo = byConversation.get(l.conversaId) ?? { agentId: l.atendenteId, msgs: [] };
      grupo.msgs.push({
        conversationId: l.conversaId,
        em: l.em,
        autor: l.autor as MessageEffort['autor'],
        direction: l.direcao as MessageEffort['direction'],
        tipo: l.tipo as MessageEffort['tipo'],
        conteudo: l.conteudo,
        userId: l.usuarioId,
        // Template também não foi digitado à mão: entra na mesma coluna separada.
        respostaProntaId: l.respostaProntaId ?? l.templateId ?? null,
        attachment:
          l.duracaoSeg !== null || l.bytes !== null
            ? { durationSeg: l.duracaoSeg, bytes: l.bytes }
            : null,
      });
      byConversation.set(l.conversaId, grupo);

      if (l.autor === 'atendente' && l.usuarioId) {
        const atual = instantesByAgent.get(l.usuarioId);
        if (atual) atual.push(l.em);
        else instantesByAgent.set(l.usuarioId, [l.em]);
      }
    }

    const byAgent = new Map<string, EffortConversation[]>();
    let withoutAgent = 0;
    for (const [conversationId, grupo] of byConversation) {
      const calculado = calcularEffortConversation(grupo.msgs, {
        conversationId,
        agentId: grupo.agentId,
      });
      if (!calculado.agentId) {
        withoutAgent += 1;
        continue;
      }
      const atual = byAgent.get(calculado.agentId);
      if (atual) atual.push(calculado);
      else byAgent.set(calculado.agentId, [calculado]);
    }

    const nomes = new Map(
      (await tx.select({ id: user.id, nome: user.nome }).from(user)).map((u) => [
        u.id,
        u.nome,
      ]),
    );

    const agents: EffortOfAgent[] = [...byAgent.entries()]
      .map(([id, conversations]) => {
        const soma = (f: (c: EffortConversation) => number) =>
          conversations.reduce((total, c) => total + f(c), 0);
        const effortSeg = soma((c) => c.effortSeg);
        const { sessionSeg } = calcularTimeInSession(instantesByAgent.get(id) ?? []);
        return {
          id,
          nome: nomes.get(id) ?? id,
          tickets: conversations.length,
          effortSeg,
          esforcoPorTicketSeg: conversations.length > 0 ? effortSeg / conversations.length : null,
          sessionSeg,
          ocupacao: occupancy(effortSeg, sessionSeg),
          charsEscritos: soma((c) => c.charsEscritos),
          charsLidos: soma((c) => c.charsLidos),
          audioOuvidoSeg: soma((c) => c.audioOuvidoSeg),
          audioGravadoSeg: soma((c) => c.audioGravadoSeg),
          charsDeRespostaPronta: soma((c) => c.charsDeRespostaPronta),
          esforcoRespostaProntaSeg: soma((c) => c.effortCannedResponseSeg),
          audiosSemMetadado: soma((c) => c.audiosSemMetadado),
        };
      })
      .sort((a, b) => b.effortSeg - a.effortSeg);

    return {
      window,
      agents,
      conversasConsideradas: byConversation.size,
      conversasSemAtendente: withoutAgent,
    };
  });
}
