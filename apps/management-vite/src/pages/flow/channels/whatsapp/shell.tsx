import { Outlet, useOutletContext } from 'react-router-dom';
import type { ChannelOfFlow, ChannelOfFlowInScreen } from '@pipe/contracts';
import { useRead } from '../../../../lib/query';
import { ApiError } from '../../../../lib/api';
import type { ChannelWhatsAppVisivel } from '../../../../lib/channels';
import { channelInBotState, type ChannelInBotState } from '../../../../lib/channel-of-flow';
import { ReadFalha, useContact } from '../../contact';
import { ChannelShell, type ChannelAba } from '../shell-of-channel';
import './channel-whatsapp.css';

/**
 * WhatsApp inside the BOT — `/application/detail/{bot}/channels/whatsapp-embedded` (`FICHA-conectar-canal-no-bot.md` §1.2–1.3, template 79961): "‹" back arrow to the channel list, title "WhatsApp", and the tabs Visão Geral | Perfil da empresa | Configurações | Configurações de alerta | Ambiente de testes, with "Documentação" on the right.
 *
 * The two middle tabs only exist with the number connected (`ng-show="currentActivationStep === VERIFIED"`) — photo `08` from the channel's ficha. "Ambiente de testes" Pipe doesn't have internally yet.
 *
 * These tabs used to live under `cadastros/canal-whatsapp/**`, in the Attendance module, with the channel chosen by the URL (`/canais/whatsapp/:canalId`). In the source the channel belongs TO THE BOT: there's one page per bot, and the channel comes from `GET /v1/gestao/fluxos/:id/canal`. What the profile, settings and alert tabs need beyond that — the number's health on Meta — still comes from `/v1/canais/whatsapp` (which requires `canal.gerenciar`; without it, Visão Geral draws with what the bot knows and the other tabs say what happened).
 */

export interface ChannelWhatsappContext {
  flowId: string;
  channel: ChannelOfFlow;
  /** The channel as `/v1/canais/whatsapp` sees it (state on Meta, quality…); null if the read hasn't come back. */
  saude: ChannelWhatsAppVisivel | null;
}

export function useChannelWhatsapp(): ChannelWhatsappContext {
  return useOutletContext<ChannelWhatsappContext>();
}

const ABAS: readonly ChannelAba[] = [
  { rotulo: 'Visão Geral', segment: '' },
  { rotulo: 'Perfil da empresa', segment: 'profile', exigeConectado: true },
  { rotulo: 'Configurações', segment: 'settings', exigeConectado: true },
  { rotulo: 'Configurações de alerta', segment: 'alerta' },
  { rotulo: 'Ambiente de testes', segment: 'testes', emBreve: true },
];

/** What Visão Geral receives when there's NO channel: the screen decides the step. */
export interface ContextWithoutChannel {
  flowId: string;
  situation: ChannelInBotState;
  disponiveis: ChannelOfFlow[];
}

export function ShellChannelWhatsapp() {
  const { contact } = useContact();
  const read = useRead<ChannelOfFlowInScreen>(`/v1/management/flows/${contact.id}/channel`);
  const situation = read.data ? channelInBotState(read.data.channel, 'whatsapp_cloud') : null;
  const conectado = situation?.state === 'conectado';
  /* Health only matters when connected; 403 (without `canal.gerenciar`) isn't a page failure. */
  const saudes = useRead<{ channels: ChannelWhatsAppVisivel[] }>(conectado ? '/v1/channels/whatsapp' : null, {
    retry: false,
  });

  if (read.error && !(read.error instanceof ApiError && read.error.status === 404)) {
    return <ReadFalha error={read.error} />;
  }
  if (!read.data || !situation) return null;

  const context: ChannelWhatsappContext | ContextWithoutChannel =
    situation.state === 'conectado'
      ? {
          flowId: contact.id,
          channel: situation.channel,
          saude: saudes.data?.channels.find((c) => c.id === situation.channel.id) ?? null,
        }
      : { flowId: contact.id, situation, disponiveis: read.data.disponiveis };

  return (
    <ChannelShell tipo="whatsapp_cloud" titulo="WhatsApp" abas={ABAS} conectado={conectado}>
      <Outlet context={context} />
    </ChannelShell>
  );
}
