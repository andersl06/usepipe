import { and, asc, desc, eq, gte, lt } from 'drizzle-orm';
import { resultado, resultEmpty, type ResultadoMetrica } from '@pipe/core';
import {
  evaluation,
  classificationConversation,
  contact,
  conversation,
  criterio,
  queue,
  formEvaluation,
  grupoCriterio,
  message,
  responseEvaluation,
  user,
} from '@pipe/db/schema';
import type { TransactionPipe } from '@pipe/db';
import type { Window } from './window.js';
import { uuidOuNada } from './format.js';
import { fatalReprovado } from './note-evaluation.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransactionPipe, fn: (tx: TransactionPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/**
 * AI quality review displays the evaluation result. `packages/ai` scores each criterion deterministically (`avaliacao/nota.ts`), cites supporting messages and stores `avaliacao` plus `resposta_avaliacao`; supervisors previously had no screen for paid model calls. Display the mean's population and exclusions: drafts and unscored evaluations can otherwise inflate it. Weight by evaluation volume (§5): sum scores divided by evaluation count, never average agent averages. This module accepts data and returns data without Next (README, 'Quem fala com o banco'). Query SERIALly inside `consultar`: `Promise.all` can clear `pipe.tenant_id` and silently disable RLS tenant filtering.
 */

/** States with a final usable score; drafts are not counted because nobody finalized them. */
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
 * Average scores with explicit population. Exclude draft evaluations and those without a score; return their excluded count so the screen can show a denominator that does not improve invisibly as the process worsens.
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
        conversationId: evaluation.conversaId,
        contact: contact.nome,
        queue: queue.nome,
        evaluated: user.nome,
        form: formEvaluation.nome,
        noteMaximum: formEvaluation.notaMaxima,
        note: evaluation.nota,
        concept: evaluation.conceito,
        evaluatorType: evaluation.avaliadorTipo,
        confidenceAi: evaluation.confiancaIa,
        state: evaluation.state,
        evaluatedAt: evaluation.avaliadaEm,
        category: classificationConversation.categoria,
        sentiment: classificationConversation.sentiment,
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
      noteMaximum: Number(l.noteMaximum),
      note: numeroOuNulo(l.note),
      confidenceAi: numeroOuNulo(l.confidenceAi),
    }));

    /*
     * Group the already loaded list in memory, not with `GROUP BY`, using the SAME exclusion rule as the overall average so table and card agree.
     */
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
      byEvaluator: [...count.entries()]
        .map(([type, total]) => ({ type, total }))
        .sort((a, b) => a.type.localeCompare(b.type)),
      confidenceAi: confiancaIa,
      escala: evaluations[0]?.noteMaximum ?? 100,
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
  /*
   * The URL path ID is untrusted. Without validation, `/monitoria/abc` reaches PostgreSQL as `abc::uuid` and the screen returns 500; `null` here becomes the correct 404 upstream.
   */
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

    /*
     * Return the whole form, including unanswered criteria: an unanswered criterion means incomplete evaluation and the detail screen must show that gap.
     */
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

    /*
     * Fetch cited messages in one query. `mensagem` is partitioned with uniqueness on `(id, criada_em)`, so `evidencia_mensagem_id` has no foreign key; joining by ID is enough for display.
     */
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
        grupo = { id: l.grupoId, name: l.grupoNome, peso: Number(l.grupoPeso), criterios: [] };
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
        conversationId: cabeca.conversaId,
        contact: cabeca.contato,
        queue: cabeca.fila,
        evaluated: cabeca.avaliado,
        form: cabeca.formulario,
        noteMaximum: Number(cabeca.notaMaxima),
        note: numeroOuNulo(cabeca.nota),
        concept: cabeca.conceito,
        evaluatorType: cabeca.avaliadorTipo,
        confidenceAi: numeroOuNulo(cabeca.confiancaIa),
        state: cabeca.estado,
        evaluatedAt: cabeca.avaliadaEm,
        category: cabeca.categoria,
        sentiment: cabeca.sentimento,
      },
      groups: grupos,
      notaAntesDoFatal: todos.reduce((s, c) => s + (c.pontos ?? 0), 0),
      fatalRejecteds: todos
        .filter((c) => fatalReprovado(c.type, c.fatal, c.value))
        .map((c) => c.criterio),
      summary: cabeca.resumo,
      modelClassification: cabeca.modeloClassificacao,
    };
  });
}
