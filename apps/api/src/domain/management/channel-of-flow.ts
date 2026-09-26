import { and, asc, eq, ne } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import type { Ator, TransactionPipe } from '@pipe/db';
import { channel, flow } from '@pipe/db/schema';
import type { ChannelOfFlow, ChannelOfFlowInScreen } from '@pipe/contracts';
import { PipeError } from '../../errors.js';
import { identifierOfChannel } from '../management-flow.js';
import { requirePermissionInFlow } from './team-of-flow.js';

/**
 * Connect or disconnect a channel for a BOT, as source `/application/detail/{bot}/channels/{canal}` does behind 'Ativar número' (`FICHA-conectar-canal-no-bot.md` §§2,4). `fluxo.canal_id` was previously read by `fluxoPublicadoDoCanal`, while tests linked it by SQL; this adds the screen's write operation. Require `channels.escrever` on THIS flow or the account equivalent through `exigirPermissaoNoFluxo`. Reject a channel linked to another live bot, preserving the source's literal message 'Ops… Este número já está em uso / Para ativar o número neste bot, remova do anterior e tente novamente.' (`errorMsg.phoneNumberIsAlreadyConnected`); `detalhe` additionally identifies that bot. An inactive channel cannot receive, so linking returns 409. Pipe differs from Blip: `fluxo.canal_id` is one column, so this bot supports ONE channel; linking another returns 409 `fluxo_ja_tem_canal` rather than silently replacing WhatsApp, Messenger or Instagram.
 */

const CONNECT_CHANNEL = 'channels.escrever';

const ator = (usuarioId: string): Ator => ({ type: 'usuario', id: usuarioId });

/** O contato vivo do tenant, ou 404 — o `fetch_inbox` de `ciclo-de-vida-do-fluxo.ts`. */
async function flowLive(tx: TransactionPipe, tenantId: string, fluxoId: string) {
  const [atual] = await tx
    .select({ id: flow.id, nome: flow.nome, canalId: flow.channelId })
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
  return linha ?? null;
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

  let ligado: ChannelOfFlow | null = null;
  if (atual.canalId) {
    const channelId = atual.canalId;
    ligado =
      disponiveis.find((c) => c.id === channelId) ??
      (await forContract(tx, tenantId, await channelOfTenant(tx, tenantId, channelId)));
  }
  return { channel: ligado, disponiveis };
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
): Promise<void> {
  const atual = await flowLive(tx, tenantId, fluxoId);
  await requirePermissionInFlow(tx, userId, fluxoId, CONNECT_CHANNEL);
  if (atual.canalId) throw flowAlreadyHasChannel(await channelOfTenant(tx, tenantId, atual.canalId));
}

function flowAlreadyHasChannel(existente: { id: string; tipo: string; nome: string }): PipeError {
  return PipeError.conflito(
    'flow_already_has_channel',
    `Este bot já está conectado ao canal "${existente.nome}". Desconecte-o antes de conectar outro.`,
    { canalId: existente.id, canalTipo: existente.tipo, canalNome: existente.nome },
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
  const atual = await flowLive(tx, tenantId, fluxoId);
  await requirePermissionInFlow(tx, usuarioId, fluxoId, CONNECT_CHANNEL);
  const alvo = await channelOfTenant(tx, tenantId, channelId);

  if (atual.canalId === alvo.id) return forContract(tx, tenantId, alvo);
  if (!alvo.ativo) {
    throw PipeError.conflito(
      'channel_inactive',
      'Este canal está desconectado. Reconecte-o antes de ligá-lo a um bot.',
      { canalId: alvo.id },
    );
  }
  if (atual.canalId) throw flowAlreadyHasChannel(await channelOfTenant(tx, tenantId, atual.canalId));

  const dono = await botOfChannel(tx, tenantId, alvo.id);
  if (dono) {
    /* The title and message match the source's `whatsapp.errorMsg.phoneNumberIsAlreadyConnected`. */
    throw PipeError.conflito(
      'number_in_use',
      'Ops… Este número já está em uso. Para ativar o número neste bot, remova do anterior e tente novamente.',
      { fluxoId: dono.id, fluxoNome: dono.nome },
    );
  }

  await tx
    .update(flow)
    .set({ channelId: alvo.id, atualizadoEm: new Date() })
    .where(and(eq(flow.tenantId, tenantId), eq(flow.id, atual.id)));

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'fluxo',
    objetoId: atual.id,
    antes: { canalId: null },
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
): Promise<void> {
  const atual = await flowLive(tx, tenantId, fluxoId);
  await requirePermissionInFlow(tx, usuarioId, fluxoId, CONNECT_CHANNEL);
  if (!atual.canalId) return;

  await tx
    .update(flow)
    .set({ channelId: null, atualizadoEm: new Date() })
    .where(and(eq(flow.tenantId, tenantId), eq(flow.id, atual.id)));

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'fluxo',
    objetoId: atual.id,
    antes: { canalId: atual.canalId },
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
  if (atual.canalId !== canalId) return false;
  await requirePermissionInFlow(tx, usuarioId, fluxoId, CONNECT_CHANNEL);
  return true;
}
