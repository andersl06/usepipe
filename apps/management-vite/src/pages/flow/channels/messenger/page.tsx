import { useState } from 'react';
import type { ChannelOfFlow, ChannelOfFlowInScreen } from '@pipe/contracts';
import { Botao } from '@pipe/ui';
import { ApiError } from '../../../../lib/api';
import { useRead } from '../../../../lib/query';
import { channelInBotState } from '../../../../lib/channel-of-flow';
import { ConectarMessengerManual } from '../../../registrations/channel-conectar-manual';
import { ReadFalha, useContact } from '../../contact';
import { ChannelLogo } from '../channels';
import { ChannelShell, type ChannelAba } from '../shell-of-channel';
import { OtherChannelNotice, EscolherChannelExistente, ModalDesconectar } from '../conexao';

/**
 * O Messenger por dentro do BOT — `…channels/messenger`. A página atual da
 * origem é um micro-front que não está no bundle capturado
 * (`FICHA-conectar-canal-no-bot.md` §1.4 e §5); o que foi lido é o legado
 * `messengerDpr` (template 8080 + `MessengerOverviewTab.html`, 208152): título
 * "Messenger", aba "Visão Geral" com o ícone e o texto sobre a Página do
 * Facebook, e o modal de desconexão (`messenger.modals.disconnect`).
 *
 * O estado conectado NÃO foi capturado: aqui ele segue o desenho do Instagram
 * (chip com a Página + "Desconectar canal"), dito como decisão Pipe. A conexão
 * é a manual (`ConectarMessengerManual`, com `fluxoId`) e, decisão Pipe, a
 * escolha de uma Página que a conta já tem.
 */

const ABAS: readonly ChannelAba[] = [{ rotulo: 'Visão Geral', segment: '' }];

export function PageChannelMessenger() {
  const { contact } = useContact();
  const read = useRead<ChannelOfFlowInScreen>(`/v1/management/flows/${contact.id}/channel`);

  if (read.error && !(read.error instanceof ApiError && read.error.status === 404)) {
    return <ReadFalha error={read.error} />;
  }
  if (!read.data) return null;
  const situation = channelInBotState(read.data.channel, 'messenger');

  return (
    <ChannelShell tipo="messenger" titulo="Messenger" abas={ABAS} conectado={situation.state === 'conectado'}>
      {situation.state === 'conectado' ? (
        <Conectado flowId={contact.id} channel={situation.channel} />
      ) : situation.state === 'outro_canal' ? (
        <div className="cb-linha">
          <div className="cb-icone-coluna">
            <ChannelLogo nome="messenger" />
          </div>
          <div className="cb-coluna">
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
      <div className="cb-icone-coluna">
        <ChannelLogo nome="messenger" />
      </div>
      <div className="cb-coluna">
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
        <div className="cb-acoes-direita">
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
  const temPageLivre = disponiveis.some(
    (c) => c.tipo === 'messenger' && c.ativo && (c.flowId === null || c.flowId === flowId),
  );

  if (escolhendo) {
    return (
      <EscolherChannelExistente
        flowId={flowId}
        tipo="messenger"
        disponiveis={disponiveis}
        onVoltar={() => setEscolhendo(false)}
      />
    );
  }

  return (
    <div className="cb-linha">
      <div className="cb-icone-coluna">
        <ChannelLogo nome="messenger" />
      </div>
      <div className="cb-coluna">
        <p className="cb-typo-16">
          Seu chatbot será acessado através de uma página no Facebook. Por isso, é importante que
          você{' '}
          <a href="https://www.facebook.com/pages/create" target="_blank" rel="noopener noreferrer">
            crie uma página
          </a>{' '}
          para a sua empresa no Facebook. Caso sua empresa já tenha uma página, você poderá
          utilizá-la.
        </p>
        <div className="cb-acoes-direita">
          <ConectarMessengerManual flowId={flowId} rotulo="Conectar-se ao Messenger" variante="primario" />
          {temPageLivre ? (
            <Botao type="button" onClick={() => setEscolhendo(true)}>
              Usar uma Página já conectada
            </Botao>
          ) : null}
        </div>
      </div>
    </div>
  );
}
