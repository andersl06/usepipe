import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { ItemExplanation } from '@pipe/core';
import {
  activity,
  classificationConversation,
  contact,
  contactLabel,
  account,
  conversation,
  etiqueta,
  faixaScore,
  queue,
  formulario,
  formularioPergunta,
  formularioVersao,
  lead,
  regraScore,
  respostaFormulario,
  scoreLead,
  user,
} from '@pipe/db/schema';
import { diferenca, registrarAuditoria, type TransactionPipe } from '@pipe/db';
import { atorDoCrm, consultar, paraData, paraNumero, tenantId } from './database';
// Just the type, and from a database-free file: it's the same catalog the inline cell
// reads in the browser, and it's what closes the list of writable columns.
import type { KeyField } from './campos-editaveis';

/**
 * Leads: the listing and the record.
 *
 * Everything sequential inside `consultar` — `Promise.all` in the transaction
 * drops `pipe.tenant_id` and the query ends up running with no tenant
 * (README).
 */

/*
 * Label, slice, grouping, and sorting live in `leads-visao.ts`, which imports no
 * database at all. That's what the listing's client component reads from:
 * importing from this file would drag the Postgres driver into the browser.
 * They're re-exported here, so the screen still has a single address to
 * import from.
 */
export {
  ABAS,
  abaValida,
  GROUPINGS,
  groupingValid,
  agrupar,
  groupingColumn,
  columnSortable,
  directionInitial,
  directionValid,
  writeFilters,
  FILTRAVEIS,
  filterValid,
  readFilters,
  LIMITE_LISTA,
  orderValid,
  LABEL_ACTIVITY,
  ROTULO_STATUS,
  filterLabel,
  WITHOUT_VALUE,
} from './leads-visao';
export type {
  Aba,
  Grouping,
  FilterKey,
  Direction,
  SFilter,
  Grupo,
  LinhaLead,
  Order,
  Proprietario,
} from './leads-visao';

// Re-exporting doesn't bring the name into this file's scope, and the queries below
// use nearly all of it. Hence the second line, which looks redundant and isn't.
import { filterValid, LIMITE_LISTA, LABEL_ACTIVITY, WITHOUT_VALUE } from './leads-visao';
import type {
  Aba,
  FilterKey,
  Direction,
  SFilter,
  LinhaLead,
  Order,
  Proprietario,
} from './leads-visao';

/** Queue name by band, from the most recent version of `faixa_score`. */
async function queuesByTier(tx: Parameters<Parameters<typeof consultar>[0]>[0]) {
  const linhas = await tx
    .select({ nome: faixaScore.name, versao: faixaScore.version, fila: queue.nome })
    .from(faixaScore)
    .leftJoin(queue, eq(queue.id, faixaScore.queueId))
    .orderBy(faixaScore.version);
  const mapa = new Map<string, string | null>();
  // Sorted by ascending version: the last write wins, which is the newest version.
  for (const l of linhas) mapa.set(l.nome, l.fila);
  return mapa;
}

/**
 * Screen column name to Postgres column. The list of sortable names lives in
 * `leads-visao.ts`, because the screen needs it; the translation lives here,
 * because it needs the schema.
 */
const COLUMN_SQL = {
  lead: contact.nome,
  origem: lead.origin,
  score: lead.scoreAtual,
  faixa: lead.faixaAtual,
  proprietario: user.nome,
  fase: lead.fase,
  /**
   * More days in stage is an older `fase_desde`. The direction inverts, and the
   * column's `desc` becomes the date's `asc`, resolved in `ordenacaoSql`.
   */
  dias: lead.faseDesde,
} as const;

export interface ListaDeLeads {
  linhas: LinhaLead[];
  contagens: Record<Aba, number>;
}

/**
 * The `order by` clause, with three cares the naive version doesn't have:
 *
 * - **Null always last.** A scoreless lead at the top of a list sorted by score
 *   is the first thing anyone complains about. `nulls last` in both directions.
 * - **Days in stage inverts.** "More days" is an older `fase_desde`, so the
 *   column's `desc` is the date's `asc`.
 * - **Stable tiebreak.** Without a second criterion, two leads with score 60
 *   swap places between reloads, and the list flickers with nothing having changed.
 */
function sortingSql(order: Order, direction: Direction) {
  const recente = desc(lead.criadoEm);
  if (order === 'nenhuma') return [recente];

  const column = COLUMN_SQL[order];
  const crescente = order === 'dias' ? direction === 'desc' : direction === 'asc';
  return [
    crescente ? sql`${column} asc nulls last` : sql`${column} desc nulls last`,
    recente,
  ];
}

/**
 * The Postgres column each filter queries, and what "blank" means for each one.
 *
 * The column name **doesn't come from the screen**: `chave` is from the closed
 * `FILTRAVEIS` catalog, and it's this map that decides where the comparison
 * lands. Only the VALUE comes from outside, and it goes in as a driver
 * parameter, never concatenated.
 *
 * `proprietario` compares by name, not by id, because the name is what the
 * screen shows and the value menu is built from it. Switching to id would
 * require the menu to load id and name just to hide one of the two.
 */
function filterCondition(key: FilterKey, value: string) {
  const empty = value === WITHOUT_VALUE;
  if (key === 'origem') return empty ? isNull(lead.origin) : eq(lead.origin, value);
  if (key === 'faixa') return empty ? isNull(lead.faixaAtual) : eq(lead.faixaAtual, value);
  if (key === 'fase') return empty ? isNull(lead.fase) : eq(lead.fase, value);
  return empty ? isNull(lead.proprietarioId) : eq(user.nome, value);
}

/**
 * The values each filterable column has today, for the filter menu.
 *
 * Comes from the database, not from the 200 already-loaded rows: the capped
 * list would only show the sources that made the cut, and filtering by a
 * source that exists but didn't show up would be impossible from the screen.
 *
 * Sequential inside the same `consultar` (README), and capped per column: a
 * menu of three hundred sources isn't a menu, it's a second listing.
 */
const CEILING_OF_OPTIONS = 40;

export async function filterOptions(): Promise<Record<FilterKey, string[]>> {
  return consultar(async (tx) => {
    const distintos = async (column: PgColumn) => {
      const linhas = await tx
        .selectDistinct({ v: column })
        .from(lead)
        .where(and(isNull(lead.excluidoEm), sql`${column} is not null`))
        .orderBy(column)
        .limit(CEILING_OF_OPTIONS);
      // The `is not null` is already in the `where`; the filter here is just for the type.
      return linhas.map((l) => String(l.v)).filter((v) => v !== 'null');
    };

    const origem = await distintos(lead.origin);
    const faixa = await distintos(lead.faixaAtual);
    const fase = await distintos(lead.fase);
    const donos = await tx
      .selectDistinct({ v: user.nome })
      .from(lead)
      .innerJoin(user, eq(user.id, lead.proprietarioId))
      .where(isNull(lead.excluidoEm))
      .orderBy(user.nome)
      .limit(CEILING_OF_OPTIONS);

    return { origem, faixa, fase, proprietario: donos.map((d) => d.v) };
  });
}

/**
 * List and count of the tabs in the **same** transaction. There used to be two,
 * plus the timezone one: three transactions and three pool connections to draw
 * one screen. Inside here the queries stay sequential, which is mandatory
 * (README).
 *
 * The filter goes into the `where`, not over the already-fetched rows, for the
 * same reason as the sort: with a 200 cap, filtering afterward would answer
 * "of the 200 newest, the ones from source X" when the question is "the 200
 * leads from source X".
 *
 * The tab counts, though, **ignore the filter on purpose**: they say how many
 * leads exist in each slice, and a number that changes with the filter isn't
 * useful for choosing which slice to go to.
 */
export async function carregarListaDeLeads(
  aba: Aba,
  search: string,
  order: Order = 'nenhuma',
  direction: Direction = 'desc',
  filters: SFilter = {},
): Promise<ListaDeLeads> {
  return consultar(async (tx) => {
    const recorte = {
      todos: undefined,
      novos: eq(lead.status, 'novo'),
      qualificados: eq(lead.status, 'qualificado'),
      'sem-proprietario': isNull(lead.proprietarioId),
      parados: and(
        lt(lead.faseDesde, sql`now() - interval '7 days'`),
        sql`${lead.status} not in ('convertido', 'desqualificado')`,
      ),
      desqualificados: eq(lead.status, 'desqualificado'),
    }[aba];

    const termo = search.trim();
    const filterSearch = termo
      ? sql`(${contact.nome} ilike ${'%' + termo + '%'}
             or ${contact.document} ilike ${'%' + termo + '%'}
             or ${contact.telefoneE164} ilike ${'%' + termo + '%'}
             or ${contact.email} ilike ${'%' + termo + '%'})`
      : undefined;

    const conditions = Object.entries(filters)
      .filter((par): par is [FilterKey, string] => filterValid(par[0]))
      .map(([key, value]) => filterCondition(key, value));

    const cru = await tx
      .select({
        id: lead.id,
        nome: contact.nome,
        origem: lead.origin,
        score: lead.scoreAtual,
        faixa: lead.faixaAtual,
        proprietario: user.nome,
        // The id, not just the name: the listing's editable cell saves the id, and
        // a name change doesn't change the assignment along with it.
        proprietarioId: lead.proprietarioId,
        status: lead.status,
        fase: lead.fase,
        faseDesde: lead.faseDesde,
      })
      .from(lead)
      .leftJoin(contact, eq(contact.id, lead.contactId))
      .leftJoin(user, eq(user.id, lead.proprietarioId))
      .where(and(isNull(lead.excluidoEm), recorte, filterSearch, ...conditions))
      .orderBy(...sortingSql(order, direction))
      .limit(LIMITE_LISTA);

    const queues = await queuesByTier(tx);
    const ultimas = await lastActivityByLead(
      tx,
      cru.map((l) => l.id),
    );
    const [count] = await tx
      .select({
        todos: sql<number>`count(*)::int`,
        novos: sql<number>`count(*) filter (where ${lead.status} = 'novo')::int`,
        qualificados: sql<number>`count(*) filter (where ${lead.status} = 'qualificado')::int`,
        semProprietario: sql<number>`count(*) filter (where ${lead.proprietarioId} is null)::int`,
        parados: sql<number>`count(*) filter (where ${lead.faseDesde} < now() - interval '7 days'
                                and ${lead.status} not in ('convertido','desqualificado'))::int`,
        desqualificados: sql<number>`count(*) filter (where ${lead.status} = 'desqualificado')::int`,
      })
      .from(lead)
      .where(isNull(lead.excluidoEm));

    const agora = Date.now();

    const linhas = cru.map((l) => {
      const desdeFase = paraData(l.faseDesde);
      const ult = ultimas.get(l.id);
      return {
        id: l.id,
        nome: l.nome ?? 'Lead sem contato',
        origem: l.origem,
        score: l.score,
        faixa: l.faixa,
        queue: l.faixa ? (queues.get(l.faixa) ?? null) : null,
        proprietario: l.proprietario,
        proprietarioId: l.proprietarioId,
        status: l.status,
        fase: l.fase,
        diasNaFase: desdeFase ? Math.floor((agora - desdeFase.getTime()) / 86_400_000) : null,
        lastActivity: ult?.em ?? null,
        lastActivityType: ult?.tipo ?? null,
      };
    });

    return {
      linhas,
      contagens: {
        todos: count?.todos ?? 0,
        novos: count?.novos ?? 0,
        qualificados: count?.qualificados ?? 0,
        'sem-proprietario': count?.semProprietario ?? 0,
        parados: count?.parados ?? 0,
        desqualificados: count?.desqualificados ?? 0,
      },
    };
  });
}

async function lastActivityByLead(
  tx: Parameters<Parameters<typeof consultar>[0]>[0],
  ids: string[],
): Promise<Map<string, { em: Date; tipo: string }>> {
  const mapa = new Map<string, { em: Date; tipo: string }>();
  if (ids.length === 0) return mapa;

  const linhas = await tx
    .select({
      leadId: activity.leadId,
      tipo: activity.type,
      em: activity.ocorridaEm,
    })
    .from(activity)
    .where(inArray(activity.leadId, ids))
    .orderBy(activity.ocorridaEm);

  // Sorted ascending: the last write per lead is the most recent activity.
  for (const l of linhas) {
    const em = paraData(l.em);
    if (l.leadId && em) mapa.set(l.leadId, { em, tipo: LABEL_ACTIVITY[l.tipo] ?? l.tipo });
  }
  return mapa;
}

/* ------------------------------------------------------------------ a ficha */

export interface RegraExplicada extends ItemExplanation {
  nome: string;
}

export interface ScoreExplicado {
  value: number;
  faixa: string | null;
  versaoRegra: number;
  calculadoEm: Date | null;
  itens: RegraExplicada[];
  /** From the current band: it's what decides queue and owner. */
  queue: string | null;
  corte: number | null;
}

export interface RespostaExibida {
  pergunta: string;
  tipo: string;
  value: string;
}

export interface BlockResponses {
  formulario: string;
  versao: number;
  respondidoEm: Date | null;
  respostas: RespostaExibida[];
}

export interface TimeItemRow {
  id: string;
  tipo: string;
  titulo: string;
  corpo: string | null;
  autor: string | null;
  em: Date;
}

export interface Ficha {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  document: string | null;
  accountId: string | null;
  accountName: string | null;
  origem: string | null;
  campanha: string | null;
  utm: Record<string, unknown>;
  customizados: Record<string, unknown>;
  status: string;
  fase: string | null;
  faseDesde: Date | null;
  diasNaFase: number | null;
  proprietario: string | null;
  /** The id, not just the name: inline selection saves the id, because the name changes. */
  proprietarioId: string | null;
  criadoEm: Date | null;
  etiquetas: { nome: string; cor: string | null }[];
  score: ScoreExplicado | null;
  formularios: BlockResponses[];
  timeRow: TimeItemRow[];
}

function textoDaResposta(r: {
  tipo: string;
  valueText: string | null;
  valueNum: unknown;
  valueData: unknown;
  valueBool: boolean | null;
  valueJson: unknown;
}): string {
  if (r.valueText !== null && r.valueText !== undefined) return r.valueText;
  if (r.valueBool !== null && r.valueBool !== undefined) return r.valueBool ? 'Sim' : 'Não';
  const num = paraNumero(r.valueNum);
  if (num !== null) {
    return r.tipo === 'numero'
      ? num.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
      : String(num);
  }
  const dt = paraData(r.valueData);
  if (dt) return dt.toLocaleDateString('pt-BR');
  if (Array.isArray(r.valueJson)) return r.valueJson.join(', ');
  if (r.valueJson !== null && r.valueJson !== undefined) return JSON.stringify(r.valueJson);
  return '—';
}

export async function carregarFicha(id: string): Promise<Ficha | null> {
  return consultar(async (tx) => {
    const [cabeca] = await tx
      .select({
        id: lead.id,
        contatoId: lead.contactId,
        nome: contact.nome,
        email: contact.email,
        telefone: contact.telefoneE164,
        document: contact.document,
        accountId: lead.contaId,
        accountName: account.name,
        origem: lead.origin,
        campanha: lead.campanha,
        utm: lead.utm,
        customizados: lead.customizados,
        status: lead.status,
        fase: lead.fase,
        faseDesde: lead.faseDesde,
        proprietario: user.nome,
        proprietarioId: lead.proprietarioId,
        criadoEm: lead.criadoEm,
      })
      .from(lead)
      .leftJoin(contact, eq(contact.id, lead.contactId))
      .leftJoin(account, eq(account.id, lead.contaId))
      .leftJoin(user, eq(user.id, lead.proprietarioId))
      .where(and(eq(lead.id, id), isNull(lead.excluidoEm)))
      .limit(1);

    if (!cabeca) return null;

    const etiquetas = cabeca.contatoId
      ? await tx
          .select({ nome: etiqueta.nome, cor: etiqueta.cor })
          .from(contactLabel)
          .innerJoin(etiqueta, eq(etiqueta.id, contactLabel.etiquetaId))
          .where(eq(contactLabel.contatoId, cabeca.contatoId))
          .orderBy(etiqueta.nome)
      : [];

    const score = await carregarScore(tx, id);
    const formularios = await carregarRespostas(tx, id);
    const timeRow = await timeLoadRow(tx, id, cabeca.contatoId);

    const desdeFase = paraData(cabeca.faseDesde);

    return {
      id: cabeca.id,
      nome: cabeca.nome ?? 'Lead sem contato',
      email: cabeca.email,
      telefone: cabeca.telefone,
      document: cabeca.document,
      accountId: cabeca.accountId,
      accountName: cabeca.accountName,
      origem: cabeca.origem,
      campanha: cabeca.campanha,
      utm: (cabeca.utm ?? {}) as Record<string, unknown>,
      customizados: (cabeca.customizados ?? {}) as Record<string, unknown>,
      status: cabeca.status,
      fase: cabeca.fase,
      faseDesde: desdeFase,
      diasNaFase: desdeFase ? Math.floor((Date.now() - desdeFase.getTime()) / 86_400_000) : null,
      proprietario: cabeca.proprietario,
      proprietarioId: cabeca.proprietarioId,
      criadoEm: paraData(cabeca.criadoEm),
      etiquetas,
      score,
      formularios,
      timeRow,
    };
  });
}

/**
 * The panel that explains the number.
 *
 * `score_lead.explicacao` stores `{regra, versao, pontos}` — the rule's
 * identifier, not its name, because the name changes and the history can't
 * change along with it. The name comes from the join with `regra_score`; a
 * deleted rule shows up as "rule removed" instead of vanishing from the
 * account, otherwise the sum of the items would stop matching the total.
 */
async function carregarScore(
  tx: Parameters<Parameters<typeof consultar>[0]>[0],
  leadId: string,
): Promise<ScoreExplicado | null> {
  const [linha] = await tx
    .select({
      valor: scoreLead.value,
      faixa: scoreLead.faixa,
      versaoRegra: scoreLead.versaoRegra,
      explicacao: scoreLead.explanation,
      calculadoEm: scoreLead.calculadoEm,
    })
    .from(scoreLead)
    .where(eq(scoreLead.leadId, leadId))
    .orderBy(desc(scoreLead.calculadoEm))
    .limit(1);

  if (!linha) return null;

  const itensCrus = (Array.isArray(linha.explicacao) ? linha.explicacao : []) as ItemExplanation[];
  const ids = itensCrus.map((i) => i.regra).filter((i) => typeof i === 'string');

  const nomes = new Map<string, string>();
  if (ids.length > 0) {
    const regras = await tx
      .select({ id: regraScore.id, nome: regraScore.name })
      .from(regraScore)
      .where(inArray(regraScore.id, ids));
    for (const r of regras) nomes.set(r.id, r.nome);
  }

  let tierQueue: string | null = null;
  let corte: number | null = null;
  if (linha.faixa) {
    const [f] = await tx
      .select({ fila: queue.nome, minimo: faixaScore.minimo })
      .from(faixaScore)
      .leftJoin(queue, eq(queue.id, faixaScore.queueId))
      .where(and(eq(faixaScore.name, linha.faixa), eq(faixaScore.version, linha.versaoRegra)))
      .limit(1);
    tierQueue = f?.fila ?? null;
    corte = f?.minimo ?? null;
  }

  return {
    value: linha.valor,
    faixa: linha.faixa,
    versaoRegra: linha.versaoRegra,
    calculadoEm: paraData(linha.calculadoEm),
    itens: itensCrus.map((i) => ({ ...i, nome: nomes.get(i.regra) ?? 'regra removida' })),
    queue: tierQueue,
    corte,
  };
}

/**
 * Form responses grouped by form and version — never as loose columns on the
 * record. It's the decision that avoids today's 304 custom fields on the Lead.
 */
async function carregarRespostas(
  tx: Parameters<Parameters<typeof consultar>[0]>[0],
  leadId: string,
): Promise<BlockResponses[]> {
  const linhas = await tx
    .select({
      formulario: formulario.name,
      versao: formularioVersao.version,
      versaoId: formularioVersao.id,
      pergunta: formularioPergunta.rotulo,
      ordem: formularioPergunta.order,
      tipo: formularioPergunta.type,
      valueText: respostaFormulario.valueText,
      valueNum: respostaFormulario.valueNumber,
      valueData: respostaFormulario.valueData,
      valueBool: respostaFormulario.valueBoolean,
      valueJson: respostaFormulario.valueJson,
      criadoEm: respostaFormulario.criadoEm,
    })
    .from(respostaFormulario)
    .innerJoin(formularioVersao, eq(formularioVersao.id, respostaFormulario.versaoId))
    .innerJoin(formulario, eq(formulario.id, formularioVersao.formId))
    .innerJoin(formularioPergunta, eq(formularioPergunta.id, respostaFormulario.perguntaId))
    .where(eq(respostaFormulario.leadId, leadId))
    .orderBy(formulario.name, formularioVersao.version, formularioPergunta.order);

  const blocos = new Map<string, BlockResponses>();
  for (const l of linhas) {
    let block = blocos.get(l.versaoId);
    if (!block) {
      block = {
        formulario: l.formulario,
        versao: l.versao,
        respondidoEm: paraData(l.criadoEm),
        respostas: [],
      };
      blocos.set(l.versaoId, block);
    }
    block.respostas.push({ pergunta: l.pergunta, tipo: l.tipo, value: textoDaResposta(l) });
  }
  return [...blocos.values()];
}

/**
 * Activities and conversations in the same timeline. The conversation comes in
 * with the attendance summary once monitoring has already classified it — it's
 * the product's promise: the CRM feeds off conversations, and the salesperson
 * reads what happened without opening the Desk.
 *
 * Exported because the opportunity record shows the same timeline: a deal's
 * history IS the history of the lead that originated it, and `atividade` has no
 * opportunity column. Receives the caller's `tx`, so it still fits inside the
 * record's transaction that requested it.
 */
export async function timeLoadRow(
  tx: Parameters<Parameters<typeof consultar>[0]>[0],
  leadId: string,
  contactId: string | null,
): Promise<TimeItemRow[]> {
  const activities = await tx
    .select({
      id: activity.id,
      tipo: activity.type,
      resumo: activity.summary,
      corpo: activity.body,
      autor: user.nome,
      em: activity.ocorridaEm,
    })
    .from(activity)
    .leftJoin(user, eq(user.id, activity.userId))
    .where(eq(activity.leadId, leadId))
    .orderBy(desc(activity.ocorridaEm))
    .limit(50);

  const itens: TimeItemRow[] = activities.map((a) => ({
    id: a.id,
    tipo: LABEL_ACTIVITY[a.tipo] ?? a.tipo,
    titulo: a.resumo ?? (LABEL_ACTIVITY[a.tipo] ?? a.tipo),
    corpo: a.corpo,
    autor: a.autor,
    em: paraData(a.em) ?? new Date(0),
  }));

  if (contactId) {
    const conversations = await tx
      .select({
        id: conversation.id,
        encerradaEm: conversation.encerradaEm,
        criadaEm: conversation.criadaEm,
        atendente: user.nome,
        filaNome: queue.nome,
        resumo: classificationConversation.resumo,
        categoria: classificationConversation.categoria,
      })
      .from(conversation)
      .leftJoin(user, eq(user.id, conversation.agentId))
      .leftJoin(queue, eq(queue.id, conversation.filaId))
      .leftJoin(classificationConversation, eq(classificationConversation.conversaId, conversation.id))
      .where(eq(conversation.contatoId, contactId))
      .orderBy(desc(conversation.criadaEm))
      .limit(20);

    for (const c of conversations) {
      itens.push({
        id: `conversa-${c.id}`,
        tipo: 'Atendimento',
        titulo: c.categoria
          ? `Atendimento · ${c.categoria}`
          : `Atendimento${c.filaNome ? ` · ${c.filaNome}` : ''}`,
        corpo: c.resumo,
        autor: c.atendente,
        em: paraData(c.encerradaEm) ?? paraData(c.criadaEm) ?? new Date(0),
      });
    }
  }

  return itens.sort((a, b) => b.em.getTime() - a.em.getTime()).slice(0, 40);
}

/* ------------------------------------------------------- bulk actions */

/** Who can receive a lead: an active user of the tenant, in alphabetical order. */
export async function listarProprietarios(): Promise<Proprietario[]> {
  return consultar(async (tx) =>
    tx
      .select({ id: user.id, name: user.nome })
      .from(user)
      .where(eq(user.ativo, true))
      .orderBy(user.nome),
  );
}

/**
 * Move N leads to an owner.
 *
 * The `where` repeats `excluido_em is null` even though the ids come from a list
 * the screen just rendered: between rendering and clicking there's room for a
 * deletion, and the write is the last chance to reject it.
 *
 * Returns how many rows changed — it's what the screen needs to say "3 of 4",
 * instead of claiming success on rows that no longer exist.
 */
export async function atribuirProprietario(ids: string[], proprietarioId: string): Promise<number> {
  if (ids.length === 0) return 0;
  return consultar(async (tx) => {
    const mudadas = await tx
      .update(lead)
      .set({ proprietarioId, atualizadoEm: sql`now()` })
      .where(and(inArray(lead.id, ids), isNull(lead.excluidoEm)))
      .returning({ id: lead.id });
    return mudadas.length;
  });
}

/**
 * Disqualify N leads.
 *
 * A lead that's already converted doesn't go back: it became an opportunity,
 * and disqualifying something that's already revenue is the kind of bulk write
 * nobody undoes. It's excluded from the `where`, and the returned count shows
 * the difference.
 */
export async function desqualificarLeads(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  return consultar(async (tx) => {
    const mudadas = await tx
      .update(lead)
      .set({
        status: 'desqualificado',
        desqualificadoEm: sql`now()`,
        atualizadoEm: sql`now()`,
      })
      .where(
        and(
          inArray(lead.id, ids),
          isNull(lead.excluidoEm),
          sql`${lead.status} <> 'convertido'`,
        ),
      )
      .returning({ id: lead.id });
    return mudadas.length;
  });
}

/* ------------------------------------------------ escrita de campo da ficha */

/**
 * Save a record field, what the inline cell does on every Enter.
 *
 * Three cares the naive version doesn't have:
 *
 * - **The column never comes from the screen.** `campo` is a key from
 *   `campos-editaveis.ts`'s closed catalog, and it's the `switch` here that
 *   decides which column receives the write. There's no path where a name
 *   coming from the browser becomes a column.
 * - **Email and phone live in `contato`, not in `lead`.** The record joins the
 *   two into a single screen; the write has to split them again — and a lead
 *   with no contact simply has nowhere to store an email, so it rejects
 *   instead of inventing a contact.
 * - **`excluido_em is null` in the `where`**, for the same reason as the bulk
 *   action: between rendering the record and clicking the field there's room
 *   for a deletion, and the write is the last chance to reject it.
 *
 * Returns `false` when no row changed. That's what makes the screen **restore
 * the previous value** instead of claiming it saved what it didn't.
 *
 * **The audit entry is written in the SAME transaction**
 * (`registrarAuditoria` from `@pipe/db`): a log in a separate transaction
 * disappears when the change fails and lingers when it's rolled back, and in
 * both cases it ends up lying. The `antes` (before) value comes from a read
 * done right here, not from what the screen sent — the screen could be showing
 * a value from two minutes ago.
 */
export async function atualizarCampoDoLead(
  id: string,
  campo: KeyField,
  value: string | null,
): Promise<boolean> {
  const tid = await tenantId();

  return consultar(async (tx) => {
    if (campo === 'origem' || campo === 'campanha' || campo === 'proprietario') {
      const [antes] = await tx
        .select({
          origem: lead.origin,
          campanha: lead.campanha,
          proprietarioId: lead.proprietarioId,
        })
        .from(lead)
        .where(and(eq(lead.id, id), isNull(lead.excluidoEm)))
        .limit(1);
      if (!antes) return false;

      const mudanca =
        campo === 'origem'
          ? { origem: value }
          : campo === 'campanha'
            ? { campanha: value }
            : { proprietarioId: value };
      const mudadas = await tx
        .update(lead)
        .set({ ...mudanca, atualizadoEm: sql`now()` })
        .where(and(eq(lead.id, id), isNull(lead.excluidoEm)))
        .returning({ id: lead.id });
      if (mudadas.length === 0) return false;

      await anotar(tx, tid, 'lead', id, antes, { ...antes, ...mudanca });
      return true;
    }

    const [dono] = await tx
      .select({ contatoId: lead.contactId })
      .from(lead)
      .where(and(eq(lead.id, id), isNull(lead.excluidoEm)))
      .limit(1);
    if (!dono?.contatoId) return false;

    const [antes] = await tx
      .select({ email: contact.email, telefoneE164: contact.telefoneE164 })
      .from(contact)
      .where(and(eq(contact.id, dono.contatoId), isNull(contact.excluidoEm)))
      .limit(1);
    if (!antes) return false;

    const mudanca = campo === 'email' ? { email: value } : { telefoneE164: value };
    const mudadas = await tx
      .update(contact)
      .set({ ...mudanca, atualizadoEm: sql`now()` })
      .where(and(eq(contact.id, dono.contatoId), isNull(contact.excluidoEm)))
      .returning({ id: contact.id });
    if (mudadas.length === 0) return false;

    // The log's object is `contato`, not `lead`: it's the row that actually changed,
    // and whoever reads the log looks for the table that has the data.
    await anotar(tx, tid, 'contato', dono.contatoId, antes, { ...antes, ...mudanca });
    return true;
  });
}

/**
 * Logs the change, with only what actually changed.
 *
 * Saving the whole object on both sides bloats the table and hides the change,
 * which is what `diferenca` exists to prevent. And when nothing changed there's
 * no row at all: writing a value equal to what was already there is a click,
 * not an event.
 */
async function anotar(
  tx: TransactionPipe,
  tid: string,
  objetoTipo: string,
  objetoId: string,
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
): Promise<void> {
  const mudou = diferenca(antes, depois);
  if (Object.keys(mudou.depois).length === 0) return;
  await registrarAuditoria(tx, tid, {
    ator: await atorDoCrm(),
    acao: 'alterou',
    objetoTipo,
    objetoId,
    antes: mudou.antes,
    depois: mudou.depois,
  });
}
