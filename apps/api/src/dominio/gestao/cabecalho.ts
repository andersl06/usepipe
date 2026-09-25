import { desc, eq, isNull } from 'drizzle-orm';
import { segundosEntre } from '@pipe/core';
import type { TransactionPipe } from '@pipe/db';
import { channel, motivoPausa, pausa } from '@pipe/db/schema';

/**
 * O que as duas barras do topo da Gestão mostram: os canais da conta e a
 * contagem de avisos (pausas abertas além do tempo sugerido). Quem está logado
 * e o tenant vêm da sessão, no controlador.
 */
export interface HeaderOfManagement {
  channels: { id: string; nome: string; tipo: string; ativo: boolean }[];
  avisos: number;
}

export async function carregarCabecalho(
  tx: TransactionPipe,
  agora = new Date(),
): Promise<HeaderOfManagement> {
  const channels = await tx
    .select({ id: channel.id, nome: channel.nome, tipo: channel.tipo, ativo: channel.ativo })
    .from(channel)
    .orderBy(desc(channel.ativo), channel.criadoEm);

  const pausasAbertas = await tx
    .select({ iniciadaEm: pausa.iniciadaEm, sugeridaMin: motivoPausa.durationSuggestedMin })
    .from(pausa)
    .leftJoin(motivoPausa, eq(motivoPausa.id, pausa.motivoId))
    .where(isNull(pausa.encerradaEm));

  let avisos = 0;
  for (const p of pausasAbertas) {
    const limite = p.sugeridaMin;
    if (typeof limite !== 'number') continue;
    if (segundosEntre(p.iniciadaEm, agora) > limite * 60) avisos += 1;
  }
  return { channels, avisos };
}
