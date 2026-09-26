import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { requirePermission } from '../session.js';
import {
  conferirQuePodeLigar,
  connectChannelToFlow,
  canReconnectInFlow,
} from '../domain/management/channel-of-flow.js';

/**
 * Optional `fluxo_id` on channel connections (`POST /v1/canais/{whatsapp,instagram,messenger}[/manual]`) means the connection starts inside a bot, as in `FICHA-conectar-canal-no-bot.md` §4, where the channel belongs to the bot rather than the account. With it, bot permission (`channels.escrever`, `dominio/gestao/canal-do-fluxo.ts`) applies and the channel starts linked. Without it, the account's `canal.gerenciar` applies. Share this helper among the three controllers so they do not import one another.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read `fluxo_id` from the body if present; reject a non-UUID value with 404 before querying the database. */
export function flowIdOfBody(corpo: { flowId?: unknown } | undefined): string | undefined {
  const bruto = corpo?.flowId;
  if (bruto === undefined || bruto === null || bruto === '') return undefined;
  if (typeof bruto !== 'string' || !UUID.test(bruto)) throw PipeError.naoEncontrado('fluxo');
  return bruto;
}

/**
 * For a bot connection, check that it has no channel before storing the customer credential; otherwise linking could fail after channel creation.
 */
export function permitidoConectar(
  tenantId: string,
  userId: string,
  flowId: string | undefined,
): Promise<void> {
  return noTenant(tenantId, async (tx) => {
    if (flowId) await conferirQuePodeLigar(tx, tenantId, userId, flowId);
    else await requirePermission(tx, userId, 'canal.gerenciar');
  });
}

/**
 * Reconnect the channel already owned by a bot when its token expires. In the source this happens on the channel page inside the bot, so bot administration is sufficient, but only for that bot's channel. Reconnecting someone else's channel still requires account permission.
 */
export function permitidoReconectar(
  tenantId: string,
  usuarioId: string,
  fluxoId: string | undefined,
  channelId: string,
): Promise<void> {
  return noTenant(tenantId, async (tx) => {
    if (fluxoId && (await canReconnectInFlow(tx, tenantId, usuarioId, fluxoId, channelId))) return;
    await requirePermission(tx, usuarioId, 'canal.gerenciar');
  });
}


export function connectToFlow(
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  canalId: string,
): Promise<void> {
  return noTenant(tenantId, async (tx) => {
    await connectChannelToFlow(tx, tenantId, usuarioId, fluxoId, canalId);
  });
}
