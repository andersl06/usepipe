import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Botao, EmptyState } from '@pipe/ui';
import { ConectarWhatsApp } from '../../../../components/registration-embedded-whatsapp';
import { IconePortal, LogoPortal } from '../../../../components/icones-portal';
import { rotuloDoMotivo } from '../../../../lib/channels';
import { numeroParaWaMe } from '../../../../lib/channel-of-flow';
import { ConectarWhatsappManual } from '../../../registrations/channel-conectar-manual';
import { OtherChannelNotice, ChooseChannelExisting, ModalDesconectar } from '../conexao';
import type { ChannelWhatsappContext, ContextWithoutChannel } from './shell';

/**
 * WhatsApp Overview — the `bds-tab-panel group="content-tab-0"` of template 79961, which swaps the partial for the activation step (`FICHA-conectar-canal-no-bot.md` §2):
 *
 * - `VERIFIED` → `WhatsAppVerified.html` (photo `01`): "Seu chatbot está conectado ao número:", the green chip, the two paragraphs and "Testar no WhatsApp";
 * - `LOGIN` → `WhatsAppStart.html`: the icon, `welcome.instructions` and "Vamos lá!" (button with arrow, on the right);
 * - `FACEBOOK_CONNECTION` → `WhatsAppFacebookConnectionStep.html`: "Conecte o Pipe ao Facebook" (the brand is the only thing that's ours), the two paragraphs, "Voltar" and "Conectar-se ao Facebook" (Meta's embedded signup, which only works with an approved app — `cadastro-embutido-whatsapp.tsx`);
 * - `SELECT_PHONE` → `WhatsAppSelectedNumber.html`, used here to pick a number the account already has (`EscolherCanalExistente`, Pipe decision).
 *
 * The `AWAIT_CONTAINER`, `ASK_PIN`, `PHONE_NOT_FOUND` steps and the two commercial-block steps don't exist on Pipe: the customer owns their WABA and the number doesn't go through a container or a balance check (FICHA §4.6).
 *
 * "Reconectar número" is our door for the expired token: in the source the token belongs to the platform and reconnecting redoes the embedded signup on the SAME channel; here the token belongs to the customer and expires, and without this door, swapping it became a dead end — disconnecting and re-registering runs into the same number.
 *
 * Pipe additions, stated as such: "Conectar manualmente" next to the Facebook button (the path for whoever doesn't have an app approved on Meta) and "Desconectar canal" in the connected state — the source's current WhatsApp has no such button (FICHA §4.5), but without it there's no way to "remove from the previous one" to switch bots. It only disconnects FROM THE BOT: the number stays connected to Meta.
 */

type Passo = 'inicio' | 'conexao' | 'escolher';

export function AbaVisaoGeral() {
  const context = useOutletContext<ChannelWhatsappContext | ContextWithoutChannel>();
  if ('channel' in context) return <Conectado {...context} />;
  return <NaoConectado {...context} />;
}

function Conectado({ flowId, channel, saude }: ChannelWhatsappContext) {
  const [desconectando, setDesconectando] = useState(false);
  const numero = saude?.number ?? channel.numero ?? channel.nome;
  const numeroWa = numeroParaWaMe(saude?.number ?? channel.numero);

  if (saude && saude.state === 'indisponivel') {
    return (
      <div className="cb-empty">
        <EmptyState titulo="Ainda não é possível usar este número" illustration="erro">
          <p className="sub">{rotuloDoMotivo(saude.motivo)}</p>
        </EmptyState>
        <ConectarWhatsappManual
          flowId={flowId}
          channelId={channel.id}
          values={{ wabaId: saude?.wabaId ?? undefined, numeroId: saude?.numeroId ?? undefined }}
          rotulo="Reconectar número"
          variante="primario"
        />
        <Botao type="button" variante="perigo" onClick={() => setDesconectando(true)}>
          Desconectar canal
        </Botao>
        <ModalDesconectar
          aberto={desconectando}
          flowId={flowId}
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
        Você já pode conversar com seus clientes pelo WhatsApp, configurar as funcionalidades do
        canal e gerar mais insights para o seu negócio!
      </p>
      <p className="cb-typo-16">
        Com o número conectado, você tem a possibilidade de interagir com seus clientes e leads
        proativamente, sem precisar que ele te chame no WhatsApp primeiro. Conheça nossas{' '}
        <strong>boas práticas</strong>!
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
        <ConectarWhatsappManual
          flowId={flowId}
          channelId={channel.id}
          values={{ wabaId: saude?.wabaId ?? undefined, numeroId: saude?.numeroId ?? undefined }}
          rotulo="Reconectar número"
        />
        <Botao type="button" variante="perigo" onClick={() => setDesconectando(true)}>
          Desconectar canal
        </Botao>
      </div>
      <ModalDesconectar
        aberto={desconectando}
        flowId={flowId}
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
            Quer estar presente no canal mais utilizado no mundo? Chegou a hora de conectar seu
            contato inteligente ao WhatsApp e ganhar proximidade real com clientes! Para começar,
            vamos ativar o número escolhido e depois verificar a autenticidade de sua empresa.
          </p>
          <div className="cb-actions-right">
            <Botao type="button" variante="primario" onClick={() => setPasso('conexao')}>
              Vamos lá!
              <IconePortal nome="direita" tamanho={16} />
            </Botao>
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
        onVoltar={() => setPasso('conexao')}
      />
    );
  }

  return (
    <div className="cb-passo-facebook">
      <div className="cb-passo-facebook-texto">
        <h2 className="cb-titulo-32">Conecte o Pipe ao Facebook</h2>
        <p className="cb-typo-16">
          Ao clicar no botão &quot;Conectar-se ao Facebook&quot;, uma nova janela se abrirá e você
          precisará fazer login com uma <strong>conta administradora</strong> do Gerenciador de
          Negócios da sua empresa no Facebook.
        </p>
        <p className="cb-typo-16">
          Ao finalizar este processo, é só voltar para esta janela que continuaremos a conexão por
          aqui. 😊
        </p>
        <div className="cb-actions-between" style={{ width: '100%' }}>
          <Botao type="button" onClick={() => setPasso('inicio')}>
            <IconePortal nome="esquerda" tamanho={16} />
            Voltar
          </Botao>
          <ConectarWhatsApp
            flowId={flowId}
            rotulo="Conectar-se ao Facebook"
            className="cb-botao-facebook"
            prefix={<LogoDoFacebook />}
          />
        </div>
        {/*
 * Pipe additions: without an app approved on Meta, the path is the manual one; and a number the account already has can be chosen instead of registered again.
 */}
        <div className="cb-actions-between" style={{ width: '100%' }}>
          <ConectarWhatsappManual flowId={flowId} rotulo="Conectar manualmente" />
          {temNumeroLivre ? (
            <Botao type="button" onClick={() => setPasso('escolher')}>
              Usar um número já conectado
            </Botao>
          ) : null}
        </div>
      </div>
      <div className="cb-passo-facebook-figura" aria-hidden="true">
        <LogoPortal nome="whatsapp" tamanho={120} />
      </div>
    </div>
  );
}

/** The source button's `icon-left="facebook" type-icon="logo"`. */
function LogoDoFacebook() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M13.5 21v-7.2h2.4l.4-2.9h-2.8V9.1c0-.8.2-1.4 1.4-1.4h1.5V5.1c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.1H8v2.9h2.5V21h3Z"
      />
    </svg>
  );
}
