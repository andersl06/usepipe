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
// Só o tipo, e de um arquivo sem banco: é o mesmo catálogo que a célula inline
// lê no navegador, e é ele que fecha a lista de colunas graváveis.
import type { KeyField } from './campos-editaveis';

/**
 * Leads: a listagem e a ficha.
 *
 * Tudo em série dentro do `consultar` — `Promise.all` dentro da transação derruba o
 * `pipe.tenant_id` e a consulta passa a rodar sem tenant (README).
 */

/*
 * Rótulo, recorte, agrupamento e ordenação moram em `leads-visao.ts`, que não
 * importa banco nenhum. É de lá que o componente de cliente da listagem lê:
 * importar deste arquivo arrastaria o driver do Postgres para o navegador.
 * Aqui eles são reexportados, para que a tela continue tendo um endereço só.
 */
export {
  ABAS,
  abaValida,
  GROUPINGS,
  groupingValid,
  agrupar,
  groupingColumn,
  columnOrdenavel,
  directionInitial,
  directionValid,
  escreverFilters,
  FILTRAVEIS,
  filterValid,
  readFilters,
  LIMITE_LISTA,
  orderValid,
  ROTULO_ACTIVITY,
  ROTULO_STATUS,
  filterRotulo,
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

// Reexportar não traz o nome para o escopo deste arquivo, e as consultas abaixo
// usam quase todos. Por isso a segunda linha, que parece redundante e não é.
import { filterValid, LIMITE_LISTA, ROTULO_ACTIVITY, WITHOUT_VALUE } from './leads-visao';
import type {
  Aba,
  FilterKey,
  Direction,
  SFilter,
  LinhaLead,
  Order,
  Proprietario,
} from './leads-visao';

/** Nome da fila por faixa, da versão mais recente de `faixa_score`. */
async function queuesByTier(tx: Parameters<Parameters<typeof consultar>[0]>[0]) {
  const linhas = await tx
    .select({ nome: faixaScore.nome, versao: faixaScore.versao, fila: queue.nome })
    .from(faixaScore)
    .leftJoin(queue, eq(queue.id, faixaScore.filaId))
    .orderBy(faixaScore.versao);
  const mapa = new Map<string, string | null>();
  // Ordenado por versão crescente: a última escrita vence, que é a versão mais nova.
  for (const l of linhas) mapa.set(l.nome, l.fila);
  return mapa;
}

/**
 * Nome de coluna da tela para coluna do Postgres. A lista de nomes ordenáveis
 * mora em `leads-visao.ts`, porque a tela precisa dela; a tradução mora aqui,
 * porque precisa do esquema.
 */
const COLUMN_SQL = {
  lead: contact.nome,
  origem: lead.origem,
  score: lead.scoreAtual,
  faixa: lead.faixaAtual,
  proprietario: user.nome,
  fase: lead.fase,
  /** Mais dias na fase é `fase_desde` mais antigo. O sentido inverte, e o
   *  `desc` da coluna vira `asc` da data, resolvido em `ordenacaoSql`. */
  dias: lead.faseDesde,
} as const;

export interface ListaDeLeads {
  linhas: LinhaLead[];
  contagens: Record<Aba, number>;
}

/**
 * A cláusula `order by`, com três cuidados que a versão ingênua não tem:
 *
 * - **Nulo por último, sempre.** Lead sem score no topo da lista ordenada por
 *   score é a primeira coisa que alguém reclama. `nulls last` nos dois sentidos.
 * - **Dias na fase inverte.** "Mais dias" é `fase_desde` mais antigo, então o
 *   `desc` da coluna é `asc` da data.
 * - **Desempate estável.** Sem um segundo critério, dois leads de score 60
 *   trocam de lugar entre recargas, e a lista pisca sem nada ter mudado.
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
 * A coluna do Postgres que cada filtro interroga, e o que "em branco" significa
 * em cada uma.
 *
 * O nome da coluna **não vem da tela**: `chave` é do catálogo fechado de
 * `FILTRAVEIS`, e é este mapa que decide onde a comparação cai. Só o VALOR vem
 * de fora, e ele entra como parâmetro do driver, nunca concatenado.
 *
 * `proprietario` compara pelo nome, e não pelo id, porque é o nome que a tela
 * mostra e é dele que o menu de valores é feito. Trocar por id exigiria o menu
 * carregar id e nome só para esconder um dos dois.
 */
function filterCondition(key: FilterKey, value: string) {
  const empty = value === WITHOUT_VALUE;
  if (key === 'origem') return empty ? isNull(lead.origem) : eq(lead.origem, value);
  if (key === 'faixa') return empty ? isNull(lead.faixaAtual) : eq(lead.faixaAtual, value);
  if (key === 'fase') return empty ? isNull(lead.fase) : eq(lead.fase, value);
  return empty ? isNull(lead.proprietarioId) : eq(user.nome, value);
}

/**
 * Os valores que cada coluna filtrável tem hoje, para o menu de filtro.
 *
 * Sai do banco, e não das 200 linhas já carregadas: a lista com teto mostraria
 * só as origens que couberam, e filtrar por uma origem que existe mas não
 * apareceu seria impossível pela tela.
 *
 * Em série dentro do mesmo `consultar` (README), e com teto por coluna: um menu
 * de trezentas origens não é um menu, é uma segunda listagem.
 */
const TETO_OF_OPTIONS = 40;

export async function filterOptions(): Promise<Record<FilterKey, string[]>> {
  return consultar(async (tx) => {
    const distintos = async (column: PgColumn) => {
      const linhas = await tx
        .selectDistinct({ v: column })
        .from(lead)
        .where(and(isNull(lead.excluidoEm), sql`${column} is not null`))
        .orderBy(column)
        .limit(TETO_OF_OPTIONS);
      // O `is not null` já está no `where`; o filtro aqui é só para o tipo.
      return linhas.map((l) => String(l.v)).filter((v) => v !== 'null');
    };

    const origem = await distintos(lead.origem);
    const faixa = await distintos(lead.faixaAtual);
    const fase = await distintos(lead.fase);
    const donos = await tx
      .selectDistinct({ v: user.nome })
      .from(lead)
      .innerJoin(user, eq(user.id, lead.proprietarioId))
      .where(isNull(lead.excluidoEm))
      .orderBy(user.nome)
      .limit(TETO_OF_OPTIONS);

    return { origem, faixa, fase, proprietario: donos.map((d) => d.v) };
  });
}

/**
 * Lista e contagem das abas na **mesma** transação. Eram duas, mais a do fuso: três
 * transações e três conexões do pool para desenhar uma tela. Dentro daqui as
 * consultas continuam em série, que é obrigatório (README).
 *
 * O filtro entra no `where`, e não sobre as linhas já buscadas, pelo mesmo
 * motivo da ordenação: com teto de 200, filtrar depois responderia "dos 200
 * mais novos, os da origem X" quando a pergunta é "os 200 leads da origem X".
 *
 * As contagens das abas, essas, **ignoram o filtro de propósito**: elas dizem
 * quantos leads existem em cada recorte, e um número que muda conforme o filtro
 * não serve para escolher para qual recorte ir.
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
        origem: lead.origem,
        score: lead.scoreAtual,
        faixa: lead.faixaAtual,
        proprietario: user.nome,
        // O id, e não só o nome: a célula editável da listagem grava o id, e
        // nome muda sem que a atribuição mude junto.
        proprietarioId: lead.proprietarioId,
        status: lead.status,
        fase: lead.fase,
        faseDesde: lead.faseDesde,
      })
      .from(lead)
      .leftJoin(contact, eq(contact.id, lead.contatoId))
      .leftJoin(user, eq(user.id, lead.proprietarioId))
      .where(and(isNull(lead.excluidoEm), recorte, filterSearch, ...conditions))
      .orderBy(...sortingSql(order, direction))
      .limit(LIMITE_LISTA);

    const queues = await queuesByTier(tx);
    const ultimas = await ultimaActivityByLead(
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
        fila: l.faixa ? (queues.get(l.faixa) ?? null) : null,
        proprietario: l.proprietario,
        proprietarioId: l.proprietarioId,
        status: l.status,
        fase: l.fase,
        diasNaFase: desdeFase ? Math.floor((agora - desdeFase.getTime()) / 86_400_000) : null,
        ultimaAtividade: ult?.em ?? null,
        ultimaAtividadeTipo: ult?.tipo ?? null,
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

async function ultimaActivityByLead(
  tx: Parameters<Parameters<typeof consultar>[0]>[0],
  ids: string[],
): Promise<Map<string, { em: Date; tipo: string }>> {
  const mapa = new Map<string, { em: Date; tipo: string }>();
  if (ids.length === 0) return mapa;

  const linhas = await tx
    .select({
      leadId: activity.leadId,
      tipo: activity.tipo,
      em: activity.ocorridaEm,
    })
    .from(activity)
    .where(inArray(activity.leadId, ids))
    .orderBy(activity.ocorridaEm);

  // Ordenado crescente: a última escrita por lead é a atividade mais recente.
  for (const l of linhas) {
    const em = paraData(l.em);
    if (l.leadId && em) mapa.set(l.leadId, { em, tipo: ROTULO_ACTIVITY[l.tipo] ?? l.tipo });
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
  /** Da faixa vigente: é ela que decide fila e proprietário. */
  queue: string | null;
  corte: number | null;
}

export interface RespostaExibida {
  pergunta: string;
  tipo: string;
  value: string;
}

export interface BlockRespostas {
  formulario: string;
  versao: number;
  respondidoEm: Date | null;
  respostas: RespostaExibida[];
}

export interface TimeItemLinha {
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
  /** O id, e não só o nome: a seleção inline grava id, porque nome muda. */
  proprietarioId: string | null;
  criadoEm: Date | null;
  etiquetas: { nome: string; cor: string | null }[];
  score: ScoreExplicado | null;
  formularios: BlockRespostas[];
  timeLinha: TimeItemLinha[];
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
        contatoId: lead.contatoId,
        nome: contact.nome,
        email: contact.email,
        telefone: contact.telefoneE164,
        documento: contact.document,
        contaId: lead.contaId,
        contaNome: account.nome,
        origem: lead.origem,
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
      .leftJoin(contact, eq(contact.id, lead.contatoId))
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
    const timeLinha = await timeCarregarLinha(tx, id, cabeca.contatoId);

    const desdeFase = paraData(cabeca.faseDesde);

    return {
      id: cabeca.id,
      nome: cabeca.nome ?? 'Lead sem contato',
      email: cabeca.email,
      telefone: cabeca.telefone,
      documento: cabeca.documento,
      contaId: cabeca.contaId,
      contaNome: cabeca.contaNome,
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
      timeLinha,
    };
  });
}

/**
 * O painel que explica o número.
 *
 * `score_lead.explicacao` guarda `{regra, versao, pontos}` — o identificador da regra,
 * não o nome dela, porque o nome muda e o histórico não pode mudar junto. O nome vem
 * do join com `regra_score`; regra apagada aparece como "regra removida" em vez de
 * sumir da conta, senão a soma dos itens deixaria de bater com o total.
 */
async function carregarScore(
  tx: Parameters<Parameters<typeof consultar>[0]>[0],
  leadId: string,
): Promise<ScoreExplicado | null> {
  const [linha] = await tx
    .select({
      valor: scoreLead.valor,
      faixa: scoreLead.faixa,
      versaoRegra: scoreLead.versaoRegra,
      explicacao: scoreLead.explicacao,
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
      .select({ id: regraScore.id, nome: regraScore.nome })
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
      .leftJoin(queue, eq(queue.id, faixaScore.filaId))
      .where(and(eq(faixaScore.nome, linha.faixa), eq(faixaScore.versao, linha.versaoRegra)))
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
 * Respostas de formulário agrupadas por formulário e versão — nunca como colunas
 * soltas na ficha. É a decisão que evita os 304 campos customizados do Lead de hoje.
 */
async function carregarRespostas(
  tx: Parameters<Parameters<typeof consultar>[0]>[0],
  leadId: string,
): Promise<BlockRespostas[]> {
  const linhas = await tx
    .select({
      formulario: formulario.nome,
      versao: formularioVersao.versao,
      versaoId: formularioVersao.id,
      pergunta: formularioPergunta.rotulo,
      ordem: formularioPergunta.ordem,
      tipo: formularioPergunta.tipo,
      valorTexto: respostaFormulario.valorTexto,
      valorNum: respostaFormulario.valorNum,
      valorData: respostaFormulario.valorData,
      valorBool: respostaFormulario.valorBool,
      valorJson: respostaFormulario.valorJson,
      criadoEm: respostaFormulario.criadoEm,
    })
    .from(respostaFormulario)
    .innerJoin(formularioVersao, eq(formularioVersao.id, respostaFormulario.versaoId))
    .innerJoin(formulario, eq(formulario.id, formularioVersao.formularioId))
    .innerJoin(formularioPergunta, eq(formularioPergunta.id, respostaFormulario.perguntaId))
    .where(eq(respostaFormulario.leadId, leadId))
    .orderBy(formulario.nome, formularioVersao.versao, formularioPergunta.ordem);

  const blocos = new Map<string, BlockRespostas>();
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
 * Atividades e conversas na mesma linha do tempo. A conversa entra com o resumo do
 * atendimento quando a monitoria já classificou — é a promessa do produto: o CRM se
 * alimenta das conversas, e o vendedor lê o que aconteceu sem abrir o Desk.
 *
 * Exportada porque a ficha da oportunidade mostra a mesma linha: o histórico de
 * uma negociação É o histórico do lead que a originou, e `atividade` não tem
 * coluna de oportunidade. Recebe a `tx` de quem chama, então continua cabendo
 * na transação da ficha que a pediu.
 */
export async function timeCarregarLinha(
  tx: Parameters<Parameters<typeof consultar>[0]>[0],
  leadId: string,
  contactId: string | null,
): Promise<TimeItemLinha[]> {
  const activities = await tx
    .select({
      id: activity.id,
      tipo: activity.tipo,
      resumo: activity.resumo,
      corpo: activity.corpo,
      autor: user.nome,
      em: activity.ocorridaEm,
    })
    .from(activity)
    .leftJoin(user, eq(user.id, activity.usuarioId))
    .where(eq(activity.leadId, leadId))
    .orderBy(desc(activity.ocorridaEm))
    .limit(50);

  const itens: TimeItemLinha[] = activities.map((a) => ({
    id: a.id,
    tipo: ROTULO_ACTIVITY[a.tipo] ?? a.tipo,
    titulo: a.resumo ?? (ROTULO_ACTIVITY[a.tipo] ?? a.tipo),
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

/* ------------------------------------------------------- ações em massa */

/** Quem pode receber um lead: usuário ativo do tenant, em ordem alfabética. */
export async function listarProprietarios(): Promise<Proprietario[]> {
  return consultar(async (tx) =>
    tx
      .select({ id: user.id, nome: user.nome })
      .from(user)
      .where(eq(user.ativo, true))
      .orderBy(user.nome),
  );
}

/**
 * Passar N leads para um proprietário.
 *
 * O `where` repete `excluido_em is null` mesmo com os ids vindo de uma lista que
 * a tela acabou de desenhar: entre desenhar e clicar cabe uma exclusão, e a
 * escrita é a última chance de recusá-la.
 *
 * Devolve quantas linhas mudaram — é o que a tela precisa para dizer "3 de 4",
 * em vez de afirmar sucesso sobre linhas que não existem mais.
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
 * Desqualificar N leads.
 *
 * Lead já convertido não volta atrás: virou oportunidade, e desqualificar o que
 * já virou receita é o tipo de escrita em massa que ninguém desfaz. Ele é
 * excluído do `where`, e a contagem devolvida mostra a diferença.
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
 * Gravar um campo da ficha, o que a célula inline faz a cada Enter.
 *
 * Três cuidados que a versão ingênua não tem:
 *
 * - **A coluna nunca vem da tela.** `campo` é chave do catálogo fechado de
 *   `campos-editaveis.ts`, e é o `switch` daqui que decide qual coluna recebe a
 *   escrita. Não existe caminho em que um nome vindo do navegador vire coluna.
 * - **E-mail e telefone moram em `contato`, não em `lead`.** A ficha junta os
 *   dois numa tela só; a escrita tem de separar de novo — e um lead sem contato
 *   simplesmente não tem onde guardar e-mail, por isso ele recusa em vez de
 *   inventar um contato.
 * - **`excluido_em is null` no `where`**, pelo mesmo motivo da ação em massa:
 *   entre desenhar a ficha e clicar no campo cabe uma exclusão, e a escrita é a
 *   última chance de recusá-la.
 *
 * Devolve `false` quando nenhuma linha mudou. É o que faz a tela **restaurar o
 * valor anterior** em vez de afirmar que gravou o que não gravou.
 *
 * **A auditoria é gravada na MESMA transação** (`registrarAuditoria` do
 * `@pipe/db`): log em transação separada some quando a mudança falha e sobra
 * quando ela é desfeita, e nos dois casos passa a mentir. O `antes` sai de uma
 * leitura feita aqui dentro, não do que a tela mandou — a tela pode estar
 * mostrando um valor de dois minutos atrás.
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
          origem: lead.origem,
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
      .select({ contatoId: lead.contatoId })
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

    // O objeto do log é `contato`, e não `lead`: é a linha que mudou de verdade,
    // e quem for ler o log procura pela tabela que tem o dado.
    await anotar(tx, tid, 'contato', dono.contatoId, antes, { ...antes, ...mudanca });
    return true;
  });
}

/**
 * Registra a alteração, só com o que de fato mudou.
 *
 * Gravar todo o objeto dos dois lados incha a tabela e esconde a mudança, que é
 * o que `diferenca` existe para evitar. E quando nada mudou não há linha
 * nenhuma: a escrita de um valor igual ao que já estava lá é um clique, não um
 * evento.
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
