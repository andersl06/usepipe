import { and, asc, eq, gte, isNotNull, lt } from 'drizzle-orm';
import {
  calcularEsforcoConversa,
  calcularTempoEmSessao,
  ocupacao,
  type EsforcoConversa,
  type MensagemEsforco,
} from '@pipe/core';
import { anexo, conversa, mensagem, usuario } from '@pipe/db/schema';
import { consultar, type Janela } from './banco';

/**
 * Relatório de esforço por atendente — §4.4 do desenho.
 *
 * A conta inteira é da régua de `packages/core/src/esforco/`: 200 char/min
 * escrito, 1.000 char/min lido, áudio em 1×, e o texto que veio de resposta
 * pronta ou template **fora** do esforço, em coluna separada. Aqui só se busca a
 * matéria-prima e se soma o que o core devolveu.
 */

export interface EsforcoDoAtendente {
  id: string;
  nome: string;
  tickets: number;
  esforcoSeg: number;
  /** Esforço ÷ tickets. Ponderado por construção (§5 da spec de métricas). */
  esforcoPorTicketSeg: number | null;
  sessaoSeg: number;
  ocupacao: number | null;
  charsEscritos: number;
  charsLidos: number;
  audioOuvidoSeg: number;
  audioGravadoSeg: number;
  /** Texto que o atendente **não** digitou: resposta pronta e template. */
  charsDeRespostaPronta: number;
  /** O que esse texto acrescentaria ao esforço se fosse contado como digitação. */
  esforcoRespostaProntaSeg: number;
  audiosSemMetadado: number;
}

export interface RelatorioEsforco {
  janela: Janela;
  atendentes: EsforcoDoAtendente[];
  conversasConsideradas: number;
  /** Conversas encerradas no período que não geraram esforço de nenhum atendente. */
  conversasSemAtendente: number;
}

export async function carregarEsforco(janela: Janela): Promise<RelatorioEsforco> {
  return consultar(async (tx) => {
    // Mensagens das conversas encerradas dentro do período, com o áudio junto:
    // sem a duração do anexo a régua não tem o que ouvir nem o que falar.
    const linhas = await tx
      .select({
        conversaId: mensagem.conversaId,
        em: mensagem.criadaEm,
        autor: mensagem.autorTipo,
        direcao: mensagem.direcao,
        tipo: mensagem.tipo,
        conteudo: mensagem.conteudo,
        usuarioId: mensagem.autorId,
        respostaProntaId: mensagem.respostaProntaId,
        templateId: mensagem.templateId,
        duracaoSeg: anexo.duracaoSeg,
        bytes: anexo.bytes,
        atendenteId: conversa.atendenteId,
      })
      .from(mensagem)
      .innerJoin(conversa, eq(conversa.id, mensagem.conversaId))
      .leftJoin(anexo, eq(anexo.id, mensagem.anexoId))
      .where(
        and(
          isNotNull(conversa.encerradaEm),
          gte(conversa.encerradaEm, janela.inicio),
          lt(conversa.encerradaEm, janela.fim),
        ),
      )
      .orderBy(asc(mensagem.criadaEm));

    const porConversa = new Map<string, { atendenteId: string | null; msgs: MensagemEsforco[] }>();
    // Instantes das mensagens de saída de cada atendente — base do tempo em sessão.
    const instantesPorAtendente = new Map<string, Date[]>();

    for (const l of linhas) {
      const grupo = porConversa.get(l.conversaId) ?? { atendenteId: l.atendenteId, msgs: [] };
      grupo.msgs.push({
        conversaId: l.conversaId,
        em: l.em,
        autor: l.autor as MensagemEsforco['autor'],
        direcao: l.direcao as MensagemEsforco['direcao'],
        tipo: l.tipo as MensagemEsforco['tipo'],
        conteudo: l.conteudo,
        usuarioId: l.usuarioId,
        // Template também não foi digitado à mão: entra na mesma coluna separada.
        respostaProntaId: l.respostaProntaId ?? l.templateId ?? null,
        anexo: l.duracaoSeg !== null || l.bytes !== null ? { duracaoSeg: l.duracaoSeg, bytes: l.bytes } : null,
      });
      porConversa.set(l.conversaId, grupo);

      if (l.autor === 'atendente' && l.usuarioId) {
        const atual = instantesPorAtendente.get(l.usuarioId);
        if (atual) atual.push(l.em);
        else instantesPorAtendente.set(l.usuarioId, [l.em]);
      }
    }

    const porAtendente = new Map<string, EsforcoConversa[]>();
    let semAtendente = 0;
    for (const [conversaId, grupo] of porConversa) {
      const calculado = calcularEsforcoConversa(grupo.msgs, {
        conversaId,
        atendenteId: grupo.atendenteId,
      });
      if (!calculado.atendenteId) {
        semAtendente += 1;
        continue;
      }
      const atual = porAtendente.get(calculado.atendenteId);
      if (atual) atual.push(calculado);
      else porAtendente.set(calculado.atendenteId, [calculado]);
    }

    const nomes = new Map(
      (await tx.select({ id: usuario.id, nome: usuario.nome }).from(usuario)).map((u) => [
        u.id,
        u.nome,
      ]),
    );

    const atendentes: EsforcoDoAtendente[] = [...porAtendente.entries()]
      .map(([id, conversas]) => {
        const soma = (f: (c: EsforcoConversa) => number) =>
          conversas.reduce((total, c) => total + f(c), 0);
        const esforcoSeg = soma((c) => c.esforcoSeg);
        const { sessaoSeg } = calcularTempoEmSessao(instantesPorAtendente.get(id) ?? []);
        return {
          id,
          nome: nomes.get(id) ?? id,
          tickets: conversas.length,
          esforcoSeg,
          esforcoPorTicketSeg: conversas.length > 0 ? esforcoSeg / conversas.length : null,
          sessaoSeg,
          ocupacao: ocupacao(esforcoSeg, sessaoSeg),
          charsEscritos: soma((c) => c.charsEscritos),
          charsLidos: soma((c) => c.charsLidos),
          audioOuvidoSeg: soma((c) => c.audioOuvidoSeg),
          audioGravadoSeg: soma((c) => c.audioGravadoSeg),
          charsDeRespostaPronta: soma((c) => c.charsDeRespostaPronta),
          esforcoRespostaProntaSeg: soma((c) => c.esforcoRespostaProntaSeg),
          audiosSemMetadado: soma((c) => c.audiosSemMetadado),
        };
      })
      .sort((a, b) => b.esforcoSeg - a.esforcoSeg);

    return {
      janela,
      atendentes,
      conversasConsideradas: porConversa.size,
      conversasSemAtendente: semAtendente,
    };
  });
}
