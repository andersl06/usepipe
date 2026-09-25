import { and, asc, eq, ne } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import type { Ator, TransactionPipe } from '@pipe/db';
import { channel, flow } from '@pipe/db/schema';
import type { ChannelOfFlow, ChannelOfFlowInScreen } from '@pipe/contracts';
import { PipeError } from '../../errors.js';
import { identifierOfChannel } from '../management-flow.js';
import { exigirPermissionInFlow } from './team-of-flow.js';

/**
 * Ligar e desligar o canal DO BOT — o que a página
 * `/application/detail/{bot}/channels/{canal}` da origem faz por trás do
 * "Ativar número" (`FICHA-conectar-canal-no-bot.md` §2 e §4).
 *
 * `fluxo.canal_id` era só LIDO pela `api` (`fluxoPublicadoDoCanal`); os
 * testes ligavam por SQL e a tela não tinha como. Aqui é o gesto de escrita,
 * com as regras que a origem mostra:
 *
 * - **o canal é do bot**: a permissão é `channels.escrever` NESTE fluxo (a
 *   linha "Canais" da lista de permissões por bot), ou a equivalente da conta
 *   — `exigirPermissaoNoFluxo`;
 * - **um bot por número**: ligar um canal que já está com outro bot vivo é
 *   recusado — "Ops… Este número já está em uso / Para ativar o número neste
 *   bot, remova do anterior e tente novamente." (`errorMsg.phoneNumberIsAlreadyConnected`).
 *   A origem não transfere; quem quer trocar desliga no bot antigo antes. O
 *   `detalhe` diz QUAL bot está com ele — acréscimo do Pipe, para a tela
 *   apontar o caminho;
 * - **canal inativo não liga** (409): desconectado aqui, ele não recebe
 *   mensagem; ligar um bot a ele seria ligar a nada.
 *
 * Decisão Pipe (não está na origem): `fluxo.canal_id` é UMA coluna, então um
 * bot tem UM canal. Na origem um bot tem WhatsApp + Messenger + Instagram ao
 * mesmo tempo. Ligar um segundo canal a um bot que já tem outro é recusado
 * (409 `fluxo_ja_tem_canal`) em vez de trocar por baixo dos panos — a tela do
 * WhatsApp não pode desligar o Instagram sem avisar.
 */

const CONNECT_CHANNEL = 'channels.escrever';

const ator = (usuarioId: string): Ator => ({ type: 'usuario', id: usuarioId });

/** O contato vivo do tenant, ou 404 — o `fetch_inbox` de `ciclo-de-vida-do-fluxo.ts`. */
async function flowVivo(tx: TransactionPipe, tenantId: string, fluxoId: string) {
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

/** O bot VIVO que está com o canal, se houver — arquivado não segura número. */
async function botOfChannel(
  tx: TransactionPipe,
  tenantId: string,
  canalId: string,
): Promise<{ id: string; name: string } | null> {
  const [linha] = await tx
    .select({ id: flow.id, nome: flow.nome })
    .from(flow)
    .where(and(eq(flow.tenantId, tenantId), eq(flow.channelId, canalId), ne(flow.estado, 'arquivado')))
    .orderBy(asc(flow.criadoEm))
    .limit(1);
  return linha ?? null;
}

/** Um canal DESTE tenant, ou 404. O tenant vem da sessão, nunca do corpo. */
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
  linha: { id: string; type: string; name: string; numero: string | null; active: boolean },
): Promise<ChannelOfFlow> {
  const bot = await botOfChannel(tx, tenantId, linha.id);
  return { ...linha, flowId: bot?.id ?? null, flowName: bot?.nome ?? null };
}

/* ------------------------------------------------------------------ Leitura */

/** O que a página do canal precisa: o canal deste bot e os que a conta tem para oferecer. */
export async function loadChannelOfFlowInScreen(
  tx: TransactionPipe,
  tenantId: string,
  flowId: string,
): Promise<ChannelOfFlowInScreen> {
  const atual = await flowVivo(tx, tenantId, flowId);

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
 * As três portas que um canal novo precisa atravessar ANTES de ser criado para
 * este bot (conexão manual com `fluxo_id`): o bot existe e é deste tenant, a
 * pessoa pode conectar canal nele, e ele ainda não tem canal. Assim a
 * credencial do cliente não é gravada para depois a ligação ser recusada.
 */
export async function conferirQuePodeLigar(
  tx: TransactionPipe,
  tenantId: string,
  userId: string,
  fluxoId: string,
): Promise<void> {
  const atual = await flowVivo(tx, tenantId, fluxoId);
  await exigirPermissionInFlow(tx, userId, fluxoId, CONNECT_CHANNEL);
  if (atual.canalId) throw flowAlreadyHasChannel(await channelOfTenant(tx, tenantId, atual.canalId));
}

function flowAlreadyHasChannel(existente: { id: string; type: string; name: string }): PipeError {
  return PipeError.conflito(
    'flow_already_has_channel',
    `Este bot já está conectado ao canal "${existente.name}". Desconecte-o antes de conectar outro.`,
    { canalId: existente.id, canalTipo: existente.type, canalNome: existente.name },
  );
}

/** "Ativar número": o canal passa a ser deste bot. Ligar o mesmo canal de novo não é erro. */
export async function connectChannelToFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  channelId: string,
): Promise<ChannelOfFlow> {
  const atual = await flowVivo(tx, tenantId, fluxoId);
  await exigirPermissionInFlow(tx, usuarioId, fluxoId, CONNECT_CHANNEL);
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
    /* O título e a mensagem são os da origem (`whatsapp.errorMsg.phoneNumberIsAlreadyConnected`). */
    throw PipeError.conflito(
      'number_in_use',
      'Ops… Este número já está em uso. Para ativar o número neste bot, remova do anterior e tente novamente.',
      { fluxoId: dono.id, fluxoNome: dono.name },
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
 * Desligar o canal DO BOT. O canal continua existindo e ativo — desconectar o
 * número em si (`DELETE /v1/canais/whatsapp/:id`) é outro gesto. Sem canal,
 * nada muda e nada é registrado.
 *
 * `motivo` é o "Por qual motivo você quer desconectar o …?" do modal da
 * origem (Instagram/Messenger, `FICHA-conectar-canal-no-bot.md` §3.3): lá vai
 * para a analítica deles; aqui fica no log de auditoria.
 */
export async function disconnectChannelOfFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  motivo?: string,
): Promise<void> {
  const atual = await flowVivo(tx, tenantId, fluxoId);
  await exigirPermissionInFlow(tx, usuarioId, fluxoId, CONNECT_CHANNEL);
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
 * Quem administra o bot pode RECONECTAR o canal DELE (token vencido), porque na
 * origem isso se faz na página do canal dentro do bot. Devolve `true` quando o
 * canal pedido é mesmo o daquele bot e a pessoa tem poder nele.
 */
export async function canReconnectInFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  canalId: string,
): Promise<boolean> {
  const atual = await flowVivo(tx, tenantId, fluxoId);
  if (atual.canalId !== canalId) return false;
  await exigirPermissionInFlow(tx, usuarioId, fluxoId, CONNECT_CHANNEL);
  return true;
}
