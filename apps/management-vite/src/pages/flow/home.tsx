import { Avatar } from '@pipe/ui';
import { ContactBars, contactPath, useContact } from './contact';
import {
  CardChannels,
  CardTeam,
  CardExtensions,
  CardMetrics,
  CardPreferences,
} from './cards';
import { portalUseShell } from '../../lib/shell';
import './flow.css';

/**
 * The contact screen — the origin's `auth.application.detail.home`, `/application/detail/{shortName}/home`.
 *
 * This is where router creation ENDS: there, `goToApplicationDetails()` does `$state.go('auth.application.detail.home', { shortName })`, which is why `criar/roteador/acoes.ts` now redirects here.
 *
 * The ruler is the `supernova.blip.ai/portal.js` bundle (25.203.0-v0.43.0) — the `application.home` template (module 77021) and the `HomeController` controller (module 84909) —, plus the `portal.css` sheet for the grid layout.
 *
 * ═══ THE ROUTE NOW USES `shortName`, LIKE THE ORIGIN ═══
 *
 * `fluxo.short_name` is unique among live flows in the tenant since migration 0051 (D-52, plan
 * 01-43), so the URL carries it directly (`/application/detail/{shortName}`, D-52) instead of the
 * internal `id`. The origin still writes "Id:" beside the short name on this exact screen, which
 * is why the header below keeps showing both.
 *
 * ═══ WHAT THE ORIGIN SHOWS THAT WE DON'T HAVE ═══
 *
 * Its body is a grid of up to five areas — Extensões, Canais, Equipe, Preferências, and Métricas. Each card (`cartoes.tsx`) receives its data by prop and applies the origin template's condition; this page passes what Pipe has, and empty for what it doesn't — and it's the origin's rule that decides what disappears.
 *
 * The chrome is the PORTAL's (`pt-app` + `BarraDoPortal`), as in "Novidades" and the "Painel do contrato": in the origin this screen swaps the portal's light bar for the contact's DARK bar, but the top bar stays the same. That's why `/fluxo` joined the list of screens with their own shell in `estrutura-gestao.tsx`.
 */
export function ContactHome() {
  const { contact, fuso } = useContact();
  const shell = portalUseShell();
  const base = contactPath(contact);

  return (
    <div className="pt-app">
      <ContactBars />

      {/* `#main-content-area` is `pa0`: the inner `.container` is what adds the padding. */}
      <main className="pt-conteudo fx-miolo">
        <div className="fx-column">
          {/*
 * The origin's header: photo on the left, name and "Id:" beside it, and the creation date flush right, on the same line.
 */}
          <header className="fx-cabecalho">
            <div className="fx-identity">
              {contact.imageUrl ? (
                <img className="fx-foto" src={contact.imageUrl} alt="" width={72} height={72} />
              ) : (
                <Avatar nome={contact.nome} className="fx-foto" />
              )}
              <div className="fx-titulos">
                {/*
 * There the name is a `bds-input-editable` for whoever has claim 109 (`basicConfigurations`), and plain text otherwise. Here it's always text: renaming would write to the same place creation does, and that edit's Server Action doesn't exist yet.
 */}
                <h1 className="fx-nome">{contact.nome}</h1>
                <p className="fx-id">Id: {contact.shortName ?? contact.id}</p>
              </div>
            </div>
            <p className="fx-criado">
              <span>Criado em</span> {byData(contact.criadoEm, fuso)}
            </p>
          </header>

          <hr className="fx-fio" />

          {/*
 * The order follows the template: extensions, channels, team, preferences, metrics — the grid positions them with `grid-area`. What Pipe doesn't have (store, per-contact team, per-contact count) is left empty.
 */}
          <div className="fx-grade">
            <CardExtensions extensions={[]} />
            <CardChannels
              ativos={contact.channelActive && contact.channelType ? [contact.channelType] : []}
              base={base}
            />
            <CardTeam members={[]} />
            <CardPreferences fuso={fuso} plano={shell.tenant.plano} />
            <CardMetrics metrics={null} base={base} />
          </div>
        </div>
      </main>
    </div>
  );
}



/** O `moment(created).format('L')` deles, no fuso da conta: `13/09/2026`. */
function byData(instante: string | null, fuso: string): string {
  if (!instante) return '—';
  return new Date(instante).toLocaleDateString('pt-BR', {
    timeZone: fuso,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
