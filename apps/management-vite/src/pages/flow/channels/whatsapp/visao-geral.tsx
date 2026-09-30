import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Botao, EmptyState } from '@pipe/ui';
import { LogoPortal } from '@pipe/ui/icones-portal';
import { rotuloDoMotivo, shouldReconnectWhatsapp } from '../../../../lib/channels';
import { numeroParaWaMe } from '../../../../lib/channel-of-flow';
import { ConectarWhatsappManual } from '../../../registrations/channel-conectar-manual';
import { OtherChannelNotice, ChooseChannelExisting, ModalDesconectar } from '../conexao';
import type { ChannelWhatsappContext, ContextWithoutChannel } from './shell';

/**
 * WhatsApp Overview — the `bds-tab-panel group="content-tab-0"` of template 79961, which swaps the partial for the activation step (`FICHA-conectar-canal-no-bot.md` §2):
 *
 * - `VERIFIED` → `WhatsAppVerified.html` (photo `01`): "Seu chatbot está conectado ao número:", the green chip, the two paragraphs and "Testar no WhatsApp";
 * - `LOGIN` → `WhatsAppStart.html`: the icon, `welcome.instructions` and "Vamos lá!" (button with arrow, on the right);
 * - Pipe usa somente a conexão manual: as credenciais da Meta são informadas no formulário do canal.
 * - `SELECT_PHONE` → `WhatsAppSelectedNumber.html`, used here to pick a number the account already has (`EscolherCanalExistente`, Pipe decision).
 *
 * The `AWAIT_CONTAINER`, `ASK_PIN`, `PHONE_NOT_FOUND` steps and the two commercial-block steps don't exist on Pipe: the customer owns their WABA and the number doesn't go through a container or a balance check (FICHA §4.6).
 *
 * Quando o número falha, a ação disponível é atualizar as credenciais desse mesmo canal.
 *
 * A desconexão remove o vínculo com o bot; o número continua cadastrado na Meta.
 */

type Passo = 'inicio' | 'escolher';

export function AbaVisaoGeral() {
  const context = useOutletContext<ChannelWhatsappContext | ContextWithoutChannel>();
  if ('channel' in context) return <Conectado {...context} />;
  return <NaoConectado {...context} />;
}

function Conectado({ flowId, channel, saude }: ChannelWhatsappContext) {
  const [desconectando, setDesconectando] = useState(false);
  const numero = saude?.number ?? channel.numero ?? channel.nome;
  const numeroWa = numeroParaWaMe(saude?.number ?? channel.numero);

  if (saude?.state === 'indisponivel' || saude?.state === 'desligado') {
    const needsReconnect = shouldReconnectWhatsapp(saude);
    return (
      <div className="cb-empty">
        <EmptyState
          titulo={saude.state === 'desligado' ? 'Este número está desligado' : 'Ainda não é possível usar este número'}
          illustration="erro"
        >
          <p className="sub">
            {saude.state === 'desligado'
              ? 'Verifique o canal na gestão de contas.'
              : rotuloDoMotivo(saude.motivo)}
          </p>
        </EmptyState>
        {needsReconnect ? (
          <ConectarWhatsappManual
            flowId={flowId}
            channelId={channel.id}
            values={{ wabaId: saude.wabaId ?? undefined, numeroId: saude.numeroId ?? undefined }}
            rotulo="Reconectar número"
            variante="primario"
          />
        ) : saude.state === 'indisponivel' ? (
          <Botao type="button" variante="primario" onClick={() => window.location.reload()}>
            Tentar novamente
          </Botao>
        ) : null}
        <Botao type="button" variante="perigo" onClick={() => setDesconectando(true)}>
          Desconectar canal
        </Botao>
        <ModalDesconectar
          aberto={desconectando}
          flowId={flowId}
          channelId={channel.id}
          tipo="whatsapp_cloud"
          onFechar={() => setDesconectando(false)}
        />
      </div>
    );
  }

  return (
    <div className="cb-column">
      <h2 className="cb-titulo-20">Seu chatbot está conectado ao número:</h2>
      <span className="cb-chip">
        <span className="cb-chip-avatar" aria-hidden="true">
          <LogoPortal nome="whatsapp" tamanho={28} />
        </span>
        {numero}
      </span>
      <p className="cb-typo-16">
        {saude?.state === 'conectado'
          ? 'O número está ativo neste bot. As mensagens recebidas aparecem no atendimento.'
          : 'O número está vinculado a este bot. Não foi possível confirmar o estado da conexão agora.'}
      </p>
      <div className="cb-actions-between">
        <Botao
          type="button"
          variante="primario"
          disabled={!numeroWa}
          onClick={() => window.open(`https://wa.me/${numeroWa}`, '_blank', 'noopener,noreferrer')}
        >
          Testar no WhatsApp
        </Botao>
        <Botao type="button" variante="perigo" onClick={() => setDesconectando(true)}>
          Desconectar canal
        </Botao>
      </div>
      <ModalDesconectar
        aberto={desconectando}
        flowId={flowId}
        channelId={channel.id}
        tipo="whatsapp_cloud"
        onFechar={() => setDesconectando(false)}
      />
    </div>
  );
}

function NaoConectado({ flowId, situation, disponiveis }: ContextWithoutChannel) {
  const [passo, setPasso] = useState<Passo>('inicio');
  const temNumeroLivre = disponiveis.some(
    (c) => c.tipo === 'whatsapp_cloud' && c.ativo && (c.flowId === null || c.flowId === flowId),
  );

  if (situation.state === 'outro_canal') {
    return (
      <div className="cb-linha">
        <div className="cb-icon-column">
          <LogoPortal nome="whatsapp" tamanho={64} />
        </div>
        <div className="cb-column">
          <OtherChannelNotice channel={situation.channel} rotulo="WhatsApp" />
        </div>
      </div>
    );
  }

  if (passo === 'inicio') {
    return (
      <div className="cb-linha">
        <div className="cb-icon-column">
          <LogoPortal nome="whatsapp" tamanho={64} />
        </div>
        <div className="cb-column">
          <p className="cb-typo-16">
            Conecte o WhatsApp para receber e responder mensagens dos seus clientes no Pipe.
          </p>
          <div className="cb-actions-right">
            <ConectarWhatsappManual
              flowId={flowId}
              rotulo="Conectar WhatsApp"
              variante="primario"
            />
            {temNumeroLivre ? (
              <Botao type="button" onClick={() => setPasso('escolher')}>
                Usar número já conectado
              </Botao>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (passo === 'escolher') {
    return (
      <ChooseChannelExisting
        flowId={flowId}
        tipo="whatsapp_cloud"
        disponiveis={disponiveis}
        onVoltar={() => setPasso('inicio')}
      />
    );
  }
  return null;
}
