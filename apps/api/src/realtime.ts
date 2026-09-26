import IORedis from 'ioredis';
import { conexaoRedis } from '@pipe/workers';
import type { Assunto, EventoDoServidor } from '@pipe/contracts';

/**
 * Realtime events announce what changed, never the record itself (`packages/contracts/src/eventos.ts`): send only `{assunto, id, em}` and let recipients fetch data through the API under RLS. Sending records over Redis would create another tenant-isolation path beside the existing policies and tests. Isolation has three layers: one Redis channel per tenant (`pipe:eventos:<tenant_id>`), subscribed only while this process has that tenant's connections; tenant identity comes from each connection's session, never client input; and an event with `usuarioId` reaches only that person's connections, as required for manager-agent chat.
 */

/** Redis envelope: the contract event plus its recipient. */
export interface EventoPublicado extends EventoDoServidor {
  /** When set, deliver only to this person's connections. */
  userId?: string;
}

export interface Conexao {
  tenantId: string;
  userId: string;
  assuntos: ReadonlySet<Assunto>;
  entregar: (evento: EventoDoServidor) => void;
}

function channelOfTenant(tenantId: string): string {
  return `pipe:eventos:${tenantId}`;
}

let publicador: IORedis | null = null;
let assinante: IORedis | null = null;

/**
 * Redis needs separate subscriber and publisher connections: a connection in `subscribe` mode cannot issue other commands, so publishing on it would block.
 */
function conexaoPublicador(): IORedis {
  publicador ??= new IORedis(conexaoRedis().url, { maxRetriesPerRequest: null });
  return publicador;
}

/** Live connections in this process, grouped by tenant. */
const byTenant = new Map<string, Set<Conexao>>();

function conexaoAssinante(): IORedis {
  if (assinante) return assinante;
  assinante = new IORedis(conexaoRedis().url, { maxRetriesPerRequest: null });
  assinante.on('message', (channel, corpo) => {
    const tenantId = channel.slice('pipe:eventos:'.length);
    let evento: EventoPublicado;
    try {
      evento = JSON.parse(corpo) as EventoPublicado;
    } catch {
      // An unreadable channel message must not crash the process.
      return;
    }
    entregarNoProcesso(tenantId, evento);
  });
  return assinante;
}

function entregarNoProcesso(tenantId: string, evento: EventoPublicado): void {
  const conexoes = byTenant.get(tenantId);
  if (!conexoes) return;

  const { userId, ...ofContract } = evento;
  for (const conexao of conexoes) {
    // Recheck the tenant even though the channel is tenant-scoped; a future channel-key mistake must stop here rather than leak events.
    if (conexao.tenantId !== tenantId) continue;
    if (userId && conexao.userId !== userId) continue;
    if (!conexao.assuntos.has(ofContract.assunto)) continue;
    try {
      conexao.entregar(ofContract);
    } catch {
      // One dying client socket must not prevent delivery to other clients.
    }
  }
}

/**
 * Publish an event for a tenant or one of its users only after commit. Publishing inside the transaction lets the browser refetch before the new value is visible, with no later notice. Publishing failure must not undo saved conversation data; the consequence is only delayed UI refresh.
 */
export async function publicar(tenantId: string, evento: EventoPublicado): Promise<void> {
  try {
    await conexaoPublicador().publish(channelOfTenant(tenantId), JSON.stringify(evento));
  } catch (error) {
    console.error(`[tempo-real] não publicou para ${tenantId}: ${(error as Error).message}`);
  }
}

/** Shortcut for publishing that conversation X changed. */
export function evento(assunto: Assunto, id?: string, userId?: string): EventoPublicado {
  return {
    assunto,
    ...(id ? { id } : {}),
    ...(userId ? { userId } : {}),
    em: new Date().toISOString(),
  };
}

/**
 * Register a connection and return how to close it. Subscribe this process to a tenant channel on its first connection and unsubscribe when its last connection leaves, so a process with no users from that tenant receives none of its data.
 */
export async function registrar(conexao: Conexao): Promise<() => Promise<void>> {
  let connections = byTenant.get(conexao.tenantId);
  if (!connections) {
    connections = new Set();
    byTenant.set(conexao.tenantId, connections);
    await conexaoAssinante().subscribe(channelOfTenant(conexao.tenantId));
  }
  connections.add(conexao);

  let encerrada = false;
  return async () => {
    if (encerrada) return;
    encerrada = true;
    const vivas = byTenant.get(conexao.tenantId);
    if (!vivas) return;
    vivas.delete(conexao);
    if (vivas.size === 0) {
      byTenant.delete(conexao.tenantId);
      await conexaoAssinante().unsubscribe(channelOfTenant(conexao.tenantId));
    }
  };
}

/** Live connection count in this process, used by `/metrics` and tests. */
export function connectionsVivas(tenantId?: string): number {
  if (tenantId) return byTenant.get(tenantId)?.size ?? 0;
  let total = 0;
  for (const connections of byTenant.values()) total += connections.size;
  return total;
}

export async function closeTimeReal(): Promise<void> {
  byTenant.clear();
  await assinante?.quit();
  await publicador?.quit();
  assinante = null;
  publicador = null;
}
