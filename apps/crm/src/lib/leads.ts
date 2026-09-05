import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { ItemExplicacao } from '@pipe/core';
import {
  atividade,
  classificacaoConversa,
  contato,
  contatoEtiqueta,
  conta,
  conversa,
  etiqueta,
  faixaScore,
  fila,
  formulario,
  formularioPergunta,
  formularioVersao,
  lead,
  regraScore,
  respostaFormulario,
  scoreLead,
  usuario,
} from '@pipe/db/schema';
import { consultar, paraData, paraNumero } from './banco';

/**
 * Leads: a listagem e a ficha.
 *
 * Tudo em série dentro do `consultar` — `Promise.all` dentro da transação derruba o
 * `pipe.tenant_id` e a consulta passa a rodar sem tenant (README).
 */

/** O tipo cru vira rótulo aqui: `mudanca_fase` não é texto de tela. */
const ROTULO_ATIVIDADE: Record<string, string> = {
  nota: 'Nota',
  ligacao: 'Ligação',
  reuniao: 'Reunião',
  email: 'E-mail',
  conversa: 'Conversa',
  tarefa: 'Tarefa',
  mudanca_fase: 'Mudança de fase',
};

export const ABAS = [
  { chave: 'todos', rotulo: 'Todos' },
  { chave: 'novos', rotulo: 'Novos' },
  { chave: 'qualificados', rotulo: 'Qualificados' },
  { chave: 'sem-proprietario', rotulo: 'Sem proprietário' },
  { chave: 'parados', rotulo: 'Parados há 7 dias' },
  { chave: 'desqualificados', rotulo: 'Desqualificados' },
] as const;

export type Aba = (typeof ABAS)[number]['chave'];

export function abaValida(valor: string | undefined): Aba {
  return (ABAS.find((a) => a.chave === valor)?.chave ?? 'todos') as Aba;
}

/** A listagem é tela de trabalho, não de exportação. */
export const LIMITE_LISTA = 200;

export interface LinhaLead {
  id: string;
  nome: string;
  origem: string | null;
  score: number | null;
  faixa: string | null;
  fila: string | null;
  proprietario: string | null;
  status: string;
  fase: string | null;
  diasNaFase: number | null;
  ultimaAtividade: Date | null;
  ultimaAtividadeTipo: string | null;
}

/** Nome da fila por faixa, da versão mais recente de `faixa_score`. */
async function filasPorFaixa(tx: Parameters<Parameters<typeof consultar>[0]>[0]) {
  const linhas = await tx
    .select({ nome: faixaScore.nome, versao: faixaScore.versao, fila: fila.nome })
    .from(faixaScore)
    .leftJoin(fila, eq(fila.id, faixaScore.filaId))
    .orderBy(faixaScore.versao);
  const mapa = new Map<string, string | null>();
  // Ordenado por versão crescente: a última escrita vence, que é a versão mais nova.
  for (const l of linhas) mapa.set(l.nome, l.fila);
  return mapa;
}

/**
 * Como agrupar a lista. É o que substitui os quatro relatórios que eram item de
 * menu: "por proprietário" e "origem e campanha" são a mesma lista, dobrada por uma
 * coluna. Relatório que é recorte de lista mora na lista.
 */
export const AGRUPAMENTOS = [
  { chave: 'nenhum', rotulo: 'Sem agrupamento' },
  { chave: 'proprietario', rotulo: 'Proprietário' },
  { chave: 'origem', rotulo: 'Origem' },
  { chave: 'fase', rotulo: 'Fase' },
  { chave: 'faixa', rotulo: 'Faixa de score' },
] as const;

export type Agrupamento = (typeof AGRUPAMENTOS)[number]['chave'];

export function agrupamentoValido(valor: string | undefined): Agrupamento {
  return (AGRUPAMENTOS.find((a) => a.chave === valor)?.chave ?? 'nenhum') as Agrupamento;
}

export interface Grupo {
  titulo: string;
  linhas: LinhaLead[];
}

/** Dobra a lista pela coluna escolhida, preservando a ordem de dentro do grupo. */
export function agrupar(linhas: LinhaLead[], por: Agrupamento): Grupo[] {
  if (por === 'nenhum') return [{ titulo: '', linhas }];
  const chaveDe = (l: LinhaLead) =>
    por === 'proprietario'
      ? (l.proprietario ?? 'Sem proprietário')
      : por === 'origem'
        ? (l.origem ?? 'Sem origem')
        : por === 'fase'
          ? (l.fase ?? 'Sem fase')
          : (l.faixa ?? 'Sem score');

  const mapa = new Map<string, LinhaLead[]>();
  for (const l of linhas) {
    const chave = chaveDe(l);
    const atual = mapa.get(chave);
    if (atual) atual.push(l);
    else mapa.set(chave, [l]);
  }
  return [...mapa.entries()]
    .map(([titulo, dela]) => ({ titulo, linhas: dela }))
    .sort((a, b) => b.linhas.length - a.linhas.length);
}

export interface ListaDeLeads {
  linhas: LinhaLead[];
  contagens: Record<Aba, number>;
}

/**
 * Lista e contagem das abas na **mesma** transação. Eram duas, mais a do fuso: três
 * transações e três conexões do pool para desenhar uma tela. Dentro daqui as
 * consultas continuam em série, que é obrigatório (README).
 */
export async function carregarListaDeLeads(aba: Aba, busca: string): Promise<ListaDeLeads> {
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

    const termo = busca.trim();
    const filtroBusca = termo
      ? sql`(${contato.nome} ilike ${'%' + termo + '%'}
             or ${contato.documento} ilike ${'%' + termo + '%'}
             or ${contato.telefoneE164} ilike ${'%' + termo + '%'}
             or ${contato.email} ilike ${'%' + termo + '%'})`
      : undefined;

    const cru = await tx
      .select({
        id: lead.id,
        nome: contato.nome,
        origem: lead.origem,
        score: lead.scoreAtual,
        faixa: lead.faixaAtual,
        proprietario: usuario.nome,
        status: lead.status,
        fase: lead.fase,
        faseDesde: lead.faseDesde,
      })
      .from(lead)
      .leftJoin(contato, eq(contato.id, lead.contatoId))
      .leftJoin(usuario, eq(usuario.id, lead.proprietarioId))
      .where(and(isNull(lead.excluidoEm), recorte, filtroBusca))
      .orderBy(desc(lead.criadoEm))
      .limit(LIMITE_LISTA);

    const filas = await filasPorFaixa(tx);
    const ultimas = await ultimaAtividadePorLead(
      tx,
      cru.map((l) => l.id),
    );
    const [contagem] = await tx
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
        fila: l.faixa ? (filas.get(l.faixa) ?? null) : null,
        proprietario: l.proprietario,
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
        todos: contagem?.todos ?? 0,
        novos: contagem?.novos ?? 0,
        qualificados: contagem?.qualificados ?? 0,
        'sem-proprietario': contagem?.semProprietario ?? 0,
        parados: contagem?.parados ?? 0,
        desqualificados: contagem?.desqualificados ?? 0,
      },
    };
  });
}

async function ultimaAtividadePorLead(
  tx: Parameters<Parameters<typeof consultar>[0]>[0],
  ids: string[],
): Promise<Map<string, { em: Date; tipo: string }>> {
  const mapa = new Map<string, { em: Date; tipo: string }>();
  if (ids.length === 0) return mapa;

  const linhas = await tx
    .select({
      leadId: atividade.leadId,
      tipo: atividade.tipo,
      em: atividade.ocorridaEm,
    })
    .from(atividade)
    .where(inArray(atividade.leadId, ids))
    .orderBy(atividade.ocorridaEm);

  // Ordenado crescente: a última escrita por lead é a atividade mais recente.
  for (const l of linhas) {
    const em = paraData(l.em);
    if (l.leadId && em) mapa.set(l.leadId, { em, tipo: ROTULO_ATIVIDADE[l.tipo] ?? l.tipo });
  }
  return mapa;
}

/* ------------------------------------------------------------------ a ficha */

export interface RegraExplicada extends ItemExplicacao {
  nome: string;
}

export interface ScoreExplicado {
  valor: number;
  faixa: string | null;
  versaoRegra: number;
  calculadoEm: Date | null;
  itens: RegraExplicada[];
  /** Da faixa vigente: é ela que decide fila e proprietário. */
  fila: string | null;
  corte: number | null;
}

export interface RespostaExibida {
  pergunta: string;
  tipo: string;
  valor: string;
}

export interface BlocoRespostas {
  formulario: string;
  versao: number;
  respondidoEm: Date | null;
  respostas: RespostaExibida[];
}

export interface ItemLinhaDoTempo {
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
  documento: string | null;
  contaNome: string | null;
  origem: string | null;
  campanha: string | null;
  utm: Record<string, unknown>;
  customizados: Record<string, unknown>;
  status: string;
  fase: string | null;
  faseDesde: Date | null;
  diasNaFase: number | null;
  proprietario: string | null;
  criadoEm: Date | null;
  etiquetas: { nome: string; cor: string | null }[];
  score: ScoreExplicado | null;
  formularios: BlocoRespostas[];
  linhaDoTempo: ItemLinhaDoTempo[];
}

function textoDaResposta(r: {
  tipo: string;
  valorTexto: string | null;
  valorNum: unknown;
  valorData: unknown;
  valorBool: boolean | null;
  valorJson: unknown;
}): string {
  if (r.valorTexto !== null && r.valorTexto !== undefined) return r.valorTexto;
  if (r.valorBool !== null && r.valorBool !== undefined) return r.valorBool ? 'Sim' : 'Não';
  const num = paraNumero(r.valorNum);
  if (num !== null) {
    return r.tipo === 'numero'
      ? num.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
      : String(num);
  }
  const dt = paraData(r.valorData);
  if (dt) return dt.toLocaleDateString('pt-BR');
  if (Array.isArray(r.valorJson)) return r.valorJson.join(', ');
  if (r.valorJson !== null && r.valorJson !== undefined) return JSON.stringify(r.valorJson);
  return '—';
}

export async function carregarFicha(id: string): Promise<Ficha | null> {
  return consultar(async (tx) => {
    const [cabeca] = await tx
      .select({
        id: lead.id,
        contatoId: lead.contatoId,
        nome: contato.nome,
        email: contato.email,
        telefone: contato.telefoneE164,
        documento: contato.documento,
        contaNome: conta.nome,
        origem: lead.origem,
        campanha: lead.campanha,
        utm: lead.utm,
        customizados: lead.customizados,
        status: lead.status,
        fase: lead.fase,
        faseDesde: lead.faseDesde,
        proprietario: usuario.nome,
        criadoEm: lead.criadoEm,
      })
      .from(lead)
      .leftJoin(contato, eq(contato.id, lead.contatoId))
      .leftJoin(conta, eq(conta.id, lead.contaId))
      .leftJoin(usuario, eq(usuario.id, lead.proprietarioId))
      .where(and(eq(lead.id, id), isNull(lead.excluidoEm)))
      .limit(1);

    if (!cabeca) return null;

    const etiquetas = cabeca.contatoId
      ? await tx
          .select({ nome: etiqueta.nome, cor: etiqueta.cor })
          .from(contatoEtiqueta)
          .innerJoin(etiqueta, eq(etiqueta.id, contatoEtiqueta.etiquetaId))
          .where(eq(contatoEtiqueta.contatoId, cabeca.contatoId))
          .orderBy(etiqueta.nome)
      : [];

    const score = await carregarScore(tx, id);
    const formularios = await carregarRespostas(tx, id);
    const linhaDoTempo = await carregarLinhaDoTempo(tx, id, cabeca.contatoId);

    const desdeFase = paraData(cabeca.faseDesde);

    return {
      id: cabeca.id,
      nome: cabeca.nome ?? 'Lead sem contato',
      email: cabeca.email,
      telefone: cabeca.telefone,
      documento: cabeca.documento,
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
      criadoEm: paraData(cabeca.criadoEm),
      etiquetas,
      score,
      formularios,
      linhaDoTempo,
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

  const itensCrus = (Array.isArray(linha.explicacao) ? linha.explicacao : []) as ItemExplicacao[];
  const ids = itensCrus.map((i) => i.regra).filter((i) => typeof i === 'string');

  const nomes = new Map<string, string>();
  if (ids.length > 0) {
    const regras = await tx
      .select({ id: regraScore.id, nome: regraScore.nome })
      .from(regraScore)
      .where(inArray(regraScore.id, ids));
    for (const r of regras) nomes.set(r.id, r.nome);
  }

  let filaDaFaixa: string | null = null;
  let corte: number | null = null;
  if (linha.faixa) {
    const [f] = await tx
      .select({ fila: fila.nome, minimo: faixaScore.minimo })
      .from(faixaScore)
      .leftJoin(fila, eq(fila.id, faixaScore.filaId))
      .where(and(eq(faixaScore.nome, linha.faixa), eq(faixaScore.versao, linha.versaoRegra)))
      .limit(1);
    filaDaFaixa = f?.fila ?? null;
    corte = f?.minimo ?? null;
  }

  return {
    valor: linha.valor,
    faixa: linha.faixa,
    versaoRegra: linha.versaoRegra,
    calculadoEm: paraData(linha.calculadoEm),
    itens: itensCrus.map((i) => ({ ...i, nome: nomes.get(i.regra) ?? 'regra removida' })),
    fila: filaDaFaixa,
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
): Promise<BlocoRespostas[]> {
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

  const blocos = new Map<string, BlocoRespostas>();
  for (const l of linhas) {
    let bloco = blocos.get(l.versaoId);
    if (!bloco) {
      bloco = {
        formulario: l.formulario,
        versao: l.versao,
        respondidoEm: paraData(l.criadoEm),
        respostas: [],
      };
      blocos.set(l.versaoId, bloco);
    }
    bloco.respostas.push({ pergunta: l.pergunta, tipo: l.tipo, valor: textoDaResposta(l) });
  }
  return [...blocos.values()];
}

/**
 * Atividades e conversas na mesma linha do tempo. A conversa entra com o resumo do
 * atendimento quando a monitoria já classificou — é a promessa do produto: o CRM se
 * alimenta das conversas, e o vendedor lê o que aconteceu sem abrir o Desk.
 */
async function carregarLinhaDoTempo(
  tx: Parameters<Parameters<typeof consultar>[0]>[0],
  leadId: string,
  contatoId: string | null,
): Promise<ItemLinhaDoTempo[]> {
  const atividades = await tx
    .select({
      id: atividade.id,
      tipo: atividade.tipo,
      resumo: atividade.resumo,
      corpo: atividade.corpo,
      autor: usuario.nome,
      em: atividade.ocorridaEm,
    })
    .from(atividade)
    .leftJoin(usuario, eq(usuario.id, atividade.usuarioId))
    .where(eq(atividade.leadId, leadId))
    .orderBy(desc(atividade.ocorridaEm))
    .limit(50);

  const itens: ItemLinhaDoTempo[] = atividades.map((a) => ({
    id: a.id,
    tipo: ROTULO_ATIVIDADE[a.tipo] ?? a.tipo,
    titulo: a.resumo ?? (ROTULO_ATIVIDADE[a.tipo] ?? a.tipo),
    corpo: a.corpo,
    autor: a.autor,
    em: paraData(a.em) ?? new Date(0),
  }));

  if (contatoId) {
    const conversas = await tx
      .select({
        id: conversa.id,
        encerradaEm: conversa.encerradaEm,
        criadaEm: conversa.criadaEm,
        atendente: usuario.nome,
        filaNome: fila.nome,
        resumo: classificacaoConversa.resumo,
        categoria: classificacaoConversa.categoria,
      })
      .from(conversa)
      .leftJoin(usuario, eq(usuario.id, conversa.atendenteId))
      .leftJoin(fila, eq(fila.id, conversa.filaId))
      .leftJoin(classificacaoConversa, eq(classificacaoConversa.conversaId, conversa.id))
      .where(eq(conversa.contatoId, contatoId))
      .orderBy(desc(conversa.criadaEm))
      .limit(20);

    for (const c of conversas) {
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
