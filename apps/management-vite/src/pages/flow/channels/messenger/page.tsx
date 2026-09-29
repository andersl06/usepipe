import { useState } from 'react';
import type { ChannelOfFlow, ChannelOfFlowInScreen } from '@pipe/contracts';
import { Botao } from '@pipe/ui';
import { ApiError } from '@pipe/ui/api';
import { useRead } from '../../../../lib/query';
import { channelInBotState } from '../../../../lib/channel-of-flow';
import { ConectarMessengerManual } from '../../../registrations/channel-conectar-manual';
import { ReadFailure, useContact } from '../../contact';
import { ChannelLogo } from '../channels';
import { ChannelShell, type ChannelTab } from '../shell-of-channel';
import { OtherChannelNotice, ChooseChannelExisting, ModalDesconectar } from '../conexao';

/**
 * Messenger inside the BOT — `…channels/messenger`. The source's current page is a micro-frontend not present in the captured bundle (`FICHA-conectar-canal-no-bot.md` §1.4 and §5); what was read is the legacy `messengerDpr` (template 8080 + `MessengerOverviewTab.html`, 208152): title "Messenger", "Visão Geral" tab with the icon and text about the Facebook Page, and the disconnect modal (`messenger.modals.disconnect`).
 *
 * The connected state was NOT captured: here it follows the Instagram layout (chip with the Page + "Desconectar canal"), stated as a Pipe decision. The connection is the manual one (`ConectarMessengerManual`, with `flowId`) and, Pipe decision, picking a Page the account already has.
 */

const ABAS: readonly ChannelTab[] = [{ rotulo: 'Visão Geral', segment: '' }];

export function PageChannelMessenger() {
  const { contact } = useContact();
  const read = useRead<ChannelOfFlowInScreen>(`/v1/management/flows/${contact.id}/channel`);

  if (read.error && !(read.error instanceof ApiError && read.error.status === 404)) {
    return <ReadFailure error={read.error} />;
  }
  if (!read.data) return null;
  const situation = channelInBotState(read.data.channel, 'messenger');

  return (
    <ChannelShell tipo="messenger" titulo="Messenger" abas={ABAS} conectado={situation.state === 'conectado'}>
      {situation.state === 'conectado' ? (
        <Conectado flowId={contact.id} channel={situation.channel} />
      ) : situation.state === 'outro_canal' ? (
        <div className="cb-linha">
          <div className="cb-icon-column">
            <ChannelLogo nome="messenger" />
          </div>
          <div className="cb-column">
            <OtherChannelNotice channel={situation.channel} rotulo="Messenger" />
          </div>
        </div>
      ) : (
        <Desconectado flowId={contact.id} disponiveis={read.data.disponiveis} />
      )}
    </ChannelShell>
  );
}

function Conectado({ flowId, channel }: { flowId: string; channel: ChannelOfFlow }) {
  const [desconectando, setDesconectando] = useState(false);
  return (
    <div className="cb-linha">
      <div className="cb-icon-column">
        <ChannelLogo nome="messenger" />
      </div>
      <div className="cb-column">
        <p className="cb-typo-16">
          <strong>Seu chatbot está conectado à Página:</strong>
        </p>
        <span className="cb-chip">
          <span className="cb-chip-avatar" aria-hidden="true">
            <ChannelLogo nome="messenger" />
          </span>
          {channel.nome}
          {channel.numero ? ` (${channel.numero})` : ''}
        </span>
        <div className="cb-actions-right">
          <Botao type="button" variante="perigo" onClick={() => setDesconectando(true)}>
            Desconectar canal
          </Botao>
        </div>
        <ModalDesconectar
          aberto={desconectando}
          flowId={flowId}
          tipo="messenger"
          onFechar={() => setDesconectando(false)}
        />
      </div>
    </div>
  );
}

function Desconectado({ flowId, disponiveis }: { flowId: string; disponiveis: ChannelOfFlow[] }) {
  const [escolhendo, setEscolhendo] = useState(false);
  const hasFreePage = disponiveis.some(
    (c) => c.tipo === 'messenger' && c.ativo && (c.flowId === null || c.flowId === flowId),
  );

  if (escolhendo) {
    return (
      <ChooseChannelExisting
        flowId={flowId}
        tipo="messenger"
        disponiveis={disponiveis}
        onVoltar={() => setEscolhendo(false)}
      />
    );
  }

  return (
    <div className="cb-linha">
      <div className="cb-icon-column">
        <ChannelLogo nome="messenger" />
      </div>
      <div className="cb-column">
        <p className="cb-typo-16">
          Seu chatbot será acessado através de uma página no Facebook. Por isso, é importante que
          você{' '}
          <a href="https://www.facebook.com/pages/create" target="_blank" rel="noopener noreferrer">
            crie uma página
          </a>{' '}
          para a sua empresa no Facebook. Caso sua empresa já tenha uma página, você poderá
          utilizá-la.
        </p>
        <div className="cb-actions-right">
          <ConectarMessengerManual flowId={flowId} rotulo="Conectar-se ao Messenger" variante="primario" />
          {hasFreePage ? (
            <Botao type="button" onClick={() => setEscolhendo(true)}>
              Usar uma Página já conectada
            </Botao>
          ) : null}
        </div>
      </div>
    </div>
  );
}
