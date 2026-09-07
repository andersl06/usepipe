import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { conta, lead, oportunidade, usuario } from '@pipe/db/schema';
import { consultar, paraData, paraNumero } from './banco';
import { carregarLinhaDoTempo, type ItemLinhaDoTempo } from './leads';

/**
 * Funil de oportunidades.
 *
 * As fases são catálogo do produto e não coluna do banco (`oportunidade.fase` é
 * texto): trocar a ordem ou o nome de uma fase é configuração de tenant, não
 * migration. Enquanto a tela de configuração não existe, o catálogo vive aqui.
 */
export const FASES = ['Novo', 'Qualificado', 'Reunião', 'Proposta', 'Fechamento'] as const;
export type Fase = (typeof FASES)[number];

export function faseValida(valor: string): valor is Fase {
  return (FASES as readonly string[]).includes(valor);
}

export interface CartaoOportunidade {
  id: string;
  nome: string;
  valor: number | null;
  probabilidade: number | null;
  proprietario: string | null;
  contaNome: string | null;
  leadId: string | null;
  score: number | null;
  fechamentoPrevisto: Date | null;
}

export interface ColunaFunil {
  fase: string;
  cartoes: CartaoOportunidade[];
  total: number;
  quantidade: number;
}

export interface Funil {
  colunas: ColunaFunil[];
  totalGeral: number;
  quantidadeGeral: number;
  ponderadoGeral: number;
}

export async function carregarFunil(): Promise<Funil> {
  const linhas = await consultar(async (tx) =>
    tx
      .select({
        id: oportunidade.id,
        nome: oportunidade.nome,
        valor: oportunidade.valor,
        probabilidade: oportunidade.probabilidade,
        fase: oportunidade.fase,
        fechamentoPrevisto: oportunidade.fechamentoPrevisto,
        proprietario: usuario.nome,
        contaNome: conta.nome,
        leadId: oportunidade.leadId,
        score: lead.scoreAtual,
      })
      .from(oportunidade)
      .leftJoin(usuario, eq(usuario.id, oportunidade.proprietarioId))
      .leftJoin(conta, eq(conta.id, oportunidade.contaId))
      .leftJoin(lead, eq(lead.id, oportunidade.leadId))
      .where(isNull(oportunidade.fechadaEm))
      .orderBy(asc(oportunidade.nome)),
  );

  const colunas: ColunaFunil[] = FASES.map((fase) => ({
    fase,
    cartoes: [],
    total: 0,
    quantidade: 0,
  }));
  let ponderadoGeral = 0;

  for (const l of linhas) {
    const coluna = colunas.find((c) => c.fase === l.fase);
    if (!coluna) continue; // Fase fora do catálogo: some do quadro em vez de criar coluna órfã.
    const valor = paraNumero(l.valor);
    coluna.cartoes.push({
      id: l.id,
      nome: l.nome,
      valor,
      probabilidade: l.probabilidade,
      proprietario: l.proprietario,
      contaNome: l.contaNome,
      leadId: l.leadId,
      score: l.score,
      fechamentoPrevisto: paraData(l.fechamentoPrevisto),
    });
    coluna.total += valor ?? 0;
    coluna.quantidade += 1;
    ponderadoGeral += ((valor ?? 0) * (l.probabilidade ?? 0)) / 100;
  }

  return {
    colunas,
    totalGeral: colunas.reduce((s, c) => s + c.total, 0),
    quantidadeGeral: colunas.reduce((s, c) => s + c.quantidade, 0),
    ponderadoGeral,
  };
}

/**
 * Arrastar entre fases. A probabilidade acompanha a fase porque é dela que sai o
 * valor ponderado do painel — deixar a probabilidade parada faria o painel discordar
 * do quadro que o vendedor acabou de mexer.
 */
const PROBABILIDADE_POR_FASE: Record<Fase, number> = {
  Novo: 10,
  Qualificado: 25,
  Reunião: 45,
  Proposta: 65,
  Fechamento: 85,
};

/* ======================================================= listagem e ficha
 *
 * O quadro responde "como está o funil"; a listagem responde "quais são", que é
 * outra pergunta e precisava de outra tela. É a mesma divisão do Twenty entre
 * visão kanban e visão tabela do mesmo objeto — os dados são os mesmos, e o que
 * muda é a forma. Por isso as duas moram no mesmo endereço, com `?vista=`: uma
 * visão de tela não merece uma rota.
 *
 * A diferença que importa: o quadro só mostra oportunidade ABERTA, porque
 * arrastar uma fechada não faz sentido. A listagem mostra as fechadas também —
 * é ela que responde "o que ganhamos este mês".
 */

export const SITUACOES = [
  { chave: 'abertas', rotulo: 'Abertas' },
  { chave: 'ganhas', rotulo: 'Ganhas' },
  { chave: 'perdidas', rotulo: 'Perdidas' },
  { chave: 'todas', rotulo: 'Todas' },
] as const;

export type Situacao = (typeof SITUACOES)[number]['chave'];

export function situacaoValida(valor: string | undefined): Situacao {
  return (SITUACOES.find((s) => s.chave === valor)?.chave ?? 'abertas') as Situacao;
}

/** A listagem é tela de trabalho, não de exportação. Mesmo teto das outras. */
export const LIMITE_LISTA = 200;

export interface LinhaOportunidade {
  id: string;
  nome: string;
  contaId: string | null;
  contaNome: string | null;
  leadId: string | null;
  fase: string;
  valor: number | null;
  probabilidade: number | null;
  proprietario: string | null;
  fechamentoPrevisto: Date | null;
  fechadaEm: Date | null;
  ganha: boolean | null;
}

function recorteDaSituacao(situacao: Situacao) {
  if (situacao === 'abertas') return isNull(oportunidade.fechadaEm);
  if (situacao === 'ganhas') return and(isNotNull(oportunidade.fechadaEm), eq(oportunidade.ganha, true));
  if (situacao === 'perdidas')
    return and(isNotNull(oportunidade.fechadaEm), eq(oportunidade.ganha, false));
  return undefined;
}

export async function listarOportunidades(
  situacao: Situacao = 'abertas',
  busca = '',
): Promise<LinhaOportunidade[]> {
  return consultar(async (tx) => {
    const termo = busca.trim();
    const filtro = termo
      ? sql`(${oportunidade.nome} ilike ${'%' + termo + '%'}
             or ${conta.nome} ilike ${'%' + termo + '%'})`
      : undefined;

    const linhas = await tx
      .select({
        id: oportunidade.id,
        nome: oportunidade.nome,
        contaId: oportunidade.contaId,
        contaNome: conta.nome,
        leadId: oportunidade.leadId,
        fase: oportunidade.fase,
        valor: oportunidade.valor,
        probabilidade: oportunidade.probabilidade,
        proprietario: usuario.nome,
        fechamentoPrevisto: oportunidade.fechamentoPrevisto,
        fechadaEm: oportunidade.fechadaEm,
        ganha: oportunidade.ganha,
      })
      .from(oportunidade)
      .leftJoin(conta, eq(conta.id, oportunidade.contaId))
      .leftJoin(usuario, eq(usuario.id, oportunidade.proprietarioId))
      .where(recorteDaSituacao(situacao) ? and(recorteDaSituacao(situacao), filtro) : filtro)
      // Aberta primeiro, e dentro disso a de maior valor: é o que ainda dá para
      // mexer, na ordem em que se mexe.
      .orderBy(asc(oportunidade.fechadaEm), desc(oportunidade.valor))
      .limit(LIMITE_LISTA);

    return linhas.map((o) => ({
      ...o,
      valor: paraNumero(o.valor),
      fechamentoPrevisto: paraData(o.fechamentoPrevisto),
      fechadaEm: paraData(o.fechadaEm),
    }));
  });
}

export interface FichaOportunidade extends LinhaOportunidade {
  moeda: string;
  motivoPerda: string | null;
  criadoEm: Date | null;
  /** O score do lead que originou a negociação, quando ele existe. */
  score: number | null;
  faixa: string | null;
  /** As outras da mesma conta: o contexto comercial de quem já está negociando. */
  irmas: LinhaOportunidade[];
  /** O histórico do lead, que é o histórico da negociação. */
  linhaDoTempo: ItemLinhaDoTempo[];
}

export async function carregarOportunidade(id: string): Promise<FichaOportunidade | null> {
  return consultar(async (tx) => {
    const [cabeca] = await tx
      .select({
        id: oportunidade.id,
        nome: oportunidade.nome,
        contaId: oportunidade.contaId,
        contaNome: conta.nome,
        leadId: oportunidade.leadId,
        contatoId: lead.contatoId,
        score: lead.scoreAtual,
        faixa: lead.faixaAtual,
        fase: oportunidade.fase,
        valor: oportunidade.valor,
        moeda: oportunidade.moeda,
        probabilidade: oportunidade.probabilidade,
        proprietario: usuario.nome,
        fechamentoPrevisto: oportunidade.fechamentoPrevisto,
        fechadaEm: oportunidade.fechadaEm,
        ganha: oportunidade.ganha,
        motivoPerda: oportunidade.motivoPerda,
        criadoEm: oportunidade.criadoEm,
      })
      .from(oportunidade)
      .leftJoin(conta, eq(conta.id, oportunidade.contaId))
      .leftJoin(usuario, eq(usuario.id, oportunidade.proprietarioId))
      .leftJoin(lead, and(eq(lead.id, oportunidade.leadId), isNull(lead.excluidoEm)))
      .where(eq(oportunidade.id, id))
      .limit(1);

    if (!cabeca) return null;

    // Em série, nunca em paralelo: `Promise.all` aqui dentro derruba o
    // `pipe.tenant_id` da transação (README).
    const irmas = cabeca.contaId
      ? await tx
          .select({
            id: oportunidade.id,
            nome: oportunidade.nome,
            contaId: oportunidade.contaId,
            contaNome: conta.nome,
            leadId: oportunidade.leadId,
            fase: oportunidade.fase,
            valor: oportunidade.valor,
            probabilidade: oportunidade.probabilidade,
            proprietario: usuario.nome,
            fechamentoPrevisto: oportunidade.fechamentoPrevisto,
            fechadaEm: oportunidade.fechadaEm,
            ganha: oportunidade.ganha,
          })
          .from(oportunidade)
          .leftJoin(conta, eq(conta.id, oportunidade.contaId))
          .leftJoin(usuario, eq(usuario.id, oportunidade.proprietarioId))
          .where(and(eq(oportunidade.contaId, cabeca.contaId), sql`${oportunidade.id} <> ${id}`))
          .orderBy(asc(oportunidade.fechadaEm), desc(oportunidade.valor))
      : [];

    const linhaDoTempo = cabeca.leadId
      ? await carregarLinhaDoTempo(tx, cabeca.leadId, cabeca.contatoId)
      : [];

    return {
      ...cabeca,
      valor: paraNumero(cabeca.valor),
      fechamentoPrevisto: paraData(cabeca.fechamentoPrevisto),
      fechadaEm: paraData(cabeca.fechadaEm),
      criadoEm: paraData(cabeca.criadoEm),
      irmas: irmas.map((o) => ({
        ...o,
        valor: paraNumero(o.valor),
        fechamentoPrevisto: paraData(o.fechamentoPrevisto),
        fechadaEm: paraData(o.fechadaEm),
      })),
      linhaDoTempo,
    };
  });
}

export async function moverParaFase(oportunidadeId: string, fase: Fase): Promise<void> {
  await consultar(async (tx) => {
    await tx
      .update(oportunidade)
      .set({
        fase,
        probabilidade: PROBABILIDADE_POR_FASE[fase],
        atualizadoEm: sql`now()`,
      })
      .where(and(eq(oportunidade.id, oportunidadeId), isNull(oportunidade.fechadaEm)));
  });
}
