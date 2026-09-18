import { and, count, eq, gte, isNotNull, lt } from 'drizzle-orm';
import { compararIdentificador, mediaPonderadaDePares, taxaDeResposta } from '@pipe/core';
import { conversa, pesquisa, respostaPesquisa } from '@pipe/db/schema';
import type { TransacaoPipe } from '@pipe/db';
import type { Janela } from './janela.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransacaoPipe, fn: (tx: TransacaoPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/**
 * Relatório de satisfação — §6 da spec de métricas.
 *
 * A ESCALA VIAJA COM A NOTA. `resposta_pesquisa` guarda `escala_min` e
 * `escala_max` de propósito, porque um 4 de CSAT (1 a 5) e um 4 de NPS (0 a 10)
 * não significam a mesma coisa e não podem cair no mesmo gráfico. Por isso o
 * agrupamento é por tipo E escala: nota de escalas diferentes nunca entra na
 * mesma média, por construção, e não por disciplina de quem lê a tela.
 *
 * A população é a mesma dos dois lados da taxa de resposta: respostas de
 * conversas encerradas no período, sobre conversas encerradas no período.
 * Numerador e denominador contados sobre universos diferentes dariam uma taxa
 * que não quer dizer nada.
 */

export interface FatiaDeClasse {
  nome: string;
  quantidade: number;
  /** Participação na barra. Divisão de contagens, não é métrica da spec. */
  fracao: number;
}

export interface GrupoSatisfacao {
  /** `csat` ou `nps`. */
  tipo: string;
  escalaMin: number;
  escalaMax: number;
  media: number | null;
  /** Respostas com nota — o "parcial" e o "completo" da Blip somados. */
  respostas: number;
  /** Pesquisas geradas para conversas encerradas no período, respondidas ou não. */
  enviadas: number;
  /** Respostas ÷ conversas encerradas no período. Obrigatória ao lado da média. */
  taxa: number | null;
  classes: FatiaDeClasse[];
}

export interface ComentarioRecente {
  id: string;
  tipo: string;
  nota: number | null;
  escalaMin: number;
  escalaMax: number;
  classe: string | null;
  texto: string;
  em: Date | null;
}

export interface RelatorioSatisfacao {
  /** Denominador da taxa de resposta: conversas encerradas no período. */
  encerradas: number;
  grupos: GrupoSatisfacao[];
  comentarios: ComentarioRecente[];
}

/** Teto dos comentários: é uma amostra recente, não a extração da pesquisa. */
export const LIMITE_COMENTARIOS = 20;

/**
 * Ordem de leitura das classes, do melhor para o pior.
 *
 * O vocabulário é o que a coluna `classe` gravou, e ele é diferente nos dois
 * modelos: `satisfeito`/`insatisfeito` no CSAT, `promotor`/`neutro`/`detrator`
 * no NPS. A tela mostra o que veio do banco e não reclassifica nota nenhuma —
 * classificar aqui seria inventar uma segunda definição das faixas.
 */
const ORDEM_CLASSE = ['promotor', 'satisfeito', 'neutro', 'insatisfeito', 'detrator'];

function ordenarClasses(a: FatiaDeClasse, b: FatiaDeClasse): number {
  const ia = ORDEM_CLASSE.indexOf(a.nome);
  const ib = ORDEM_CLASSE.indexOf(b.nome);
  if (ia !== ib) return (ia < 0 ? ORDEM_CLASSE.length : ia) - (ib < 0 ? ORDEM_CLASSE.length : ib);
  return a.nome < b.nome ? -1 : 1;
}

export async function carregarSatisfacao(
  tx: TransacaoPipe,
  janela: Janela,
): Promise<RelatorioSatisfacao> {
  return consultar(tx, async (tx) => {
    const encerradaNoPeriodo = and(
      isNotNull(conversa.encerradaEm),
      gte(conversa.encerradaEm, janela.inicio),
      lt(conversa.encerradaEm, janela.fim),
    );

    // Em série, nunca em paralelo: `Promise.all` dentro da transação derruba o
    // `pipe.tenant_id` em silêncio.
    const [contagem] = await tx.select({ total: count() }).from(conversa).where(encerradaNoPeriodo);
    const encerradas = contagem?.total ?? 0;

    const linhas = await tx
      .select({
        id: respostaPesquisa.id,
        pesquisaId: respostaPesquisa.pesquisaId,
        tipo: pesquisa.tipo,
        nota: respostaPesquisa.nota,
        escalaMin: respostaPesquisa.escalaMin,
        escalaMax: respostaPesquisa.escalaMax,
        classe: respostaPesquisa.classe,
        comentario: respostaPesquisa.comentario,
        respondidaEm: respostaPesquisa.respondidaEm,
      })
      .from(respostaPesquisa)
      .innerJoin(conversa, eq(conversa.id, respostaPesquisa.conversaId))
      .innerJoin(pesquisa, eq(pesquisa.id, respostaPesquisa.pesquisaId))
      .where(encerradaNoPeriodo);

    type Acumulador = {
      tipo: string;
      escalaMin: number;
      escalaMax: number;
      enviadas: number;
      respostas: number;
      /** Um par por pesquisa: a média do grupo é soma ÷ soma, nunca média de médias. */
      pares: Map<string, { soma: number; contagem: number }>;
      classes: Map<string, number>;
    };

    const grupos = new Map<string, Acumulador>();
    for (const l of linhas) {
      const chave = `${l.tipo}|${l.escalaMin}|${l.escalaMax}`;
      const g =
        grupos.get(chave) ??
        ({
          tipo: l.tipo,
          escalaMin: l.escalaMin,
          escalaMax: l.escalaMax,
          enviadas: 0,
          respostas: 0,
          pares: new Map(),
          classes: new Map(),
        } satisfies Acumulador);
      g.enviadas += 1;
      if (l.nota !== null) {
        g.respostas += 1;
        const par = g.pares.get(l.pesquisaId) ?? { soma: 0, contagem: 0 };
        par.soma += l.nota;
        par.contagem += 1;
        g.pares.set(l.pesquisaId, par);
        const classe = l.classe ?? 'sem classe';
        g.classes.set(classe, (g.classes.get(classe) ?? 0) + 1);
      }
      grupos.set(chave, g);
    }

    const comentarios: ComentarioRecente[] = linhas
      .filter((l) => l.comentario !== null && l.comentario.trim() !== '')
      .sort((a, b) => (b.respondidaEm?.getTime() ?? 0) - (a.respondidaEm?.getTime() ?? 0))
      .slice(0, LIMITE_COMENTARIOS)
      .map((l) => ({
        id: l.id,
        tipo: l.tipo,
        nota: l.nota,
        escalaMin: l.escalaMin,
        escalaMax: l.escalaMax,
        classe: l.classe,
        texto: l.comentario as string,
        em: l.respondidaEm,
      }));

    return {
      encerradas,
      comentarios,
      grupos: [...grupos.values()]
        .map((g) => ({
          tipo: g.tipo,
          escalaMin: g.escalaMin,
          escalaMax: g.escalaMax,
          media: mediaPonderadaDePares([...g.pares.values()]),
          respostas: g.respostas,
          enviadas: g.enviadas,
          taxa: taxaDeResposta(g.respostas, encerradas),
          classes: [...g.classes.entries()]
            .map(([nome, quantidade]) => ({
              nome,
              quantidade,
              fracao: g.respostas > 0 ? quantidade / g.respostas : 0,
            }))
            .sort(ordenarClasses),
        }))
        // CSAT antes de NPS, e escala menor antes da maior: ordem estável, para o
        // relatório sair igual toda vez.
        .sort((a, b) => compararIdentificador(a.tipo, b.tipo) || a.escalaMax - b.escalaMax),
    };
  });
}
