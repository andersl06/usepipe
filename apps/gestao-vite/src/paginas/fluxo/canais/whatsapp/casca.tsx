import { Outlet, useOutletContext } from 'react-router-dom';
import type { ChannelOfFlow, ChannelOfFlowInScreen } from '@pipe/contracts';
import { useRead } from '../../../../lib/consulta';
import { ApiError } from '../../../../lib/api';
import type { ChannelWhatsAppVisivel } from '../../../../lib/canais';
import { channelInBotState, type ChannelInBotState } from '../../../../lib/canal-do-fluxo';
import { ReadFalha, useContact } from '../../contato';
import { ChannelShell, type ChannelAba } from '../casca-do-canal';
import './canal-whatsapp.css';

/**
 * O WhatsApp por dentro do BOT — `/application/detail/{bot}/channels/whatsapp-embedded`
 * (`FICHA-conectar-canal-no-bot.md` §1.2–1.3, template 79961): seta "‹" para
 * a lista de canais, título "WhatsApp", e as abas Visão Geral | Perfil da
 * empresa | Configurações | Configurações de alerta | Ambiente de testes, com
 * "Documentação" à direita.
 *
 * As duas abas do meio só existem com o número conectado
 * (`ng-show="currentActivationStep === VERIFIED"`) — foto `08` da ficha do
 * canal. "Ambiente de testes" a Pipe ainda não tem por dentro.
 *
 * Estas abas moravam em `cadastros/canal-whatsapp/**`, no módulo Atendimento,
 * com o canal escolhido pela URL (`/canais/whatsapp/:canalId`). Na origem o
 * canal é DO BOT: a página é uma só por bot, e o canal vem de
 * `GET /v1/gestao/fluxos/:id/canal`. O que as abas de perfil, configurações e
 * alerta precisam além disso — a saúde do número na Meta — continua vindo de
 * `/v1/canais/whatsapp` (que pede `canal.gerenciar`; sem ela, a Visão Geral
 * desenha com o que o bot sabe e as outras abas dizem o que houve).
 */

export interface ChannelWhatsappContext {
  flowId: string;
  channel: ChannelOfFlow;
  /** O canal como `/v1/canais/whatsapp` o vê (estado na Meta, qualidade…); nulo se a leitura não veio. */
  saude: ChannelWhatsAppVisivel | null;
}

export function useChannelWhatsapp(): ChannelWhatsappContext {
  return useOutletContext<ChannelWhatsappContext>();
}

const ABAS: readonly ChannelAba[] = [
  { rotulo: 'Visão Geral', segment: '' },
  { rotulo: 'Perfil da empresa', segment: 'perfil', exigeConectado: true },
  { rotulo: 'Configurações', segment: 'configuracoes', exigeConectado: true },
  { rotulo: 'Configurações de alerta', segment: 'alerta' },
  { rotulo: 'Ambiente de testes', segment: 'testes', emBreve: true },
];

/** O que a Visão Geral recebe quando NÃO há canal: a tela decide o passo. */
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
  /* A saúde só interessa conectado; 403 (sem `canal.gerenciar`) não é falha da página. */
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
