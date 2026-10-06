import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import type { Ator, TransactionPipe } from '@pipe/db';
import { channel, flow, routerChannel } from '@pipe/db/schema';
import type { ChannelOfFlow, ChannelOfFlowInScreen } from '@pipe/contracts';
import { PipeError } from '../../errors.js';
import { identifierOfChannel } from '../management-flow.js';
import { requirePermissionInFlow } from './team-of-flow.js';

/**
 * A router can own different channel types. Keep its first link in fluxo.canal_id
 * for compatibility and put additional links in roteador_canal. Regular flows
 * still own a single channel. A channel belongs to only one live bot.
 */

const CONNECT_CHANNEL = 'channels.escrever';

const ator = (usuarioId: string): Ator => ({ type: 'usuario', id: usuarioId });

/** O contato vivo do tenant, ou 404 — o `fetch_inbox` de `ciclo-de-vida-do-fluxo.ts`. */
async function flowLive(tx: TransactionPipe, tenantId: string, fluxoId: string) {
  const [atual] = await tx
    .select({ id: flow.id, nome: flow.nome, tipo: flow.tipo, canalId: flow.channelId })
    .from(flow)
    .where(and(eq(flow.tenantId, tenantId), eq(flow.id, fluxoId), ne(flow.estado, 'arquivado')))
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('fluxo');
  return atual;
}

const COLUNAS = {
  id: channel.id,
  tipo: channel.tipo,
  nome: channel.nome,
  numero: identifierOfChannel,
  ativo: channel.ativo,
};

/** Return the live bot linked to this channel; archived bots do not reserve numbers. */
async function botOfChannel(
  tx: TransactionPipe,
  tenantId: string,
  canalId: string,
): Promise<{ id: string; nome: string } | null> {
  const [linha] = await tx
    .select({ id: flow.id, nome: flow.nome })
    .from(flow)
    .where(and(eq(flow.tenantId, tenantId), eq(flow.channelId, canalId), ne(flow.estado, 'arquivado')))
    .orderBy(asc(flow.criadoEm))
    .limit(1);
  if (linha) return linha;
  const [extra] = await tx
    .select({ id: flow.id, nome: flow.nome })
    .from(routerChannel)
    .innerJoin(flow, eq(routerChannel.routerId, flow.id))
    .where(
      and(
        eq(routerChannel.tenantId, tenantId),
        eq(routerChannel.channelId, canalId),
        ne(flow.estado, 'arquivado'),
      ),
    )
    .limit(1);
  return extra ?? null;
}

async function channelIdsOfBot(
  tx: TransactionPipe,
  tenantId: string,
  current: Awaited<ReturnType<typeof flowLive>>,
): Promise<string[]> {
  const ids = current.canalId ? [current.canalId] : [];
  if (current.tipo !== 'roteador') return ids;
  const extras = await tx
    .select({ channelId: routerChannel.channelId })
    .from(routerChannel)
    .where(and(eq(routerChannel.tenantId, tenantId), eq(routerChannel.routerId, current.id)))
    .orderBy(asc(routerChannel.criadoEm));
  return [...ids, ...extras.map((item) => item.channelId)];
}

async function existingChannelOfType(
  tx: TransactionPipe,
  tenantId: string,
  current: Awaited<ReturnType<typeof flowLive>>,
  type: string,
) {
  for (const id of await channelIdsOfBot(tx, tenantId, current)) {
    const linked = await channelOfTenant(tx, tenantId, id);
    if (linked.tipo === type) return linked;
  }
  return null;
}

async function lockFlow(tx: TransactionPipe, tenantId: string, flowId: string): Promise<void> {
  await tx.execute(sql`select id from fluxo where tenant_id = ${tenantId}::uuid and id = ${flowId}::uuid for update`);
}

async function lockChannel(tx: TransactionPipe, tenantId: string, channelId: string): Promise<void> {
  await tx.execute(sql`select id from canal where tenant_id = ${tenantId}::uuid and id = ${channelId}::uuid for update`);
}

/** Return a channel belonging to THIS tenant, or 404. Tenant identity comes from the session, never the request body. */
async function channelOfTenant(tx: TransactionPipe, tenantId: string, canalId: string) {
  const [linha] = await tx
    .select(COLUNAS)
    .from(channel)
    .where(and(eq(channel.tenantId, tenantId), eq(channel.id, canalId)))
    .limit(1);
  if (!linha) throw PipeError.naoEncontrado('canal');
  return linha;
}

async function forContract(
  tx: TransactionPipe,
  tenantId: string,
  linha: { id: string; tipo: string; nome: string; numero: string | null; ativo: boolean },
): Promise<ChannelOfFlow> {
  const bot = await botOfChannel(tx, tenantId, linha.id);
  return { ...linha, flowId: bot?.id ?? null, flowName: bot?.nome ?? null };
}

/* ------------------------------------------------------------------ Leitura */


export async function loadChannelOfFlowInScreen(
  tx: TransactionPipe,
  tenantId: string,
  flowId: string,
): Promise<ChannelOfFlowInScreen> {
  const atual = await flowLive(tx, tenantId, flowId);

  const linhas = await tx
    .select(COLUNAS)
    .from(channel)
    .where(and(eq(channel.tenantId, tenantId), eq(channel.ativo, true)))
    .orderBy(asc(channel.criadoEm));
  const disponiveis: ChannelOfFlow[] = [];
  for (const linha of linhas) disponiveis.push(await forContract(tx, tenantId, linha));

  const channels: ChannelOfFlow[] = [];
  for (const channelId of await channelIdsOfBot(tx, tenantId, atual)) {
    channels.push(
      disponiveis.find((item) => item.id === channelId) ??
        (await forContract(tx, tenantId, await channelOfTenant(tx, tenantId, channelId))),
    );
  }
  return { channel: channels[0] ?? null, channels, disponiveis };
}

/* ------------------------------------------------------------------- Gestos */

/**
 * Before creating a channel with `fluxo_id`, verify that the bot belongs to this tenant, the user may connect a channel to it, and it has no channel yet. Do not store client credentials only to reject the link afterward.
 */
export async function conferirQuePodeLigar(
  tx: TransactionPipe,
  tenantId: string,
  userId: string,
  fluxoId: string,
  channelType?: string,
): Promise<void> {
  const atual = await flowLive(tx, tenantId, fluxoId);
  await requirePermissionInFlow(tx, userId, fluxoId, CONNECT_CHANNEL);
  if (atual.canalId && atual.tipo !== 'roteador') {
    throw flowAlreadyHasChannel(await channelOfTenant(tx, tenantId, atual.canalId));
  }
  if (channelType && atual.tipo === 'roteador') {
    const existing = await existingChannelOfType(tx, tenantId, atual, channelType);
    if (existing) throw flowAlreadyHasChannelType(existing);
  }
}

/** The unique index or trigger of migration 0093 refused the write (drizzle wraps the Postgres error in `cause`). */
function isOneBotPerChannelViolation(error: unknown): boolean {
  const pg = ((error as { cause?: unknown })?.cause ?? error) as { code?: string; constraint?: string } | null;
  return pg?.code === '23505' && (pg.constraint === 'roteador_canal_um_bot' || pg.constraint === 'fluxo_canal_publicado_uk');
}

function flowAlreadyHasChannel(existente: { id: string; tipo: string; nome: string }): PipeError {
  return PipeError.conflito(
    'flow_already_has_channel',
    `Este bot já está conectado ao canal "${existente.nome}". Desconecte-o antes de conectar outro.`,
    { canalId: existente.id, canalTipo: existente.tipo, canalNome: existente.nome },
  );
}

function flowAlreadyHasChannelType(existing: { id: string; tipo: string; nome: string }): PipeError {
  return PipeError.conflito(
    'flow_already_has_channel_type',
    `Este roteador já está conectado ao canal "${existing.nome}" deste tipo. Desconecte-o antes de conectar outro.`,
    { canalId: existing.id, canalTipo: existing.tipo, canalNome: existing.nome },
  );
}

/** 'Ativar número' links the channel to this bot; linking the same channel again is idempotent. */
export async function connectChannelToFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  channelId: string,
): Promise<ChannelOfFlow> {
  await lockFlow(tx, tenantId, fluxoId);
  const atual = await flowLive(tx, tenantId, fluxoId);
  await requirePermissionInFlow(tx, usuarioId, fluxoId, CONNECT_CHANNEL);
  const alvo = await channelOfTenant(tx, tenantId, channelId);
  await lockChannel(tx, tenantId, channelId);

  if ((await channelIdsOfBot(tx, tenantId, atual)).includes(alvo.id)) {
    return forContract(tx, tenantId, alvo);
  }
  if (!alvo.ativo) {
    throw PipeError.conflito(
      'channel_inactive',
      'Este canal está desconectado. Reconecte-o antes de ligá-lo a um bot.',
      { canalId: alvo.id },
    );
  }
  if (atual.canalId && atual.tipo !== 'roteador') {
    throw flowAlreadyHasChannel(await channelOfTenant(tx, tenantId, atual.canalId));
  }
  if (atual.tipo === 'roteador') {
    const existing = await existingChannelOfType(tx, tenantId, atual, alvo.tipo);
    if (existing) throw flowAlreadyHasChannelType(existing);
  }

  const dono = await botOfChannel(tx, tenantId, alvo.id);
  if (dono) {
    /* The title and message match the source's `whatsapp.errorMsg.phoneNumberIsAlreadyConnected`. */
    throw PipeError.conflito(
      'number_in_use',
      'Ops… Este número já está em uso. Para ativar o número neste bot, remova do anterior e tente novamente.',
      { fluxoId: dono.id, fluxoNome: dono.nome },
    );
  }

  try {
    if (atual.canalId) {
      await tx.insert(routerChannel).values({ tenantId, routerId: atual.id, channelId: alvo.id });
    } else {
      await tx
        .update(flow)
        .set({ channelId: alvo.id, atualizadoEm: new Date() })
        .where(and(eq(flow.tenantId, tenantId), eq(flow.id, atual.id)));
    }
  } catch (error) {
    // Migration 0093 backstop: a concurrent link slipped past the checks above; answer like the check does.
    if (isOneBotPerChannelViolation(error)) {
      throw PipeError.conflito(
        'number_in_use',
        'Ops… Este número já está em uso. Para ativar o número neste bot, remova do anterior e tente novamente.',
        {},
      );
    }
    throw error;
  }

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'fluxo',
    objetoId: atual.id,
    antes: { canalId: atual.canalId },
    depois: { canalId: alvo.id, canalTipo: alvo.tipo, canalNome: alvo.nome },
  });
  return { ...alvo, flowId: atual.id, flowName: atual.nome };
}

/**
 * Disconnect the channel FROM THE BOT. The channel stays active; disconnecting the number itself (`DELETE /v1/canais/whatsapp/:id`) is a separate gesture. With no linked channel, make no change or audit entry. `motivo` comes from the source modal 'Por qual motivo você quer desconectar o …?' for Instagram/Messenger (`FICHA-conectar-canal-no-bot.md` §3.3); Blip uses it for analytics, while Pipe stores it in the audit log.
 */
export async function disconnectChannelOfFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  motivo?: string,
  channelId?: string,
): Promise<void> {
  await lockFlow(tx, tenantId, fluxoId);
  const atual = await flowLive(tx, tenantId, fluxoId);
  await requirePermissionInFlow(tx, usuarioId, fluxoId, CONNECT_CHANNEL);
  const ids = await channelIdsOfBot(tx, tenantId, atual);
  if (!ids.length) {
    if (channelId) throw PipeError.naoEncontrado('canal');
    return;
  }
  const targetId = channelId ?? atual.canalId ?? ids[0]!;
  if (!ids.includes(targetId)) throw PipeError.naoEncontrado('canal');

  if (targetId !== atual.canalId) {
    await tx.delete(routerChannel)
      .where(and(eq(routerChannel.tenantId, tenantId), eq(routerChannel.routerId, atual.id), eq(routerChannel.channelId, targetId)));
  } else {
    const nextId = ids.find((id) => id !== targetId) ?? null;
    if (nextId) {
      await tx.delete(routerChannel)
        .where(and(eq(routerChannel.tenantId, tenantId), eq(routerChannel.routerId, atual.id), eq(routerChannel.channelId, nextId)));
    }
    await tx.update(flow).set({ channelId: nextId, atualizadoEm: new Date() })
      .where(and(eq(flow.tenantId, tenantId), eq(flow.id, atual.id)));
  }

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'fluxo',
    objetoId: atual.id,
    antes: { canalId: targetId },
    depois: { canalId: null, ...(motivo ? { motivo } : {}) },
  });
}

/**
 * A bot administrator may reconnect THAT bot's channel after token expiry, as the source channel page permits. Return `true` only if the requested channel belongs to the bot and the user has authority there.
 */
export async function canReconnectInFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  canalId: string,
): Promise<boolean> {
  const atual = await flowLive(tx, tenantId, fluxoId);
  if (!(await channelIdsOfBot(tx, tenantId, atual)).includes(canalId)) return false;
  await requirePermissionInFlow(tx, usuarioId, fluxoId, CONNECT_CHANNEL);
  return true;
}
