import { and, asc, desc, eq, gte, lt } from 'drizzle-orm';
import { resultado, resultadoVazio, type ResultadoMetrica } from '@pipe/core';
import {
  avaliacao,
  classificacaoConversa,
  contato,
  conversa,
  criterio,
  fila,
  formularioAvaliacao,
  grupoCriterio,
  mensagem,
  respostaAvaliacao,
  usuario,
} from '@pipe/db/schema';
import { consultar, type Janela } from './banco';
import { uuidOuNada } from './formato';
import { fatalReprovado } from './nota-avaliacao';

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

export const ROTULO_ESTADO_AVALIACAO: Record<string, string> = {
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
export const ROTULO_VALOR: Record<string, string> = {
  conforme: 'Conforme',
  nao_conforme: 'Não conforme',
  nao_se_aplica: 'Não se aplica',
};

export interface AvaliacaoNaLista {
  id: string;
  conversaId: string;
  contato: string | null;
  fila: string | null;
  avaliado: string | null;
  formulario: string;
  notaMaxima: number;
  /** `null` quando a avaliação ainda não fechou nota — e aí ela sai da média. */
  nota: number | null;
  conceito: string | null;
  avaliadorTipo: string;
  confiancaIa: number | null;
  estado: string;
  avaliadaEm: Date | null;
  /** Categoria e sentimento da classificação da conversa, quando houver. */
  categoria: string | null;
  sentimento: string | null;
}

export interface LinhaPorAtendente {
  atendente: string;
  media: ResultadoMetrica;
  /** Avaliações com nota zero por critério fatal — a média sozinha esconde isto. */
  zeradas: number;
}

export interface PainelDeMonitoria {
  avaliacoes: AvaliacaoNaLista[];
  /** Média geral das notas, com população e descartadas ao lado. */
  media: ResultadoMetrica;
  porAtendente: LinhaPorAtendente[];
  /** Quantas foram da IA e quantas de gente: a nota da IA é sugestão até revisão. */
  porAvaliador: { tipo: string; total: number }[];
  /** Confiança média declarada pelo modelo, de 0 a 1. Só das avaliações da IA. */
  confiancaIa: ResultadoMetrica;
  /** Nota máxima do formulário mais usado no recorte — a escala em que a média é lida. */
  escala: number;
}

export interface FiltroDeMonitoria {
  atendenteId?: string | undefined;
  avaliadorTipo?: string | undefined;
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
function mediaDasNotas(itens: readonly AvaliacaoNaLista[]): ResultadoMetrica {
  let soma = 0;
  let populacao = 0;
  let excluidas = 0;
  for (const a of itens) {
    if (a.nota === null || !ESTADOS_VALENDO.has(a.estado)) {
      excluidas += 1;
      continue;
    }
    soma += a.nota;
    populacao += 1;
  }
  return populacao > 0 ? resultado(soma, populacao, excluidas) : resultadoVazio(excluidas);
}

export async function carregarMonitoria(
  janela: Janela,
  filtro: FiltroDeMonitoria = {},
): Promise<PainelDeMonitoria> {
  return consultar(async (tx) => {
    const recorte = [
      gte(avaliacao.avaliadaEm, janela.inicio),
      lt(avaliacao.avaliadaEm, janela.fim),
      filtro.atendenteId ? eq(avaliacao.avaliadoId, filtro.atendenteId) : undefined,
      filtro.avaliadorTipo ? eq(avaliacao.avaliadorTipo, filtro.avaliadorTipo) : undefined,
    ].filter((c) => c !== undefined);

    const linhas = await tx
      .select({
        id: avaliacao.id,
        conversaId: avaliacao.conversaId,
        contato: contato.nome,
        fila: fila.nome,
        avaliado: usuario.nome,
        formulario: formularioAvaliacao.nome,
        notaMaxima: formularioAvaliacao.notaMaxima,
        nota: avaliacao.nota,
        conceito: avaliacao.conceito,
        avaliadorTipo: avaliacao.avaliadorTipo,
        confiancaIa: avaliacao.confiancaIa,
        estado: avaliacao.estado,
        avaliadaEm: avaliacao.avaliadaEm,
        categoria: classificacaoConversa.categoria,
        sentimento: classificacaoConversa.sentimento,
      })
      .from(avaliacao)
      .innerJoin(formularioAvaliacao, eq(formularioAvaliacao.id, avaliacao.formularioId))
      .innerJoin(conversa, eq(conversa.id, avaliacao.conversaId))
      .leftJoin(contato, eq(contato.id, conversa.contatoId))
      .leftJoin(fila, eq(fila.id, conversa.filaId))
      .leftJoin(usuario, eq(usuario.id, avaliacao.avaliadoId))
      .leftJoin(classificacaoConversa, eq(classificacaoConversa.conversaId, avaliacao.conversaId))
      .where(and(...recorte))
      .orderBy(desc(avaliacao.avaliadaEm));

    const avaliacoes: AvaliacaoNaLista[] = linhas.map((l) => ({
      ...l,
      notaMaxima: Number(l.notaMaxima),
      nota: numeroOuNulo(l.nota),
      confiancaIa: numeroOuNulo(l.confiancaIa),
    }));

    /* Agrupamento em memória, e não `GROUP BY`: a lista inteira já veio, e a
       média precisa da MESMA regra de exclusão da geral. Duas contas em dois
       lugares é como o número da tabela deixa de bater com o do cartão. */
    const grupos = new Map<string, AvaliacaoNaLista[]>();
    for (const a of avaliacoes) {
      const chave = a.avaliado ?? 'Sem atendente';
      const atual = grupos.get(chave);
      if (atual) atual.push(a);
      else grupos.set(chave, [a]);
    }

    const porAtendente: LinhaPorAtendente[] = [...grupos.keys()].sort().map((atendente) => {
      const itens = grupos.get(atendente) as AvaliacaoNaLista[];
      return {
        atendente,
        media: mediaDasNotas(itens),
        zeradas: itens.filter((a) => a.nota === 0 && ESTADOS_VALENDO.has(a.estado)).length,
      };
    });

    const contagem = new Map<string, number>();
    for (const a of avaliacoes)
      contagem.set(a.avaliadorTipo, (contagem.get(a.avaliadorTipo) ?? 0) + 1);

    const daIa = avaliacoes.filter((a) => a.avaliadorTipo === 'ia');
    const comConfianca = daIa.filter((a) => a.confiancaIa !== null);
    const confiancaIa =
      comConfianca.length > 0
        ? resultado(
            comConfianca.reduce((s, a) => s + (a.confiancaIa ?? 0), 0),
            comConfianca.length,
            daIa.length - comConfianca.length,
          )
        : resultadoVazio(daIa.length);

    return {
      avaliacoes,
      media: mediaDasNotas(avaliacoes),
      porAtendente,
      porAvaliador: [...contagem.entries()]
        .map(([tipo, total]) => ({ tipo, total }))
        .sort((a, b) => a.tipo.localeCompare(b.tipo)),
      confiancaIa,
      escala: avaliacoes[0]?.notaMaxima ?? 100,
    };
  });
}

/* ------------------------------------------------------- a ficha da avaliação */

export interface RespostaDeCriterio {
  criterioId: string;
  criterio: string;
  descricao: string | null;
  tipo: string;
  fatal: boolean;
  peso: number;
  valor: string | null;
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
  nome: string;
  peso: number;
  criterios: RespostaDeCriterio[];
}

export interface FichaDeAvaliacao {
  cabecalho: AvaliacaoNaLista;
  grupos: GrupoDaFicha[];
  /** Soma dos pontos: a nota ANTES do critério fatal. Mostra o tamanho do estrago. */
  notaAntesDoFatal: number;
  /** Nomes dos critérios fatais reprovados. Vazio quando nenhum zerou a nota. */
  fataisReprovados: string[];
  /** O resumo da classificação da conversa, quando a IA também classificou. */
  resumo: string | null;
  modeloClassificacao: string | null;
}

export async function carregarFicha(id: string): Promise<FichaDeAvaliacao | null> {
  /* O id vem do caminho da URL, que é entrada de fora. Sem esta linha,
     `/monitoria/abc` chegava ao Postgres como `abc::uuid` e a tela devolvia
     500 — "não existe" é 404, e é isso que o `null` daqui vira lá em cima. */
  if (!uuidOuNada(id)) return null;

  return consultar(async (tx) => {
    const [cabeca] = await tx
      .select({
        id: avaliacao.id,
        conversaId: avaliacao.conversaId,
        contato: contato.nome,
        fila: fila.nome,
        avaliado: usuario.nome,
        formulario: formularioAvaliacao.nome,
        formularioId: formularioAvaliacao.id,
        notaMaxima: formularioAvaliacao.notaMaxima,
        nota: avaliacao.nota,
        conceito: avaliacao.conceito,
        avaliadorTipo: avaliacao.avaliadorTipo,
        confiancaIa: avaliacao.confiancaIa,
        estado: avaliacao.estado,
        avaliadaEm: avaliacao.avaliadaEm,
        categoria: classificacaoConversa.categoria,
        sentimento: classificacaoConversa.sentimento,
        resumo: classificacaoConversa.resumo,
        modeloClassificacao: classificacaoConversa.modelo,
      })
      .from(avaliacao)
      .innerJoin(formularioAvaliacao, eq(formularioAvaliacao.id, avaliacao.formularioId))
      .innerJoin(conversa, eq(conversa.id, avaliacao.conversaId))
      .leftJoin(contato, eq(contato.id, conversa.contatoId))
      .leftJoin(fila, eq(fila.id, conversa.filaId))
      .leftJoin(usuario, eq(usuario.id, avaliacao.avaliadoId))
      .leftJoin(classificacaoConversa, eq(classificacaoConversa.conversaId, avaliacao.conversaId))
      .where(eq(avaliacao.id, id))
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
        descricao: criterio.descricao,
        tipo: criterio.tipo,
        fatal: criterio.fatal,
        peso: criterio.peso,
        valor: respostaAvaliacao.valor,
        pontos: respostaAvaliacao.pontos,
        justificativa: respostaAvaliacao.justificativa,
        evidenciaId: respostaAvaliacao.evidenciaMensagemId,
      })
      .from(grupoCriterio)
      .innerJoin(criterio, eq(criterio.grupoId, grupoCriterio.id))
      .leftJoin(
        respostaAvaliacao,
        and(
          eq(respostaAvaliacao.criterioId, criterio.id),
          eq(respostaAvaliacao.avaliacaoId, cabeca.id),
        ),
      )
      .where(eq(grupoCriterio.formularioId, cabeca.formularioId))
      .orderBy(asc(grupoCriterio.ordem), asc(criterio.ordem));

    /* As mensagens citadas, numa consulta só. `mensagem` é particionada e a
       unicidade dela é (id, criada_em), por isso não há chave estrangeira em
       `evidencia_mensagem_id` — a junção é pelo id e basta para exibir. */
    const evidencias = await tx
      .select({
        id: mensagem.id,
        conteudo: mensagem.conteudo,
        autorTipo: mensagem.autorTipo,
        criadaEm: mensagem.criadaEm,
      })
      .from(mensagem)
      .where(eq(mensagem.conversaId, cabeca.conversaId));

    const porMensagem = new Map(evidencias.map((m) => [m.id, m]));

    const grupos: GrupoDaFicha[] = [];
    for (const l of linhas) {
      let grupo = grupos.find((g) => g.id === l.grupoId);
      if (!grupo) {
        grupo = { id: l.grupoId, nome: l.grupoNome, peso: Number(l.grupoPeso), criterios: [] };
        grupos.push(grupo);
      }
      const citada = l.evidenciaId ? porMensagem.get(l.evidenciaId) : undefined;
      grupo.criterios.push({
        criterioId: l.criterioId,
        criterio: l.criterioNome,
        descricao: l.descricao,
        tipo: l.tipo,
        fatal: l.fatal,
        peso: Number(l.peso),
        valor: l.valor,
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
        .filter((c) => fatalReprovado(c.tipo, c.fatal, c.valor))
        .map((c) => c.criterio),
      resumo: cabeca.resumo,
      modeloClassificacao: cabeca.modeloClassificacao,
    };
  });
}
