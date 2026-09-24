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
import {
  conversa,
  conversaEtiqueta,
  etiqueta,
  eventoAtendimento,
  fila,
  inbox,
  usuario,
} from '@pipe/db/schema';
import type { TransacaoPipe } from '@pipe/db';
import type { Janela } from './janela.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransacaoPipe, fn: (tx: TransacaoPipe) => Promise<T>): Promise<T> =>
  fn(tx);

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
  /**
   * As duas dimensões que o Chatwoot tem e nós não tínhamos: caixa de entrada e
   * rótulo (aqui, etiqueta). Ver `referencias-blip/pesquisa/chatwoot.md`.
   *
   * A de etiqueta é a que mais vale, e a que lá é mais frágil: o relatório
   * deles conta *taggings* em vez de conversas distintas e mistura duas janelas
   * de tempo — as contagens filtram pela data do evento e as médias, pela data
   * de criação da conversa. Aqui as duas populações são a mesma do resto do
   * relatório: conversas ENCERRADAS no período.
   */
  porInbox: LinhaDeQuebra[];
  porEtiqueta: LinhaDeQuebra[];
  /** Conversas encerradas no período que não têm nenhuma etiqueta. */
  semEtiqueta: number;
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
type EixoDeQuebra = 'fila' | 'atendente' | 'inbox';

function quebrar(
  conversas: readonly {
    chaves: Record<EixoDeQuebra, string>;
    eventos: ConversaEventos;
  }[],
  eixo: EixoDeQuebra,
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

/**
 * Quebra por chave de MUITOS PARA UM — a etiqueta.
 *
 * Uma conversa com três etiquetas entra em três linhas, e por isso a soma das
 * linhas passa do total do período. Isso é correto e precisa estar escrito na
 * tela: a pergunta "quanto tempo leva um atendimento de cobrança" não tem como
 * ser respondida sem contar a mesma conversa em cada assunto que ela teve.
 *
 * O que NÃO fazemos é o que o Chatwoot faz: lá a coluna de contagem conta
 * marcações (`taggings`), não conversas distintas, e ninguém avisa.
 */
function quebrarPorMuitas(
  eventosPorConversa: ReadonlyMap<string, ConversaEventos>,
  vinculos: readonly { conversaId: string; chave: string }[],
): LinhaDeQuebra[] {
  const grupos = new Map<string, ConversaEventos[]>();
  for (const v of vinculos) {
    const eventos = eventosPorConversa.get(v.conversaId);
    if (!eventos) continue;
    const atual = grupos.get(v.chave);
    if (atual) atual.push(eventos);
    else grupos.set(v.chave, [eventos]);
  }
  return [...grupos.keys()]
    .sort()
    .map((chave) => ({ chave, ...medir(grupos.get(chave) as ConversaEventos[]) }));
}

export async function carregarAtendimento(
  tx: TransacaoPipe,
  janela: Janela,
  filtro: FiltroAtendimento = {},
): Promise<RelatorioAtendimento> {
  return consultar(tx, async (tx) => {
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
        inboxNome: inbox.nome,
      })
      .from(conversa)
      .leftJoin(fila, eq(fila.id, conversa.filaId))
      .leftJoin(usuario, eq(usuario.id, conversa.atendenteId))
      .innerJoin(inbox, eq(inbox.id, conversa.inboxId))
      .where(and(...recorte));

    if (linhas.length === 0) {
      const vazio = medir([]);
      return {
        geral: vazio,
        porFila: [],
        porAtendente: [],
        porInbox: [],
        porEtiqueta: [],
        semEtiqueta: 0,
      };
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

    // As etiquetas das mesmas conversas, pelo mesmo recorte. Uma consulta, em
    // série como as outras — e ela vem depois porque só faz sentido se houver
    // conversa no período.
    const vinculos = await tx
      .select({ conversaId: conversaEtiqueta.conversaId, chave: etiqueta.nome })
      .from(conversaEtiqueta)
      .innerJoin(etiqueta, eq(etiqueta.id, conversaEtiqueta.etiquetaId))
      .innerJoin(conversa, eq(conversa.id, conversaEtiqueta.conversaId))
      .where(and(...recorte));

    const conversas = linhas.map((l) => ({
      chaves: {
        fila: l.filaNome ?? 'Sem fila',
        atendente: l.atendenteNome ?? 'Sem atendente',
        inbox: l.inboxNome,
      },
      eventos: { conversaId: l.id, eventos: porConversa.get(l.id) ?? [] } as ConversaEventos,
    }));

    const eventosPorConversa = new Map(conversas.map((c) => [c.eventos.conversaId, c.eventos]));
    const etiquetadas = new Set(vinculos.map((v) => v.conversaId));

    return {
      geral: medir(conversas.map((c) => c.eventos)),
      porFila: quebrar(conversas, 'fila'),
      porAtendente: quebrar(conversas, 'atendente'),
      porInbox: quebrar(conversas, 'inbox'),
      porEtiqueta: quebrarPorMuitas(eventosPorConversa, vinculos),
      semEtiqueta: conversas.filter((c) => !etiquetadas.has(c.eventos.conversaId)).length,
    };
  });
}
