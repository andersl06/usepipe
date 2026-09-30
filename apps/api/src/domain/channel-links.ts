import { and, asc, eq, inArray } from 'drizzle-orm';
import type { TransactionPipe } from '@pipe/db';
import { channel, flow, routerChannel } from '@pipe/db/schema';

/** The legacy link remains first; only routers can own additional channels. */
export async function linkedChannelIdsOfFlow(
  tx: TransactionPipe,
  tenantId: string,
  flowId: string,
): Promise<string[]> {
  const [current] = await tx.select({ type: flow.tipo, channelId: flow.channelId })
    .from(flow).where(and(eq(flow.tenantId, tenantId), eq(flow.id, flowId))).limit(1);
  if (!current) return [];
  const ids = current.channelId ? [current.channelId] : [];
  if (current.type !== 'roteador') return ids;
  const extras = await tx.select({ id: routerChannel.channelId }).from(routerChannel)
    .where(and(eq(routerChannel.tenantId, tenantId), eq(routerChannel.routerId, flowId)))
    .orderBy(asc(routerChannel.criadoEm));
  return [...ids, ...extras.map((item) => item.id)];
}

export async function linkedActiveChannelOfType(
  tx: TransactionPipe,
  tenantId: string,
  flowId: string,
  type: string,
): Promise<{ id: string; tipo: string } | null> {
  const ids = await linkedChannelIdsOfFlow(tx, tenantId, flowId);
  if (!ids.length) return null;
  const [found] = await tx.select({ id: channel.id, tipo: channel.tipo }).from(channel)
    .where(and(eq(channel.tenantId, tenantId), inArray(channel.id, ids), eq(channel.tipo, type), eq(channel.ativo, true)))
    .limit(1);
  return found ?? null;
}
