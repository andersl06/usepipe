import type { ChannelOfFlow } from '@pipe/contracts';

/**
 * Pure screen-side rules for this BOT's channel (`fluxo/canais/**`) avoid `./api` so `tests/canal-do-fluxo.test.ts` runs without `import.meta.env`. Reference `FICHA-conectar-canal-no-bot.md` Section 1 has one channel page inside the bot; list cards choose Connected or Connect and navigate to that same page. This module decides the card and page states.
 */

/** These are the channel kinds with dedicated Pipe pages, matching `tipo` in `canal.tipo`. */
export type TypeOfChannelOfBot = 'whatsapp_cloud' | 'instagram' | 'messenger';

/** O segmento da URL de cada canal: `/{tipo}/{id}/canais/{segmento}` (o `/whatsapp-embedded` da origem vira `/whatsapp`). */
export const SEGMENT_OF_CHANNEL: Readonly<Record<TypeOfChannelOfBot, string>> = {
  whatsapp_cloud: 'whatsapp',
  instagram: 'instagram',
  messenger: 'messenger',
};

export function channelRoute(base: string, tipo: TypeOfChannelOfBot): string {
  return `${base}/channels/${SEGMENT_OF_CHANNEL[tipo]}`;
}

/**
 * Channel state for this bot: routers read each type independently. A regular
 * flow with another type attached still shows `outro_canal`.
 */
export type ChannelInBotState =
  | { state: 'conectado'; channel: ChannelOfFlow }
  | { state: 'nao_conectado' }
  | { state: 'outro_canal'; channel: ChannelOfFlow };

export function channelInBotState(
  channels: ChannelOfFlow | readonly ChannelOfFlow[] | null,
  tipo: TypeOfChannelOfBot,
  isRouter = false,
): ChannelInBotState {
  const list = channels ? (Array.isArray(channels) ? channels : [channels]) : [];
  const channel = list.find((item) => item.tipo === tipo);
  if (channel?.ativo) return { state: 'conectado', channel };
  if (isRouter || !list.length || channel) return { state: 'nao_conectado' };
  return { state: 'outro_canal', channel: list[0]! };
}

/** The list card says Connected only for an ACTIVE channel of this kind on the bot. */
export function cardConnected(
  contact: { channelType: string | null; channelActive: boolean | null },
  tipo: string,
): boolean {
  return contact.channelActive === true && contact.channelType === tipo;
}

/**
 * Pipe's number-activation step differs from the reference, where the number starts attached to the bot. Offer active free channels of this kind and channels attached to another live bot so the screen can name that bot; the reference requires removal from the previous bot.
 */
export function channelsForOffer(
  disponiveis: readonly ChannelOfFlow[],
  tipo: TypeOfChannelOfBot,
  flowId: string,
): { livres: ChannelOfFlow[]; emUso: ChannelOfFlow[] } {
  const doTipo = disponiveis.filter((c) => c.tipo === tipo && c.ativo);
  return {
    livres: doTipo.filter((c) => c.flowId === null || c.flowId === flowId),
    emUso: doTipo.filter((c) => c.flowId !== null && c.flowId !== flowId),
  };
}

/** Show a channel's number, Instagram `@usuário`, or Page ID, falling back to its name. */
export function channelLabel(channel: Pick<ChannelOfFlow, 'nome' | 'numero'>): string {
  return channel.numero ? `${channel.numero} — ${channel.nome}` : channel.nome;
}

/** Use digits only for the Test on WhatsApp `https://wa.me/{numero}` URL. */
export function numeroParaWaMe(numero: string | null): string {
  return (numero ?? '').replace(/\D/g, '');
}

/**
 * Source Disconnect button requires both a reason and agreement (`class H`, portal.js 120544: `disconnectButtonDisabled = !agreedChecked || !motiveInputValue`).
 */
export function podeConfirmarDesconexao(motivo: string, concordou: boolean): boolean {
  return concordou && motivo.trim().length > 0;
}
