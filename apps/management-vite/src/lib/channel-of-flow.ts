import type { ChannelOfFlow } from '@pipe/contracts';

/**
 * Pure screen-side rules for this BOT's channel (`fluxo/canais/**`) avoid `./api` so `tests/canal-do-fluxo.test.ts` runs without `import.meta.env`. Reference `FICHA-conectar-canal-no-bot.md` Section 1 has one channel page inside the bot; list cards choose Connected or Connect and navigate to that same page. This module decides the card and page states.
 */

/** These are the channel kinds with dedicated Pipe pages, matching `tipo` in `canal.tipo`. */
export type TipoOfChannelOfBot = 'whatsapp_cloud' | 'instagram' | 'messenger';

/** O segmento da URL de cada canal: `/{tipo}/{id}/canais/{segmento}` (o `/whatsapp-embedded` da origem vira `/whatsapp`). */
export const SEGMENT_OF_CHANNEL: Readonly<Record<TipoOfChannelOfBot, string>> = {
  whatsapp_cloud: 'whatsapp',
  instagram: 'instagram',
  messenger: 'messenger',
};

export function channelRota(base: string, tipo: TipoOfChannelOfBot): string {
  return `${base}/channels/${SEGMENT_OF_CHANNEL[tipo]}`;
}

/**
 * Channel state for THIS bot: `conectado` means an active channel of this kind (source `VERIFIED`); `nao_conectado` means none (source `LOGIN`); `outro_canal` means a different kind is already attached, a Pipe decision because `fluxo.canal_id` is a single column while the reference bot can have several.
 */
export type ChannelInBotState =
  | { state: 'conectado'; channel: ChannelOfFlow }
  | { state: 'nao_conectado' }
  | { state: 'outro_canal'; channel: ChannelOfFlow };

export function channelInBotState(
  channel: ChannelOfFlow | null,
  tipo: TipoOfChannelOfBot,
): ChannelInBotState {
  if (!channel) return { state: 'nao_conectado' };
  if (channel.tipo !== tipo) return { state: 'outro_canal', channel };
  if (!channel.ativo) return { state: 'nao_conectado' };
  return { state: 'conectado', channel };
}

/** The list card says Connected only for an ACTIVE channel of this kind on the bot. */
export function cardConnected(
  contact: { channelTipo: string | null; channelActive: boolean | null },
  tipo: string,
): boolean {
  return contact.channelActive === true && contact.channelTipo === tipo;
}

/**
 * Pipe's number-activation step differs from the reference, where the number starts attached to the bot. Offer active free channels of this kind and channels attached to another live bot so the screen can name that bot; the reference requires removal from the previous bot.
 */
export function channelsForOferecer(
  disponiveis: readonly ChannelOfFlow[],
  tipo: TipoOfChannelOfBot,
  flowId: string,
): { livres: ChannelOfFlow[]; emUso: ChannelOfFlow[] } {
  const doTipo = disponiveis.filter((c) => c.tipo === tipo && c.ativo);
  return {
    livres: doTipo.filter((c) => c.flowId === null || c.flowId === flowId),
    emUso: doTipo.filter((c) => c.flowId !== null && c.flowId !== flowId),
  };
}

/** Show a channel's number, Instagram `@usuário`, or Page ID, falling back to its name. */
export function channelRotulo(channel: Pick<ChannelOfFlow, 'nome' | 'numero'>): string {
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
