import { and, desc, eq, ilike } from 'drizzle-orm';
import { canal, contato, conversa, fluxo, inbox, mensagem } from '@pipe/db/schema';
import { consultar, tenantId } from './banco';

export async function carregarLogsDoFluxo(fluxoId: string, busca = '') {
  const tid = await tenantId();
  return consultar(async (tx) => {
    const [bot] = await tx
      .select({ canalId: fluxo.canalId, nome: canal.nome })
      .from(fluxo)
      .leftJoin(canal, eq(canal.id, fluxo.canalId))
      .where(and(eq(fluxo.id, fluxoId), eq(fluxo.tenantId, tid)))
      .limit(1);
    if (!bot?.canalId) return [];
    const filtroBusca = busca.trim() ? ilike(mensagem.conteudo, `%${busca.trim()}%`) : undefined;
    const linhas = await tx
      .select({
        id: mensagem.id,
        criadaEm: mensagem.criadaEm,
        direcao: mensagem.direcao,
        tipo: mensagem.tipo,
        conteudo: mensagem.conteudo,
        metadata: mensagem.dados,
        contato: contato.telefoneE164,
        canal: canal.nome,
      })
      .from(mensagem)
      .innerJoin(conversa, eq(conversa.id, mensagem.conversaId))
      .innerJoin(contato, eq(contato.id, conversa.contatoId))
      .innerJoin(inbox, eq(inbox.id, conversa.inboxId))
      .innerJoin(canal, eq(canal.id, inbox.canalId))
      .where(and(eq(mensagem.tenantId, tid), eq(inbox.canalId, bot.canalId), filtroBusca))
      .orderBy(desc(mensagem.criadaEm))
      .limit(20);
    return linhas.map((linha) => ({
      ...linha,
      de: linha.direcao === 'entrada' ? linha.contato : linha.canal,
      para: linha.direcao === 'entrada' ? linha.canal : linha.contato,
    }));
  });
}
