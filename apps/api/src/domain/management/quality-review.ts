import { and, asc, desc, eq, gte, lt } from 'drizzle-orm';
import { resultado, resultEmpty, type ResultadoMetrica } from '@pipe/core';
import {
  evaluation,
  classificationConversation,
  contact as contact,
  conversation,
  criterio,
  queue,
  formEvaluation,
  grupoCriterio,
  message,
  responseEvaluation,
  user,
} from '@pipe/db/schema';
import type { TransactionPipe as TransactionPipe } from '@pipe/db';
import type { Window } from './window.js';
import { uuidOuNada } from './format.js';
import { fatalReprovado } from './note-evaluation.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransactionPipe, fn: (tx: TransactionPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/**
 * Monitoria com IA — o resultado que ninguém via.
 *
 * `packages/ai` avalia a conversa critério a critério, calcula a nota de forma
 * determinística (`avaliacao/nota.ts`), cita a mensagem que sustenta cada
 * resposta e grava tudo em `avaliacao` + `resposta_avaliacao`. Não havia tela: o
 * produto pagava pela chamada de modelo e o supervisor não tinha onde ler.
 *
 * **A régua de métricas vale aqui igual.** A média das notas mostra a população
 * de que saiu e quantas avaliações ficaram de fora, porque avaliação em
 * rascunho e avaliação sem nota são exatamente o tipo de exclusão que embeleza
 * a média sem ninguém perceber. Média ponderada por volume (§5): soma das notas
 * ÷ número de avaliações, nunca média de médias por atendente.
 *
 * Nada aqui sabe que o Next existe — recebe parâmetro e devolve dado (README,
 * "Quem fala com o banco"). Consultas em SÉRIE dentro do `consultar`:
 * `Promise.all` derruba o `pipe.tenant_id` e a RLS deixa de filtrar em silêncio.
 */

/** Estados em que a nota já vale. Rascunho não conta — ninguém fechou aquilo. */
const ESTADOS_VALENDO = new Set(['concluida', 'contestada', 'revisada', 'encerrada']);

export const LABEL_STATE_EVALUATION: Record<string, string> = {
  rascunho: 'Rascunho',
  concluida: 'Concluída',
  contestada: 'Contestada',
  revisada: 'Revisada',
  encerrada: 'Encerrada',
};

export const ROTULO_AVALIADOR: Record<string, string> = {
  ia: 'IA',
  humano: 'Humano',
};

/** O que a IA respondeu num critério de conformidade. */
export const LABEL_VALUE: Record<string, string> = {
  conforme: 'Conforme',
  nao_conforme: 'Não conforme',
  nao_se_aplica: 'Não se aplica',
};

export interface EvaluationInList {
  id: string;
  conversationId: string;
  contact: string | null;
  queue: string | null;
  evaluated: string | null;
  form: string;
  noteMaximum: number;
  /** `null` quando a avaliação ainda não fechou nota — e aí ela sai da média. */
  note: number | null;
  concept: string | null;
  evaluatorType: string;
  confidenceAi: number | null;
  state: string;
  evaluatedAt: Date | null;
  /** Categoria e sentimento da classificação da conversa, quando houver. */
  category: string | null;
  sentiment: string | null;
}

export interface LineByAgent {
  agent: string;
  media: ResultadoMetrica;
  /** Avaliações com nota zero por critério fatal — a média sozinha esconde isto. */
  zeradas: number;
}

export interface ApplicationOfQualityReview {
  evaluations: EvaluationInList[];
  /** Média geral das notas, com população e descartadas ao lado. */
  media: ResultadoMetrica;
  byAgent: LineByAgent[];
  /** Quantas foram da IA e quantas de gente: a nota da IA é sugestão até revisão. */
  byEvaluator: { type: string; total: number }[];
  /** Confiança média declarada pelo modelo, de 0 a 1. Só das avaliações da IA. */
  confidenceAi: ResultadoMetrica;
  /** Nota máxima do formulário mais usado no recorte — a escala em que a média é lida. */
  escala: number;
}

export interface QualityReviewFilter {
  agentId?: string | undefined;
  evaluatorType?: string | undefined;
}

/** `numeric` volta como texto do driver; `null` continua `null`. */
function numeroOuNulo(bruto: string | null): number | null {
  if (bruto === null) return null;
  const n = Number(bruto);
  return Number.isFinite(n) ? n : null;
}

/**
 * Média das notas de um conjunto, com a população explícita.
 *
 * Fora da média: avaliação em rascunho e avaliação sem nota. A contagem
 * excluída volta junto porque a tela é obrigada a mostrá-la — média que esconde
 * o denominador melhora justamente quando o processo piora.
 */
function mediaDasNotas(itens: readonly EvaluationInList[]): ResultadoMetrica {
  let soma = 0;
  let population = 0;
  let excluidas = 0;
  for (const a of itens) {
    if (a.note === null || !ESTADOS_VALENDO.has(a.state)) {
      excluidas += 1;
      continue;
    }
    soma += a.note;
    population += 1;
  }
  return population > 0 ? resultado(soma, population, excluidas) : resultEmpty(excluidas);
}

export async function loadQualityReview(
  tx: TransactionPipe,
  window: Window,
  filter: QualityReviewFilter = {},
): Promise<ApplicationOfQualityReview> {
  return consultar(tx, async (tx) => {
    const recorte = [
      gte(evaluation.avaliadaEm, window.start),
      lt(evaluation.avaliadaEm, window.end),
      filter.agentId ? eq(evaluation.avaliadoId, filter.agentId) : undefined,
      filter.evaluatorType ? eq(evaluation.avaliadorTipo, filter.evaluatorType) : undefined,
    ].filter((c) => c !== undefined);

    const linhas = await tx
      .select({
        id: evaluation.id,
        conversaId: evaluation.conversaId,
        contato: contact.nome,
        fila: queue.nome,
        avaliado: user.nome,
        formulario: formEvaluation.nome,
        notaMaxima: formEvaluation.notaMaxima,
        nota: evaluation.nota,
        conceito: evaluation.conceito,
        avaliadorTipo: evaluation.avaliadorTipo,
        confiancaIa: evaluation.confiancaIa,
        estado: evaluation.state,
        avaliadaEm: evaluation.avaliadaEm,
        categoria: classificationConversation.categoria,
        sentimento: classificationConversation.sentiment,
      })
      .from(evaluation)
      .innerJoin(formEvaluation, eq(formEvaluation.id, evaluation.formularioId))
      .innerJoin(conversation, eq(conversation.id, evaluation.conversaId))
      .leftJoin(contact, eq(contact.id, conversation.contatoId))
      .leftJoin(queue, eq(queue.id, conversation.filaId))
      .leftJoin(user, eq(user.id, evaluation.avaliadoId))
      .leftJoin(classificationConversation, eq(classificationConversation.conversaId, evaluation.conversaId))
      .where(and(...recorte))
      .orderBy(desc(evaluation.avaliadaEm));

    const evaluations: EvaluationInList[] = linhas.map((l) => ({
      ...l,
      notaMaxima: Number(l.notaMaxima),
      nota: numeroOuNulo(l.nota),
      confiancaIa: numeroOuNulo(l.confiancaIa),
    }));

    /* Agrupamento em memória, e não `GROUP BY`: a lista inteira já veio, e a
       média precisa da MESMA regra de exclusão da geral. Duas contas em dois
       lugares é como o número da tabela deixa de bater com o do cartão. */
    const groups = new Map<string, EvaluationInList[]>();
    for (const a of evaluations) {
      const key = a.evaluated ?? 'Sem atendente';
      const atual = groups.get(key);
      if (atual) atual.push(a);
      else groups.set(key, [a]);
    }

    const byAgent: LineByAgent[] = [...groups.keys()].sort().map((agent) => {
      const itens = groups.get(agent) as EvaluationInList[];
      return {
        agent,
        media: mediaDasNotas(itens),
        zeradas: itens.filter((a) => a.note === 0 && ESTADOS_VALENDO.has(a.state)).length,
      };
    });

    const count = new Map<string, number>();
    for (const a of evaluations)
      count.set(a.evaluatorType, (count.get(a.evaluatorType) ?? 0) + 1);

    const daIa = evaluations.filter((a) => a.evaluatorType === 'ia');
    const comConfianca = daIa.filter((a) => a.confidenceAi !== null);
    const confiancaIa =
      comConfianca.length > 0
        ? resultado(
            comConfianca.reduce((s, a) => s + (a.confidenceAi ?? 0), 0),
            comConfianca.length,
            daIa.length - comConfianca.length,
          )
        : resultEmpty(daIa.length);

    return {
      evaluations,
      media: mediaDasNotas(evaluations),
      byAgent,
      porAvaliador: [...count.entries()]
        .map(([tipo, total]) => ({ tipo, total }))
        .sort((a, b) => a.tipo.localeCompare(b.tipo)),
      confiancaIa,
      escala: evaluations[0]?.notaMaxima ?? 100,
    };
  });
}

/* ------------------------------------------------------- a ficha da avaliação */

export interface RespostaDeCriterio {
  criterionId: string;
  criterio: string;
  description: string | null;
  type: string;
  fatal: boolean;
  peso: number;
  value: string | null;
  /** Pontos já na escala da nota final: é o que permite dizer "perdeu 12 aqui". */
  pontos: number | null;
  justificativa: string | null;
  /** O trecho citado pela IA, resolvido para o texto da mensagem. */
  evidencia: string | null;
  evidenciaAutor: string | null;
  evidenciaEm: Date | null;
}

export interface GrupoDaFicha {
  id: string;
  name: string;
  peso: number;
  criterios: RespostaDeCriterio[];
}

export interface RecordOfEvaluation {
  cabecalho: EvaluationInList;
  groups: GrupoDaFicha[];
  /** Soma dos pontos: a nota ANTES do critério fatal. Mostra o tamanho do estrago. */
  notaAntesDoFatal: number;
  /** Nomes dos critérios fatais reprovados. Vazio quando nenhum zerou a nota. */
  fatalRejecteds: string[];
  /** O resumo da classificação da conversa, quando a IA também classificou. */
  summary: string | null;
  modelClassification: string | null;
}

export async function carregarFicha(
  tx: TransactionPipe,
  id: string,
): Promise<RecordOfEvaluation | null> {
  /* O id vem do caminho da URL, que é entrada de fora. Sem esta linha,
     `/monitoria/abc` chegava ao Postgres como `abc::uuid` e a tela devolvia
     500 — "não existe" é 404, e é isso que o `null` daqui vira lá em cima. */
  if (!uuidOuNada(id)) return null;

  return consultar(tx, async (tx) => {
    const [cabeca] = await tx
      .select({
        id: evaluation.id,
        conversaId: evaluation.conversaId,
        contato: contact.nome,
        fila: queue.nome,
        avaliado: user.nome,
        formulario: formEvaluation.nome,
        formularioId: formEvaluation.id,
        notaMaxima: formEvaluation.notaMaxima,
        nota: evaluation.nota,
        conceito: evaluation.conceito,
        avaliadorTipo: evaluation.avaliadorTipo,
        confiancaIa: evaluation.confiancaIa,
        estado: evaluation.state,
        avaliadaEm: evaluation.avaliadaEm,
        categoria: classificationConversation.categoria,
        sentimento: classificationConversation.sentiment,
        resumo: classificationConversation.resumo,
        modeloClassificacao: classificationConversation.template,
      })
      .from(evaluation)
      .innerJoin(formEvaluation, eq(formEvaluation.id, evaluation.formularioId))
      .innerJoin(conversation, eq(conversation.id, evaluation.conversaId))
      .leftJoin(contact, eq(contact.id, conversation.contatoId))
      .leftJoin(queue, eq(queue.id, conversation.filaId))
      .leftJoin(user, eq(user.id, evaluation.avaliadoId))
      .leftJoin(classificationConversation, eq(classificationConversation.conversaId, evaluation.conversaId))
      .where(eq(evaluation.id, id))
      .limit(1);

    if (!cabeca) return null;

    /* O formulário inteiro, e não só os critérios respondidos: critério sem
       resposta é informação — quer dizer que a avaliação está incompleta, e a
       ficha precisa mostrar a lacuna em vez de escondê-la. */
    const linhas = await tx
      .select({
        grupoId: grupoCriterio.id,
        grupoNome: grupoCriterio.nome,
        grupoPeso: grupoCriterio.peso,
        grupoOrdem: grupoCriterio.ordem,
        criterioId: criterio.id,
        criterioNome: criterio.nome,
        descricao: criterio.description,
        tipo: criterio.tipo,
        fatal: criterio.fatal,
        peso: criterio.peso,
        valor: responseEvaluation.value,
        pontos: responseEvaluation.pontos,
        justificativa: responseEvaluation.justificativa,
        evidenciaId: responseEvaluation.evidenceMessageId,
      })
      .from(grupoCriterio)
      .innerJoin(criterio, eq(criterio.grupoId, grupoCriterio.id))
      .leftJoin(
        responseEvaluation,
        and(
          eq(responseEvaluation.criterioId, criterio.id),
          eq(responseEvaluation.evaluationId, cabeca.id),
        ),
      )
      .where(eq(grupoCriterio.formularioId, cabeca.formularioId))
      .orderBy(asc(grupoCriterio.ordem), asc(criterio.ordem));

    /* As mensagens citadas, numa consulta só. `mensagem` é particionada e a
       unicidade dela é (id, criada_em), por isso não há chave estrangeira em
       `evidencia_mensagem_id` — a junção é pelo id e basta para exibir. */
    const evidencias = await tx
      .select({
        id: message.id,
        conteudo: message.conteudo,
        autorTipo: message.autorTipo,
        criadaEm: message.criadaEm,
      })
      .from(message)
      .where(eq(message.conversationId, cabeca.conversaId));

    const byMessage = new Map(evidencias.map((m) => [m.id, m]));

    const grupos: GrupoDaFicha[] = [];
    for (const l of linhas) {
      let grupo = grupos.find((g) => g.id === l.grupoId);
      if (!grupo) {
        grupo = { id: l.grupoId, nome: l.grupoNome, peso: Number(l.grupoPeso), criterios: [] };
        grupos.push(grupo);
      }
      const citada = l.evidenciaId ? byMessage.get(l.evidenciaId) : undefined;
      grupo.criterios.push({
        criterionId: l.criterioId,
        criterio: l.criterioNome,
        description: l.descricao,
        type: l.tipo,
        fatal: l.fatal,
        peso: Number(l.peso),
        value: l.valor,
        pontos: numeroOuNulo(l.pontos),
        justificativa: l.justificativa,
        evidencia: citada?.conteudo ?? null,
        evidenciaAutor: citada?.autorTipo ?? null,
        evidenciaEm: citada?.criadaEm ?? null,
      });
    }

    const todos = grupos.flatMap((g) => g.criterios);

    return {
      cabecalho: {
        id: cabeca.id,
        conversaId: cabeca.conversaId,
        contato: cabeca.contato,
        fila: cabeca.fila,
        avaliado: cabeca.avaliado,
        formulario: cabeca.formulario,
        notaMaxima: Number(cabeca.notaMaxima),
        nota: numeroOuNulo(cabeca.nota),
        conceito: cabeca.conceito,
        avaliadorTipo: cabeca.avaliadorTipo,
        confiancaIa: numeroOuNulo(cabeca.confiancaIa),
        estado: cabeca.estado,
        avaliadaEm: cabeca.avaliadaEm,
        categoria: cabeca.categoria,
        sentimento: cabeca.sentimento,
      },
      grupos,
      notaAntesDoFatal: todos.reduce((s, c) => s + (c.pontos ?? 0), 0),
      fataisReprovados: todos
        .filter((c) => fatalReprovado(c.type, c.fatal, c.value))
        .map((c) => c.criterio),
      resumo: cabeca.resumo,
      modeloClassificacao: cabeca.modeloClassificacao,
    };
  });
}
