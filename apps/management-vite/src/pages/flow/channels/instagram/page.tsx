import { useState } from 'react';
import type { ChannelOfFlow, ChannelOfFlowInScreen } from '@pipe/contracts';
import { Botao, Etiqueta } from '@pipe/ui';
import { LogoPortal } from '@pipe/ui/icones-portal';
import { ApiError } from '@pipe/ui/api';
import { useRead } from '../../../../lib/query';
import type { ChannelInstagramVisible } from '../../../../lib/channels';
import { channelInBotState } from '../../../../lib/channel-of-flow';
import { ConectarInstagramManual } from '../../../registrations/channel-conectar-manual';
import { ReadFailure, useContact } from '../../contact';
import { ChannelShell, type ChannelTab } from '../shell-of-channel';
import { OtherChannelNotice, ChooseChannelExisting, ModalDesconectar } from '../conexao';

/**
 * Instagram inside the BOT — `…channels/instagram` (template 230473, `FICHA-conectar-canal-no-bot.md` §1.4 and §3.3): title "Instagram", tabs "Visão Geral" and "Configurações" (the latter Pipe doesn't have internally), "Documentação" on the right.
 *
 * Disconnected Overview (`InstagramOverviewDisconnectedView.html`): the icon, the bold description, the admin-permission notice and "Iniciar conexão" (button with arrow, on the right). In the source it opens the Facebook login steps (`InstagramSteps.html`); Pipe only has the manual path, so the button opens the manual modal, and "Usar uma conta já conectada" (Pipe decision) offers the accounts the account already has.
 *
 * Connected (`InstagramOverviewConnectedView.html`): "Seu chatbot está conectado à conta:", the `@username` chip, the description and "Desconectar canal" (`variant="delete"`, on the right) with the reason + agreement modal.
 */

const ABAS: readonly ChannelTab[] = [
  { rotulo: 'Visão Geral', segment: '' },
  { rotulo: 'Configurações', segment: 'configuracoes', emBreve: true },
];

export function PageChannelInstagram() {
  const { contact } = useContact();
  const read = useRead<ChannelOfFlowInScreen>(`/v1/management/flows/${contact.id}/channel`);
  const connectedChannel = read.data?.channels.find((item) => item.tipo === 'instagram' && item.ativo);
  const health = useRead<ChannelInstagramVisible | null>(
    connectedChannel ? `/v1/management/flows/${contact.id}/channel/status?channelId=${connectedChannel.id}` : null,
    { retry: false },
  );

  if (read.error && !(read.error instanceof ApiError && read.error.status === 404)) {
    return <ReadFailure error={read.error} />;
  }
  if (!read.data) return null;
  const situation = channelInBotState(read.data.channels, 'instagram', contact.tipo === 'roteador');

  return (
    <ChannelShell
      tipo="instagram"
      titulo="Instagram"
      abas={ABAS}
      conectado={situation.state === 'conectado'}
    >
      {situation.state === 'conectado' ? (
        <Conectado
          flowId={contact.id}
          channel={situation.channel}
          health={health.data?.id === situation.channel.id ? health.data : null}
        />
      ) : situation.state === 'outro_canal' ? (
        <div className="cb-linha">
          <div className="cb-icon-column">
            <LogoPortal nome="instagram" tamanho={64} />
          </div>
          <div className="cb-column">
            <OtherChannelNotice channel={situation.channel} rotulo="Instagram" />
          </div>
        </div>
      ) : (
        <Desconectado flowId={contact.id} disponiveis={read.data.disponiveis} />
      )}
    </ChannelShell>
  );
}

function Conectado({
  flowId,
  channel,
  health,
}: {
  flowId: string;
  channel: ChannelOfFlow;
  health: ChannelInstagramVisible | null;
}) {
  const [desconectando, setDesconectando] = useState(false);
  const user = channel.numero ? `@${channel.numero.replace(/^@/, '')}` : channel.nome;
  return (
    <div className="cb-linha">
      <div className="cb-icon-column">
        <LogoPortal nome="instagram" tamanho={64} />
      </div>
      <div className="cb-column">
        <p className="cb-typo-16">
          <strong>Seu chatbot está conectado à conta:</strong>
        </p>
        <span className="cb-chip">
          <span className="cb-chip-avatar" aria-hidden="true">
            <LogoPortal nome="instagram" tamanho={28} />
          </span>
          {user}
        </span>
        {health?.state === 'indisponivel' ? (
          <Etiqueta tom="alerta">
            A autorização desta conta expirou. Atualize as credenciais para voltar a receber mensagens.
          </Etiqueta>
        ) : health?.state === 'desligado' ? (
          <Etiqueta tom="alerta">Esta conta está desligada e não recebe mensagens.</Etiqueta>
        ) : (
          <p className="cb-typo-16">
            {health?.state === 'conectado'
              ? 'As mensagens desta conta aparecem no atendimento.'
              : 'A conta está vinculada a este bot. Não foi possível confirmar o estado da conexão agora.'}
          </p>
        )}
        <div className="cb-actions-right">
          {health?.state === 'indisponivel' && health.motivo === 'reautorizacao_pendente' ? (
            <ConectarInstagramManual
              flowId={flowId}
              channelId={channel.id}
              rotulo="Atualizar credenciais"
              variante="primario"
            />
          ) : null}
          <Botao type="button" variante="perigo" onClick={() => setDesconectando(true)}>
            Desconectar canal
          </Botao>
        </div>
        <ModalDesconectar
          aberto={desconectando}
          flowId={flowId}
          channelId={channel.id}
          tipo="instagram"
          onFechar={() => setDesconectando(false)}
        />
      </div>
    </div>
  );
}

function Desconectado({ flowId, disponiveis }: { flowId: string; disponiveis: ChannelOfFlow[] }) {
  const [escolhendo, setEscolhendo] = useState(false);
  const hasFreeAccount = disponiveis.some(
    (c) => c.tipo === 'instagram' && c.ativo && (c.flowId === null || c.flowId === flowId),
  );

  if (escolhendo) {
    return (
      <ChooseChannelExisting
        flowId={flowId}
        tipo="instagram"
        disponiveis={disponiveis}
        onVoltar={() => setEscolhendo(false)}
      />
    );
  }

  return (
    <div className="cb-linha">
      <div className="cb-icon-column">
        <LogoPortal nome="instagram" tamanho={64} />
      </div>
      <div className="cb-column">
        <p className="cb-typo-16">
          Conecte uma conta profissional do Instagram para atender mensagens pelo Pipe.
        </p>
        <p className="cb-typo-16">
          Você precisa ter acesso de administradora ou administrador ao aplicativo e à conta do
          Instagram que será conectada.
        </p>
        <div className="cb-actions-right">
          <ConectarInstagramManual
            flowId={flowId}
            rotulo="Conectar Instagram"
            variante="primario"
          />
          {hasFreeAccount ? (
            <Botao type="button" onClick={() => setEscolhendo(true)}>
              Usar uma conta já conectada
            </Botao>
          ) : null}
        </div>
      </div>
    </div>
  );
}
