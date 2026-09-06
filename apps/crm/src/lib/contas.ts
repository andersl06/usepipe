import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { conta, contato, lead, oportunidade, usuario } from '@pipe/db/schema';
import { consultar, paraData, paraNumero } from './banco';

/**
 * Contas.
 *
 * A conta estava fora do menu porque não tinha tela, e não tinha tela porque
 * ninguém tinha decidido o que ela mostra. Mostra duas coisas, e é o que a
 * empresa pergunta quando abre uma: **quem eu conheço lá dentro** e **quanto
 * dinheiro está em jogo**. Contatos e oportunidades, nessa ordem.
 *
 * Tudo em série dentro do `consultar` — `Promise.all` dentro da transação
 * derruba o `pipe.tenant_id` e a consulta passa a rodar sem tenant (README).
 */

/** A listagem é tela de trabalho, não de exportação. Mesmo teto da de leads. */
export const LIMITE_LISTA = 200;

export interface LinhaConta {
  id: string;
  nome: string;
  documento: string | null;
  dominio: string | null;
  proprietario: string | null;
  contatos: number;
  leads: number;
  oportunidades: number;
  valorAberto: number;
}

export async function listarContas(busca = ''): Promise<LinhaConta[]> {
  return consultar(async (tx) => {
    const termo = busca.trim();
    const filtro = termo
      ? sql`(${conta.nome} ilike ${'%' + termo + '%'}
             or ${conta.documento} ilike ${'%' + termo + '%'}
             or ${conta.dominio} ilike ${'%' + termo + '%'})`
      : undefined;

    const contas = await tx
      .select({
        id: conta.id,
        nome: conta.nome,
        documento: conta.documento,
        dominio: conta.dominio,
        proprietario: usuario.nome,
      })
      .from(conta)
      .leftJoin(usuario, eq(usuario.id, conta.proprietarioId))
      .where(and(isNull(conta.excluidoEm), filtro))
      .orderBy(asc(conta.nome))
      .limit(LIMITE_LISTA);

    // Três agregações separadas em vez de subconsulta por linha: o banco lê
    // cada tabela uma vez, e a junção acontece aqui, sobre catorze contas.
    const porContato = await tx
      .select({ contaId: contato.contaId, n: sql<number>`count(*)::int` })
      .from(contato)
      .where(isNull(contato.excluidoEm))
      .groupBy(contato.contaId);

    const porLead = await tx
      .select({ contaId: lead.contaId, n: sql<number>`count(*)::int` })
      .from(lead)
      .where(isNull(lead.excluidoEm))
      .groupBy(lead.contaId);

    const porOportunidade = await tx
      .select({
        contaId: oportunidade.contaId,
        n: sql<number>`count(*)::int`,
        valor: sql<string>`coalesce(sum(${oportunidade.valor}), 0)`,
      })
      .from(oportunidade)
      .where(isNull(oportunidade.fechadaEm))
      .groupBy(oportunidade.contaId);

    const contatos = new Map(porContato.map((l) => [l.contaId, l.n]));
    const leads = new Map(porLead.map((l) => [l.contaId, l.n]));
    const abertas = new Map(porOportunidade.map((l) => [l.contaId, l]));

    return contas.map((c) => {
      const o = abertas.get(c.id);
      return {
        ...c,
        contatos: contatos.get(c.id) ?? 0,
        leads: leads.get(c.id) ?? 0,
        oportunidades: o?.n ?? 0,
        valorAberto: paraNumero(o?.valor) ?? 0,
      };
    });
  });
}

/* -------------------------------------------------------------- a ficha */

export interface ContatoDaConta {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  leadId: string | null;
  score: number | null;
  faixa: string | null;
}

export interface OportunidadeDaConta {
  id: string;
  nome: string;
  valor: number | null;
  fase: string;
  probabilidade: number | null;
  proprietario: string | null;
  fechamentoPrevisto: Date | null;
  fechadaEm: Date | null;
  ganha: boolean | null;
}

export interface FichaConta {
  id: string;
  nome: string;
  documento: string | null;
  dominio: string | null;
  proprietario: string | null;
  criadoEm: Date | null;
  contatos: ContatoDaConta[];
  oportunidades: OportunidadeDaConta[];
  valorAberto: number;
  valorGanho: number;
}

export async function carregarConta(id: string): Promise<FichaConta | null> {
  return consultar(async (tx) => {
    const [cabeca] = await tx
      .select({
        id: conta.id,
        nome: conta.nome,
        documento: conta.documento,
        dominio: conta.dominio,
        proprietario: usuario.nome,
        criadoEm: conta.criadoEm,
      })
      .from(conta)
      .leftJoin(usuario, eq(usuario.id, conta.proprietarioId))
      .where(and(eq(conta.id, id), isNull(conta.excluidoEm)))
      .limit(1);

    if (!cabeca) return null;

    /*
     * O contato traz o lead dele junto: quem abre a conta quer saber com quem
     * falar E o quanto esse alguém já avançou. Duas telas para responder isso
     * seriam uma a mais.
     */
    const contatos = await tx
      .select({
        id: contato.id,
        nome: contato.nome,
        email: contato.email,
        telefone: contato.telefoneE164,
        leadId: lead.id,
        score: lead.scoreAtual,
        faixa: lead.faixaAtual,
      })
      .from(contato)
      .leftJoin(lead, and(eq(lead.contatoId, contato.id), isNull(lead.excluidoEm)))
      .where(and(eq(contato.contaId, id), isNull(contato.excluidoEm)))
      .orderBy(asc(contato.nome));

    const oportunidades = await tx
      .select({
        id: oportunidade.id,
        nome: oportunidade.nome,
        valor: oportunidade.valor,
        fase: oportunidade.fase,
        probabilidade: oportunidade.probabilidade,
        proprietario: usuario.nome,
        fechamentoPrevisto: oportunidade.fechamentoPrevisto,
        fechadaEm: oportunidade.fechadaEm,
        ganha: oportunidade.ganha,
      })
      .from(oportunidade)
      .leftJoin(usuario, eq(usuario.id, oportunidade.proprietarioId))
      .where(eq(oportunidade.contaId, id))
      // Aberta primeiro: é o que ainda dá para mexer.
      .orderBy(asc(oportunidade.fechadaEm), desc(oportunidade.valor));

    const linhas: OportunidadeDaConta[] = oportunidades.map((o) => ({
      id: o.id,
      nome: o.nome,
      valor: paraNumero(o.valor),
      fase: o.fase,
      probabilidade: o.probabilidade,
      proprietario: o.proprietario,
      fechamentoPrevisto: paraData(o.fechamentoPrevisto),
      fechadaEm: paraData(o.fechadaEm),
      ganha: o.ganha,
    }));

    return {
      id: cabeca.id,
      nome: cabeca.nome,
      documento: cabeca.documento,
      dominio: cabeca.dominio,
      proprietario: cabeca.proprietario,
      criadoEm: paraData(cabeca.criadoEm),
      contatos: contatos.map((c) => ({ ...c, nome: c.nome ?? 'Contato sem nome' })),
      oportunidades: linhas,
      valorAberto: linhas
        .filter((o) => o.fechadaEm === null)
        .reduce((s, o) => s + (o.valor ?? 0), 0),
      valorGanho: linhas.filter((o) => o.ganha).reduce((s, o) => s + (o.valor ?? 0), 0),
    };
  });
}
