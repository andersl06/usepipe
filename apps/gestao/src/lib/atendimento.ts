import { and, eq, gte, isNotNull, lt } from 'drizzle-orm';
import {
  contarEncerramentos,
  tempoAtePrimeiraResposta,
  tempoDeAtendimento,
  tempoDeResposta,
  tempoNaFila,
  tempoTotalDeEsperaDoCliente,
  type ContagemEncerramento,
  type ConversaEventos,
  type EncerradaPor,
  type EventoAtendimento,
  type ResultadoMetrica,
  type ResultadoTempoDeResposta,
  type TipoEvento,
} from '@pipe/core';
import { conversa, eventoAtendimento, fila, usuario } from '@pipe/db/schema';
import { consultar, type Janela } from './banco';

/**
 * Relatório de atendimento — §2 e §4 da spec de métricas.
 *
 * Aqui não se calcula nada: busca-se a matéria-prima (conversas encerradas no
 * período e os eventos delas) e chamam-se as funções de
 * `packages/core/src/metricas`. Cada número da tela sai de uma delas, com o
 * `excluidas` que veio junto — é ele que a tela é obrigada a mostrar.
 *
 * População: conversas ENCERRADAS dentro do período (§3, "período fechado").
 * O cronômetro parou; nenhuma conversa aberta entra em nada disto.
 */

export interface BlocoDeTempos {
  naFila: ResultadoMetrica;
  primeiraResposta: ResultadoMetrica;
  esperaTotal: ResultadoMetrica;
  resposta: ResultadoTempoDeResposta;
  atendimento: ResultadoMetrica;
  encerramentos: ContagemEncerramento;
  /** Conversas do recorte — o universo de onde saíram os denominadores acima. */
  conversas: number;
}

export interface LinhaDeQuebra extends BlocoDeTempos {
  chave: string;
}

export interface RelatorioAtendimento {
  geral: BlocoDeTempos;
  porFila: LinhaDeQuebra[];
  porAtendente: LinhaDeQuebra[];
}

export interface FiltroAtendimento {
  filaId?: string | undefined;
  atendenteId?: string | undefined;
}

/** Aplica as cinco métricas de tempo e a contagem de encerramentos a um recorte. */
function medir(conversas: readonly ConversaEventos[]): BlocoDeTempos {
  return {
    naFila: tempoNaFila(conversas),
    primeiraResposta: tempoAtePrimeiraResposta(conversas),
    esperaTotal: tempoTotalDeEsperaDoCliente(conversas),
    resposta: tempoDeResposta(conversas),
    atendimento: tempoDeAtendimento(conversas),
    encerramentos: contarEncerramentos(conversas),
    conversas: conversas.length,
  };
}

/**
 * Dobra o conjunto por uma chave e mede cada grupo.
 *
 * `porDimensao` do core resolveria a dobra, mas a assinatura dele devolve
 * `ResultadoMetrica` por grupo, e a quebra da tela precisa das cinco métricas
 * MAIS a contagem de encerramentos no mesmo grupo — que não é
 * `ResultadoMetrica`. Então a dobra é feita aqui e a conta continua toda no
 * core, com a mesma ordenação determinística por chave que ele usa.
 */
function quebrar(
  conversas: readonly { chaves: { fila: string; atendente: string }; eventos: ConversaEventos }[],
  eixo: 'fila' | 'atendente',
): LinhaDeQuebra[] {
  const grupos = new Map<string, ConversaEventos[]>();
  for (const c of conversas) {
    const chave = c.chaves[eixo];
    const atual = grupos.get(chave);
    if (atual) atual.push(c.eventos);
    else grupos.set(chave, [c.eventos]);
  }
  return [...grupos.keys()]
    .sort()
    .map((chave) => ({ chave, ...medir(grupos.get(chave) as ConversaEventos[]) }));
}

export async function carregarAtendimento(
  janela: Janela,
  filtro: FiltroAtendimento = {},
): Promise<RelatorioAtendimento> {
  return consultar(async (tx) => {
    const recorte = [
      isNotNull(conversa.encerradaEm),
      gte(conversa.encerradaEm, janela.inicio),
      lt(conversa.encerradaEm, janela.fim),
      filtro.filaId ? eq(conversa.filaId, filtro.filaId) : undefined,
      filtro.atendenteId ? eq(conversa.atendenteId, filtro.atendenteId) : undefined,
    ].filter((c) => c !== undefined);

    // Duas consultas em SÉRIE: dentro do `comTenant` nada roda em paralelo, sob
    // pena de o `pipe.tenant_id` da transação sumir.
    const linhas = await tx
      .select({
        id: conversa.id,
        filaNome: fila.nome,
        atendenteNome: usuario.nome,
      })
      .from(conversa)
      .leftJoin(fila, eq(fila.id, conversa.filaId))
      .leftJoin(usuario, eq(usuario.id, conversa.atendenteId))
      .where(and(...recorte));

    if (linhas.length === 0) {
      const vazio = medir([]);
      return { geral: vazio, porFila: [], porAtendente: [] };
    }

    // Os eventos vêm pelo mesmo recorte, e não por lista de ids: o período
    // inteiro de um relatório passa fácil dos milhares de conversas.
    const eventos = await tx
      .select({
        conversaId: eventoAtendimento.conversaId,
        tipo: eventoAtendimento.tipo,
        em: eventoAtendimento.em,
        usuarioId: eventoAtendimento.usuarioId,
        dados: eventoAtendimento.dados,
      })
      .from(eventoAtendimento)
      .innerJoin(conversa, eq(conversa.id, eventoAtendimento.conversaId))
      .where(and(...recorte));

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

    const conversas = linhas.map((l) => ({
      chaves: {
        fila: l.filaNome ?? 'Sem fila',
        atendente: l.atendenteNome ?? 'Sem atendente',
      },
      eventos: { conversaId: l.id, eventos: porConversa.get(l.id) ?? [] } as ConversaEventos,
    }));

    return {
      geral: medir(conversas.map((c) => c.eventos)),
      porFila: quebrar(conversas, 'fila'),
      porAtendente: quebrar(conversas, 'atendente'),
    };
  });
}
