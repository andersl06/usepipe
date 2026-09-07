import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  classificacaoConversa,
  conta,
  contato,
  conversa,
  fila,
  lead,
  usuario,
} from '@pipe/db/schema';
import { consultar, paraData } from './banco';

/**
 * Contatos.
 *
 * O contato é a pessoa; o lead é a intenção dela de comprar. São coisas
 * diferentes e o Pipe guarda as duas separadas — o mesmo contato pode virar
 * lead duas vezes, e a conversa dele continua sendo uma só.
 *
 * Por isso a ficha do contato mostra **as conversas** e **o lead**: é o que a
 * lista de leads não consegue mostrar, porque lá cada linha é uma intenção e
 * aqui cada linha é uma pessoa.
 *
 * Tudo em série dentro do `consultar` (README).
 */

export const LIMITE_LISTA = 200;

export interface LinhaContato {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  contaId: string | null;
  contaNome: string | null;
  leadId: string | null;
  faixa: string | null;
  conversas: number;
  ultimaConversa: Date | null;
}

export async function listarContatos(busca = ''): Promise<LinhaContato[]> {
  return consultar(async (tx) => {
    const termo = busca.trim();
    const filtro = termo
      ? sql`(${contato.nome} ilike ${'%' + termo + '%'}
             or ${contato.documento} ilike ${'%' + termo + '%'}
             or ${contato.telefoneE164} ilike ${'%' + termo + '%'}
             or ${contato.email} ilike ${'%' + termo + '%'})`
      : undefined;

    const linhas = await tx
      .select({
        id: contato.id,
        nome: contato.nome,
        email: contato.email,
        telefone: contato.telefoneE164,
        contaId: contato.contaId,
        contaNome: conta.nome,
        leadId: lead.id,
        faixa: lead.faixaAtual,
      })
      .from(contato)
      .leftJoin(conta, eq(conta.id, contato.contaId))
      .leftJoin(lead, and(eq(lead.contatoId, contato.id), isNull(lead.excluidoEm)))
      .where(and(isNull(contato.excluidoEm), filtro))
      .orderBy(asc(contato.nome))
      .limit(LIMITE_LISTA);

    const ids = linhas.map((l) => l.id);
    const conversas =
      ids.length === 0
        ? []
        : await tx
            .select({
              contatoId: conversa.contatoId,
              n: sql<number>`count(*)::int`,
              ultima: sql<string | null>`max(coalesce(${conversa.ultimaMensagemEm}, ${conversa.criadaEm}))`,
            })
            .from(conversa)
            .where(inArray(conversa.contatoId, ids))
            .groupBy(conversa.contatoId);

    const porContato = new Map(conversas.map((c) => [c.contatoId, c]));

    return linhas.map((l) => {
      const c = porContato.get(l.id);
      return {
        ...l,
        nome: l.nome ?? 'Contato sem nome',
        conversas: c?.n ?? 0,
        ultimaConversa: paraData(c?.ultima),
      };
    });
  });
}

/* -------------------------------------------------------------- a ficha */

export interface ConversaDoContato {
  id: string;
  fila: string | null;
  atendente: string | null;
  estado: string;
  categoria: string | null;
  resumo: string | null;
  criadaEm: Date | null;
  encerradaEm: Date | null;
}

export interface FichaContato {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  documento: string | null;
  contaId: string | null;
  contaNome: string | null;
  criadoEm: Date | null;
  /** Campo customizado por tenant, em JSONB. A ficha o mostra na lateral. */
  atributos: Record<string, unknown>;
  leadId: string | null;
  leadStatus: string | null;
  leadFase: string | null;
  score: number | null;
  faixa: string | null;
  origem: string | null;
  proprietario: string | null;
  conversas: ConversaDoContato[];
}

export async function carregarContato(id: string): Promise<FichaContato | null> {
  return consultar(async (tx) => {
    const [cabeca] = await tx
      .select({
        id: contato.id,
        nome: contato.nome,
        email: contato.email,
        telefone: contato.telefoneE164,
        documento: contato.documento,
        contaId: contato.contaId,
        contaNome: conta.nome,
        criadoEm: contato.criadoEm,
        atributos: contato.atributos,
        leadId: lead.id,
        leadStatus: lead.status,
        leadFase: lead.fase,
        score: lead.scoreAtual,
        faixa: lead.faixaAtual,
        origem: lead.origem,
        proprietario: usuario.nome,
      })
      .from(contato)
      .leftJoin(conta, eq(conta.id, contato.contaId))
      .leftJoin(lead, and(eq(lead.contatoId, contato.id), isNull(lead.excluidoEm)))
      .leftJoin(usuario, eq(usuario.id, lead.proprietarioId))
      .where(and(eq(contato.id, id), isNull(contato.excluidoEm)))
      .limit(1);

    if (!cabeca) return null;

    const conversas = await tx
      .select({
        id: conversa.id,
        fila: fila.nome,
        atendente: usuario.nome,
        estado: conversa.estado,
        categoria: classificacaoConversa.categoria,
        resumo: classificacaoConversa.resumo,
        criadaEm: conversa.criadaEm,
        encerradaEm: conversa.encerradaEm,
      })
      .from(conversa)
      .leftJoin(fila, eq(fila.id, conversa.filaId))
      .leftJoin(usuario, eq(usuario.id, conversa.atendenteId))
      .leftJoin(classificacaoConversa, eq(classificacaoConversa.conversaId, conversa.id))
      .where(eq(conversa.contatoId, id))
      .orderBy(desc(conversa.criadaEm))
      .limit(40);

    return {
      ...cabeca,
      nome: cabeca.nome ?? 'Contato sem nome',
      criadoEm: paraData(cabeca.criadoEm),
      atributos: (cabeca.atributos ?? {}) as Record<string, unknown>,
      conversas: conversas.map((c) => ({
        ...c,
        criadaEm: paraData(c.criadaEm),
        encerradaEm: paraData(c.encerradaEm),
      })),
    };
  });
}
