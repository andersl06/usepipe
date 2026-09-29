import Link from '../../components/link';
import { Avatar } from '@pipe/ui';
import { IconePortal, LogoPortal, type NomeDeIconePortal } from '@pipe/ui/icones-portal';
import { numeroDaHome, pilhaDaEquipe, type Extensao, type Member, type Metrics } from './itens';

/**
 * The contact home's cards — the `.chatbot-home-content` areas (template `application.home`, module 77021 of `portal.js`).
 *
 * Each card receives its data via prop and applies the SAME condition as the source template to decide what shows. The page passes what Pipe has today; when it doesn't have it, it passes empty, and it's the source's rule that hides or swaps the state — not a decision of ours.
 */

/**
 * `<bds-button size="short" variant="tertiary">`, or the greyed-out block with the "em breve" badge when the destination doesn't exist here yet. `alto` is the store button's `size="standard"` (40px), and `seta` is the `bds-button`'s `arrow`: an outline `arrow-right` after the label.
 */
function Botao({
  href,
  alto,
  seta,
  children,
}: {
  href: string | null;
  alto?: boolean;
  seta?: boolean;
  children: React.ReactNode;
}) {
  const classe = alto ? 'fx-botao fx-botao-alto' : 'fx-botao';
  const miolo = (
    <>
      {children}
      {seta ? <IconePortal nome="direita" tamanho={24} /> : null}
    </>
  );
  if (href) {
    return (
      <Link className={classe} href={href}>
        {miolo}
      </Link>
    );
  }
  return (
    <span className={`${classe} pt-links-obra`}>
      {miolo}
      <span className="pt-obra-selo">em breve</span>
    </span>
  );
}

/* --------------------------------------------------------------- extensions */

/**
 * `ng-if="isBlipStoreHomeBotPluginsRecommendationServicePageEnabled && extensions.length > 0 && !showAiCard"`. In the capture the flag is on and the store returned two extensions — the source draws this column for the router. Here there's no store: the list arrives empty and the column disappears, same as there with no recommendation.
 */
export function CardExtensions({ extensions }: { extensions: readonly Extensao[] }) {
  if (extensions.length === 0) return null;
  return (
    <div className="fx-area-extensions">
      <section className="fx-paper fx-extensions-paper">
        <div className="fx-extensions-header">
          <div className="fx-extensions-title">
            <div className="fx-extensions-title-box">
              <h2 className="fx-h4">Extensões para você</h2>
            </div>
          </div>
          <div className="fx-extensions-button">
            {/*
 * "Ir para Blip Store" with our store's name, which is also under construction in the top bar.
 */}
            <Botao href={null} alto seta>
              Ir para Pipe Store
            </Botao>
          </div>
        </div>
        <div className="fx-extensions-list">
          {extensions.map((x) => (
            <div key={x.id} className="fx-extensao-item">
              <div className="fx-extensao">
                <div className="fx-extensao-topo">
                  <div className="fx-extension-image-box">
                    <img className="fx-extension-image" src={x.iconeUrl} alt="" />
                  </div>
                  <div className="fx-extensao-textos">
                    <b className="fx-extensao-nome">{x.nome}</b>
                    <div className="fx-extensao-sub">
                      <p className="fx-extensao-resumo">{x.resumo}</p>
                      <b className="fx-extensao-preco">
                        {x.paga ? 'Teste grátis' : 'Instalação grátis'}
                      </b>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ canais */

/**
 * The channel-logo row, in template order. `blip-chat` and `email` do NOT have `ng-if` — they always show; the others depend on `ChannelsService.activationStatuses`. Messenger, Telegram, Workplace, Apple and Google stay out because Pipe doesn't have those channel types: they could never be active.
 *
 * `logo: null` is `blip-chat`'s slot, which is Blip's brand and doesn't belong here: in its place goes the Pipe symbol, our site widget's brand.
 */
const LOGOS_OF_CHANNEL = [
  { tipo: 'widget', nome: 'Site', logo: null, sempre: true },
  { tipo: 'whatsapp_cloud', nome: 'WhatsApp', logo: 'whatsapp', sempre: false }, // `activationStatuses['wa']`
  { tipo: 'instagram', nome: 'Instagram', logo: 'instagram', sempre: false },
  { tipo: 'email', nome: 'E-mail', logo: 'email', sempre: true }, // `mailgun`
] as const;

/** `ng-if="!showAiCard"` — without the AI card (flag off), this is it. */
export function CardChannels({
  ativos,
  base,
}: {
  ativos: readonly string[];
  base: string;
}) {
  const logos = LOGOS_OF_CHANNEL.filter((l) => l.sempre || ativos.includes(l.tipo));
  return (
    <div className="fx-area-channels">
      <section className="fx-paper fx-faixa">
        <div className="fx-faixa-titulo">
          <h2 className="fx-h4">Canais</h2>
        </div>
        <div className="fx-faixa-sub">
          {/* Each slot is a `bds-icon type="logo" size="large"` (28px). */}
          <div className="fx-channels-logos">
            {logos.map((l) => (
              <span
                key={l.tipo}
                className="fx-channel-logo"
                role="img"
                aria-label={l.nome}
                title={l.nome}
              >
                {l.logo ? (
                  <LogoPortal nome={l.logo} tamanho={28} />
                ) : (
                  <img src="/pipe/simbolo.svg" alt="" width={28} height={28} />
                )}
              </span>
            ))}
          </div>
          <div className="fx-faixa-botao">
            <Botao href={`${base}/channels`}>Ver canais</Botao>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ equipe */

/**
 * Two states, based on `teamMembers.length`: more than one becomes the `avatar-array limit="8"`; one or none becomes the invite phrase.
 *
 * "Adicionar equipe" leads to `auth.application.detail.team`, the CONTACT's team. RBAC here is per-account — the table linking a person to a contact is missing, and until then the page passes an empty list and the button stays under construction.
 */
export function CardTeam({ members }: { members: readonly Member[] }) {
  return (
    <div className="fx-area-equipe">
      <section className="fx-paper fx-faixa">
        <div className="fx-faixa-titulo">
          <h2 className="fx-h4 fx-mb1">Equipe</h2>
        </div>
        <div className="fx-faixa-sub">
          {members.length > 1 ? (
            <div className="fx-pilha-caixa">
              <div className="fx-pilha">
                {pilhaDaEquipe(members).map((m, i) => (
                  /* `left: 41px × i` e `z-index: 100 − i` saem do controlador
                     `avatarArray`, que os escreve direto no estilo. */
                  <span
                    key={i}
                    className="fx-pilha-item"
                    style={{ left: 41 * i, zIndex: 100 - i }}
                    title={m.nome}
                  >
                    {m.fotoUrl ? <img src={m.fotoUrl} alt={m.nome} /> : <Avatar nome={m.nome} />}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="fx-strip-description">
              <p className="fx-description">Convide seu time para o seu contato inteligente</p>
            </div>
          )}
          <div className="fx-faixa-botao">
            <Botao href={null}>Adicionar equipe</Botao>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------- preferences */

/**
 * Cultura and Fuso horário are `bds-autocomplete` with `ng-disabled="!hasEditPermission"`, and Plano is `bds-input disabled="true"` with the value in the `placeholder`. Here there's no edit permission — culture and timezone belong to the account and are edited in Minha conta —, so all three arrive disabled and "Aplicar alterações" (which only exists with `hasEditPermission`) doesn't show up.
 */
export function CardPreferences({ fuso, plano }: { fuso: string; plano: string }) {
  return (
    <div className="fx-area-preferences">
      <section className="fx-paper fx-preferences">
        <h2 className="fx-h4">Preferências</h2>
        <div className="fx-campos">
          <Campo rotulo="Cultura" value="Português (Brasil)" />
          <Campo rotulo="Fuso horário" value={fuso} />
          <Campo rotulo="Plano" value={plano} dica />
        </div>
      </section>
    </div>
  );
}

function Campo({ rotulo, value, dica }: { rotulo: string; value: string; dica?: boolean }) {
  return (
    <div className="fx-campo" aria-disabled="true">
      <span className="fx-campo-rotulo">{rotulo}</span>
      <span className={dica ? 'fx-field-value fx-campo-dica' : 'fx-field-value'}>{value}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- metrics */

/**
 * `ng-if="nUsers != 0 && !isHidingHomeMetrics"`. `null` is our `isHidingHomeMetrics`: there's no per-contact count source — and in the capture the `is-hiding-home-metrics` flag is ON, so the source doesn't draw this card for the router either.
 */
export function CardMetrics({ metrics, base }: { metrics: Metrics | null; base: string }) {
  if (!metrics || metrics.users === 0) return null;
  return (
    <div className="fx-area-metrics">
      <section className="fx-paper fx-metrics">
        {/* `team` is the same design the portal already uses as `comunidade`. */}
        <Metrica
          icone="comunidade"
          rotulo="Usuários"
          dica="Número de usuários desde a criação do contato"
          value={metrics.users}
          href={null}
        />
        <Metrica
          icone="mensagem-recebida"
          rotulo="Mensagens recebidas"
          dica="Número de mensagens recebidas pelo contato desde a criação"
          value={metrics.recebidas}
          href={`${base}/attendance/report`}
        />
        <Metrica
          icone="mensagem-enviada"
          rotulo="Mensagens enviadas"
          dica="Número de mensagens enviadas pelo contato desde a criação"
          value={metrics.enviadas}
          href={`${base}/attendance/report`}
        />
      </section>
    </div>
  );
}

/**
 * One column: `size="brand"` icon, label with the `info` tooltip (solid theme), the number in `fs-32` and "Ver mais", which only shows on hover. The Users one goes to the contacts screen, which doesn't exist here; the message ones go to analytics.
 */
function Metrica({
  icone,
  rotulo,
  dica,
  value,
  href,
}: {
  icone: NomeDeIconePortal;
  rotulo: string;
  dica: string;
  value: number;
  href: string | null;
}) {
  return (
    <div className="fx-metrica">
      <IconePortal className="fx-metrica-icone" nome={icone} tamanho={64} />
      <div className="fx-metrica-texto">
        <div className="fx-metrica-rotulo">
          <span>{rotulo}</span>
          <span className="fx-metrica-dica" title={dica}>
            <IconePortal nome="informacao-cheia" tamanho={16} />
          </span>
        </div>
        <b className="fx-metric-value">{numeroDaHome(value)}</b>
        {href ? (
          <Link className="fx-metrica-link" href={href}>
            Ver mais
          </Link>
        ) : (
          <span className="fx-metrica-link pt-links-obra">
            Ver mais
            <span className="pt-obra-selo">em breve</span>
          </span>
        )}
      </div>
    </div>
  );
}
