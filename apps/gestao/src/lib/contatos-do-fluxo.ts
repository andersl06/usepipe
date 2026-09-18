import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  classificacaoConversa,
  canal,
  contato,
  contatoIdentidade,
  conversa,
  fluxo,
  inbox,
  fila,
  mensagem,
  usuario,
} from '@pipe/db/schema';
import { consultar, tenantId } from './banco';

export async function listarContatosDoFluxo(fluxoId: string) {
  const tid = await tenantId();
  return consultar(async (tx) => {
    const [bot] = await tx
      .select({ canalId: fluxo.canalId, canalNome: canal.nome, canalTipo: canal.tipo })
      .from(fluxo)
      .leftJoin(canal, eq(canal.id, fluxo.canalId))
      .where(and(eq(fluxo.id, fluxoId), eq(fluxo.tenantId, tid)))
      .limit(1);
    if (!bot?.canalId) return [];

    return tx
      .select({
        id: contato.id,
        nome: contato.nome,
        email: contato.email,
        telefone: contato.telefoneE164,
        avatarUrl: contato.avatarUrl,
        canalNome: canal.nome,
        canalTipo: canal.tipo,
        conversas: sql<number>`count(distinct ${conversa.id})::int`,
        ultimaConversa: sql<Date | null>`max(coalesce(${conversa.ultimaMensagemEm}, ${conversa.criadaEm}))`,
      })
      .from(contato)
      .innerJoin(conversa, eq(conversa.contatoId, contato.id))
      .innerJoin(inbox, eq(inbox.id, conversa.inboxId))
      .innerJoin(canal, eq(canal.id, inbox.canalId))
      .where(
        and(eq(contato.tenantId, tid), eq(inbox.canalId, bot.canalId), isNull(contato.excluidoEm)),
      )
      .groupBy(contato.id, canal.id)
      .orderBy(asc(contato.nome))
      .limit(500);
  });
}

export async function carregarDetalheContatoDoFluxo(
  fluxoId: string,
  contatoId: string,
  ticketId?: string,
) {
  const tid = await tenantId();
  return consultar(async (tx) => {
    const [bot] = await tx
      .select({ canalId: fluxo.canalId, canalNome: canal.nome, canalTipo: canal.tipo })
      .from(fluxo)
      .leftJoin(canal, eq(canal.id, fluxo.canalId))
      .where(and(eq(fluxo.id, fluxoId), eq(fluxo.tenantId, tid)))
      .limit(1);
    if (!bot) return null;

    const [pessoa] = await tx
      .select({
        id: contato.id,
        nome: contato.nome,
        email: contato.email,
        telefone: contato.telefoneE164,
        documento: contato.documento,
        avatarUrl: contato.avatarUrl,
        atributos: contato.atributos,
        criadoEm: contato.criadoEm,
      })
      .from(contato)
      .where(and(eq(contato.id, contatoId), eq(contato.tenantId, tid), isNull(contato.excluidoEm)))
      .limit(1);
    if (!pessoa) return null;

    const [identidade] = bot.canalTipo
      ? await tx
          .select({ valor: contatoIdentidade.identificador })
          .from(contatoIdentidade)
          .where(
            and(
              eq(contatoIdentidade.tenantId, tid),
              eq(contatoIdentidade.contatoId, contatoId),
              eq(contatoIdentidade.canalTipo, bot.canalTipo),
            ),
          )
          .limit(1)
      : [];

    const conversas = bot.canalId
      ? await tx
          .select({
            id: conversa.id,
            estado: conversa.estado,
            criadaEm: conversa.criadaEm,
            encerradaEm: conversa.encerradaEm,
            inbox: inbox.nome,
            fila: fila.nome,
            atendente: usuario.nome,
            atendenteEmail: usuario.email,
            resumo: classificacaoConversa.resumo,
          })
          .from(conversa)
          .innerJoin(inbox, eq(inbox.id, conversa.inboxId))
          .leftJoin(fila, eq(fila.id, conversa.filaId))
          .leftJoin(usuario, eq(usuario.id, conversa.atendenteId))
          .leftJoin(classificacaoConversa, eq(classificacaoConversa.conversaId, conversa.id))
          .where(
            and(
              eq(conversa.tenantId, tid),
              eq(conversa.contatoId, contatoId),
              eq(inbox.canalId, bot.canalId),
            ),
          )
          .orderBy(desc(conversa.criadaEm))
          .limit(50)
      : [];

    const selecionada = conversas.find((item) => item.id === ticketId) ?? conversas[0];
    const historico = selecionada
      ? await tx
          .select({
            id: mensagem.id,
            texto: mensagem.conteudo,
            tipo: mensagem.tipo,
            direcao: mensagem.direcao,
            autor: mensagem.autorTipo,
            estado: mensagem.estadoEntrega,
            criadaEm: mensagem.criadaEm,
          })
          .from(mensagem)
          .where(and(eq(mensagem.tenantId, tid), eq(mensagem.conversaId, selecionada.id)))
          .orderBy(asc(mensagem.criadaEm))
          .limit(200)
      : [];

    return {
      pessoa,
      identidade: identidade?.valor ?? null,
      canal: bot.canalNome,
      conversas,
      selecionada,
      historico,
    };
  });
}
