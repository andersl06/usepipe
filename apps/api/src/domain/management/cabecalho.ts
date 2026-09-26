import { desc, eq, isNull } from 'drizzle-orm';
import { segundosEntre } from '@pipe/core';
import type { TransactionPipe } from '@pipe/db';
import { channel, motivoPausa, pausa } from '@pipe/db/schema';

/**
 * The two Management top bars show account channels and alerts for pauses exceeding the suggested time. The controller obtains the signed-in user and tenant from the session.
 */
export interface HeaderOfManagement {
  channels: { id: string; name: string; type: string; active: boolean }[];
  avisos: number;
}

export async function carregarCabecalho(
  tx: TransactionPipe,
  agora = new Date(),
): Promise<HeaderOfManagement> {
  const channels = await tx
    .select({ id: channel.id, name: channel.nome, type: channel.tipo, active: channel.ativo })
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
