import { useState } from 'react';
import type { ChannelOfFlow, ChannelOfFlowInScreen } from '@pipe/contracts';
import { Botao } from '@pipe/ui';
import { LogoPortal } from '../../../../components/icones-portal';
import { ApiError } from '../../../../lib/api';
import { useRead } from '../../../../lib/query';
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

  if (read.error && !(read.error instanceof ApiError && read.error.status === 404)) {
    return <ReadFailure error={read.error} />;
  }
  if (!read.data) return null;
  const situation = channelInBotState(read.data.channel, 'instagram');

  return (
    <ChannelShell tipo="instagram" titulo="Instagram" abas={ABAS} conectado={situation.state === 'conectado'}>
      {situation.state === 'conectado' ? (
        <Conectado flowId={contact.id} channel={situation.channel} />
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

function Conectado({ flowId, channel }: { flowId: string; channel: ChannelOfFlow }) {
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
        <p className="cb-typo-16">
          Você já pode conversar com seus clientes pelo Instagram e gerar mais insights para o seu
          negócio!
        </p>
        <div className="cb-actions-right">
          <Botao type="button" variante="perigo" onClick={() => setDesconectando(true)}>
            Desconectar canal
          </Botao>
        </div>
        <ModalDesconectar
          aberto={desconectando}
          flowId={flowId}
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
          <strong>
            Conecte seu chatbot ao canal de mensagens do Instagram e comece a transformar conversas em
            oportunidades!
          </strong>
        </p>
        <p className="cb-typo-16">
          ⚠️<strong>Atenção:</strong> para começar a conexão, você precisa ter permissão de
          administrador das páginas do Facebook e do Instagram da sua empresa. 🤓
        </p>
        <div className="cb-actions-right">
          <ConectarInstagramManual flowId={flowId} rotulo="Iniciar conexão" variante="primario" />
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
