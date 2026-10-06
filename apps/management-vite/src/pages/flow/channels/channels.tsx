import { LogoPortal } from '@pipe/ui/icones-portal';
import type { ChannelOfFlowInScreen } from '@pipe/contracts';
import Link from '../../../components/link';
import { cardConnected, channelRoute, type TypeOfChannelOfBot } from '../../../lib/channel-of-flow';
import { useRead } from '../../../lib/query';
import { ShellModule, contactPath, useContact } from '../contact';
import '../integrations/header-of-page.css';
import './channels.css';

/**
 * Contact channels — `auth.application.detail.channels` from capture 8.
 *
 * The source is the module 27679 template of `portal.js` (line 80819) and the `.channels-list` rules from `portal.css`. There, each card is a `<card ng-click="$ctrl.goToState('…channels.<canal>')">` — the click targets the WHOLE CARD, and "Conectar"/"Conectado" in the footer only change appearance: both lead to the SAME channel page, inside the bot (`referencias-blip/fichas/FICHA-conectar-canal-no-bot.md` §1.1).
 *
 * WhatsApp, Messenger and Instagram have their own configuration pages. Pipe Chat and E-mail
 * remain active for the contact. Telegram and Slack stay visible in the catalog, but are not
 * presented as connectable until their server-side connector exists. Apple Messages for Business
 * and RCS for Business are deliberately out of the catalog for now.
 */
type Logo = 'pipe' | 'whatsapp' | 'messenger' | 'instagram' | 'telegram' | 'slack' | 'email';
type ScreenChannel = {
  key: string;
  nome: string;
  logo: Logo;
  sempre?: boolean;
  /** The catalog may show a provider before Pipe supports its real connector. */
  pendingIntegration?: boolean;
  /** Has its own page inside the bot: the card navigates. */
  page?: TypeOfChannelOfBot;
  /** `channel.tipo` stored for this card when it differs from `key`. */
  storedType?: string;
  /** Path segment of a page that is not a typed provider channel. */
  segment?: string;
};

const CHANNELS: readonly ScreenChannel[] = [
  { key: 'pipe-chat', nome: 'Pipe Chat', logo: 'pipe', storedType: 'widget', segment: 'pipe-chat' },
  { key: 'whatsapp_cloud', nome: 'WhatsApp', logo: 'whatsapp', page: 'whatsapp_cloud' },
  { key: 'messenger', nome: 'Messenger', logo: 'messenger', page: 'messenger' },
  { key: 'instagram', nome: 'Instagram', logo: 'instagram', page: 'instagram' },
  { key: 'telegram', nome: 'Telegram', logo: 'telegram', pendingIntegration: true },
  { key: 'email', nome: 'E-mail', logo: 'email', sempre: true },
  { key: 'slack', nome: 'Slack', logo: 'slack', pendingIntegration: true },
] as const;

export function ChannelsPage() {
  const { contact } = useContact();
  const base = contactPath(contact);
  const linked = useRead<ChannelOfFlowInScreen>(`/v1/management/flows/${contact.id}/channel`);

  return (
    <ShellModule ativo="Canais">
      <header className="ph-cabecalho">
        <div className="ph-conteudo">
          <div className="ph-titulo-caixa">
            <h1 className="ph-titulo">Canais de conversa</h1>
          </div>
        </div>
      </header>

      <div className="cn-lista">
        {CHANNELS.map((channel) => {
          const storedType = channel.storedType ?? channel.key;
          const conectado = channel.sempre || (linked.data
            ? linked.data.channels.some((item) => item.tipo === storedType && item.ativo)
            : cardConnected(contact, storedType));
          const miolo = (
            <>
              <div className="cn-card-content">
                <ChannelLogo nome={channel.logo} />
                <h2>{channel.nome}</h2>
              </div>
              <span
                className={
                  conectado
                    ? 'cn-botao cn-botao--conectado'
                    : channel.pendingIntegration
                      ? 'cn-botao cn-botao--pending-integration'
                      : 'cn-botao'
                }
              >
                {conectado ? 'Conectado' : channel.pendingIntegration ? 'Em preparação' : 'Conectar'}
              </span>
            </>
          );
          return (
            <div className="cn-item" key={channel.key}>
              {channel.page || channel.segment ? (
                <Link
                  href={channel.page ? channelRoute(base, channel.page) : `${base}/channels/${channel.segment}`}
                  className="cn-card cn-card--link"
                  aria-label={`${channel.nome}: ${conectado ? 'Conectado' : channel.pendingIntegration ? 'Em preparação' : 'Conectar'}`}
                >
                  {miolo}
                </Link>
              ) : (
                <article className="cn-card">
                  {miolo}
                </article>
              )}
            </div>
          );
        })}
      </div>
    </ShellModule>
  );
}

function ChannelLogo({ nome }: { nome: Logo }) {
  if (nome === 'pipe') {
    return <img className="cn-logo" src="/pipe/simbolo.svg" alt="" width={64} height={64} />;
  }
  if (nome === 'whatsapp' || nome === 'instagram' || nome === 'email') {
    return <LogoPortal className="cn-logo" nome={nome} tamanho={64} />;
  }

  return (
    <svg className={`cn-logo cn-logo--${nome}`} viewBox="0 0 80 80" aria-hidden="true">
      {nome === 'messenger' ? (
        <>
          <circle cx="40" cy="39" r="32" fill="url(#messenger-cor)" />
          <path
            d="m21 49 10-16c1.5-2.4 4.7-3 7-1.3l7.5 5.7c.7.5 1.6.5 2.3 0L58 29.7c1.4-1 3.1.6 2.2 2L50 47c-1.5 2.4-4.7 3-7 1.3l-7.5-5.7c-.7-.5-1.6-.5-2.3 0L23 50.3c-1.4 1-3.1-.6-2.2-2Z"
            fill="#fff"
          />
          <defs>
            <radialGradient
              id="messenger-cor"
              cx="0"
              cy="0"
              r="1"
              gradientTransform="translate(20 72) scale(70)"
            >
              <stop stopColor="#0099ff" />
              <stop offset=".61" stopColor="#a033ff" />
              <stop offset=".94" stopColor="#ff5280" />
              <stop offset="1" stopColor="#ff7061" />
            </radialGradient>
          </defs>
        </>
      ) : nome === 'telegram' ? (
        <>
          <circle cx="40" cy="40" r="32" fill="#30a3e6" />
          <path
            d="M49 29c2-.8 5-1.3 4.8 1.8l-3.1 20.8c-.3 2.3-.4 5.2-2.5 5.9-1.8.7-3.5-.5-5-1.5l-8.8-6.3c-1.4-1 .7-2.1 1.6-3l9.7-9.6c.8-.8 0-1.4-.9-.8l-15 9.6c-2 1.3-3.6.7-5.4.1l-2.7-.9c-2.2-.8-2.8-2.2.1-3.4L49 29Z"
            fill="#fff"
          />
        </>
      ) : nome === 'slack' ? (
        <>
          <rect x="33" y="8" width="13" height="28" rx="6.5" fill="#36c5f0" />
          <rect x="44" y="34" width="28" height="13" rx="6.5" fill="#2eb67d" />
          <rect x="34" y="44" width="13" height="28" rx="6.5" fill="#ecb22e" />
          <rect x="8" y="33" width="28" height="13" rx="6.5" fill="#e01e5a" />
        </>
      ) : (
        <>
          <circle cx="40" cy="40" r="32" fill="#3c64cb" />
          <path
            d="M51 26H29a7 7 0 0 0-7 7v15a8 8 0 0 0 8 8h20a10 10 0 0 0 10-10V35a9 9 0 0 0-9-9Z"
            fill="#f3f3f3"
          />
          <path
            d="M31 34h21M31 41h21M31 48h12"
            stroke="#c7c7c7"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

/** The channel logo, so each channel's page can reuse the same artwork as the list. */
export { ChannelLogo };
