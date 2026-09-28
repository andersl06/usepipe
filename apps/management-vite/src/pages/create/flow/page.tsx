import Link from '../../../components/link';
import { IconePortal } from '../../../components/icones-portal';
import { Navigate } from 'react-router-dom';
import { portalUseShell } from '../../../lib/shell';
import { APPLICATION, createPath, createNamePath } from '../../../lib/application-paths';
import { CreationShell } from '../casco';
import { ROTULOS, TEMPLATE_PADRAO } from './regras';
import '../create.css';
import './create-flow.css';

/** Which of the two routes mounted this page (D-52: the step lives in the path, not `?passo=`); the third step, the name, is `PageCreateName` — shared with the router. */
export type CreateFlowStep = 'marketplace' | 'test';

/**
 * Create flow — a copy of the portal's `auth.application.create.marketplace` → `…create.name`, read from the `portal.js` bundle (`25.204.0-v0.43.1`). Until now the portal's light bar primary button pointed here and returned a 404. This is the screen that was missing. ═══ THE DIFFERENCE FROM THE ROUTER IS ONE EXTRA STEP ═══ The router's `selectTemplate('master')` goes DIRECTLY to the name step. The flow doesn't: the portal's button enters `auth.application.create.marketplace` (`/application/create/marketplace`, module 92466's template), the screen that asks HOW to start. Only then comes the name — and the name is the same template for both screens, which is why it lives in `../casco.tsx`. step 1 `…create.marketplace` two options, side by side step 2 `…create.name/{template}` the name, the photo, and the create button Each step is its OWN route now (D-52), matching the Blip capture's three declared addresses (`/application/create/marketplace`, `/application/create/test` — confirmed absent as its own Blip URL, kept as our name; `/application/create/name/{template}`) — the same arrangement as before, just the step selector moved from `?passo=` to the path. ═══ THE MARKETPLACE HAS TWO CARDS, AND ONLY TWO ═══ There's no search, no category, no model grid. The whole template is `<div class="marketplace-step-options flex justify-center flex-wrap">` with two `<bds-paper class="option-card">`: "Usar template" → `selectTemplate('blip_deskCustomerService')` "Construir do zero" → `selectTemplate('builder')` And the two DON'T go to the same place. `selectTemplate` ends with: if ('blip_deskCustomerService' === e) this.$state.go('^.test', …) else this.$state.go('^.name', …) In other words: "Construir do zero" lands DIRECTLY on the name step, and "Usar template" passes first through `auth.application.create.test` — the pre-configured model's presentation, with the description and four features confirmed in the 09/17/2026 capture (`referencias-blip/builder/criar-fluxo/`). The live test chat the source runs alongside it (the account's own chatbot name and status) is NOT included: it's a simulation of client state, the same rule that already removed the field counter and the photo preview in `../casco.tsx`. What the presentation PROMISES — `MarketplaceTemplatesService.processTemplate` pre-configuring business hours, handoff, evaluation and agent-availability checks — still has no counterpart on our side: see the TODO in `acoes.ts`. "Escolher esse template" creates a blank flow, just like "Construir do zero"; only the name step's title changes.
 */
export function PageCreateFlow({ step }: { step: CreateFlowStep }) {
  const shell = portalUseShell();

  /*
   * Their `canCreateChatbot` is checked in the controller's `$onInit`, BEFORE drawing any step: whoever can't is sent to `$state.go(getReturnState())`, which is the contact list. Here, `/application`.
   */
  if (!shell.canCreate) return <Navigate to={APPLICATION} replace />;

  return <CreationShell>{step === 'test' ? <PassoDoTemplate /> : <PassoDoMarketplace />}</CreationShell>;
}

/* ============================================== passo 1: o marketplace */

/**
 * `#create-application-marketplace-step`. Not a `<form>`: the step's two controls are cards that change state, and a form with no field or submission would just be cosmetic. The one on the right is a link; the one on the left is a `<div>` because it doesn't lead anywhere yet. A centered row that wraps (`flex justify-center flex-wrap`), 2.5rem gap, 3.5rem below the titles, each card 20rem wide.
 */
function PassoDoMarketplace() {
  return (
    <div className="cr-forma">
      {/*
 * `.tagline-title-container`: a column, 1rem gap, centered. The TWO `bds-typo` in this step — `fs-20` subtitle and `fs-32` title.
 */}
      <div className="cr-titulos">
        <h4 className="cr-tagline">{ROTULOS.tagline}</h4>
        <h2 className="cr-titulo-nome">{ROTULOS.tituloDoMarketplace}</h2>
      </div>

      <div className="cf-options">
        {/*
 * `selectTemplate('blip_deskCustomerService')` → `^.test`, the model's presentation (`PassoDoTemplate`, below). The source's `bds-chip-tag color="success"` — "Ideal para começar" — stays half over the top border: it's what makes people look at this card first.
 */}
        <Link className="cf-card" href={createPath('test')}>
          <span className="cf-selo-recomendado">{ROTULOS.selo}</span>
          {/*
 * `bds-icon name="integration" size="brand"`. Our `loja` icon is the `plugin` design from the same set — the outlet that fits.
 */}
          <IconePortal nome="loja" tamanho={48} />
          <h3>{ROTULOS.usarTemplate}</h3>
          <p>{ROTULOS.usarTemplateDescricao}</p>
        </Link>

        {/*
 * `selectTemplate('builder')` → `^.name`. It's the whole path we copied: this is where `template = 'builder'` comes from, which is our `tipo = 'fluxo'`.
 */}
        <Link className="cf-card" href={createNamePath('builder')}>
          {/*
 * `bds-icon name="file-empty-file" size="brand"` — the blank sheet. `icones-portal.tsx` doesn't have that icon; `flow` (`builder-new-state`, the builder's empty block) is the same gesture and the SAME icon as the button that brought the person here.
 */}
          <IconePortal nome="fluxo" tamanho={48} />
          <h3>{ROTULOS.doZero}</h3>
          <p>{ROTULOS.doZeroDescricao}</p>
        </Link>
      </div>
    </div>
  );
}

/* ======================================== step 2: the template presentation */

/**
 * An icon from `icones-portal.tsx` for each line of `ROTULOS.funcionalidades`, in the same order — a clock for hours, an agent for handoff, a checkmark for evaluation, a team for available agents. No exact match in the source: there each line has its own catalog icon, which we don't have; the visual distinction between the four is what matters here.
 */
const ICONS_OF_FEATURES = ['relogio', 'suporte', 'concluido', 'equipe'] as const;

/**
 * `#create-application-test-step` — `auth.application.create.test`. We don't have this screen's pixel measurements (only step 1, the marketplace, was captured rendered): the layout below reuses the same centered stage as the other steps (`.cr-forma` / `.cr-titulos` / `.cr-acoes`, from `../criar.css`), with the description and the feature list in a column.
 */
function PassoDoTemplate() {
  return (
    <div className="cr-forma">
      <div className="cr-titulos">
        <h4 className="cr-tagline">{ROTULOS.tagline}</h4>
        <h2 className="cr-titulo-nome">{ROTULOS.usarTemplate}</h2>
      </div>

      <div className="cf-presentation">
        <h3 className="cf-presentation-subtitle">{ROTULOS.apresentacaoSubtitulo}</h3>
        <p>{ROTULOS.apresentacaoDescricao}</p>

        <ul className="cf-lista">
          {ROTULOS.funcionalidades.map((feature, indice) => (
            <li key={feature}>
              <IconePortal nome={ICONS_OF_FEATURES[indice]!} tamanho={20} />
              {feature}
            </li>
          ))}
        </ul>

        <div className="cr-actions">
          {/* Volta ao passo 1, como o `back()` deles guardado em `beforeNameStep`. */}
          <Link className="btn cr-botao" href={createPath('marketplace')}>
            <IconePortal nome="esquerda" tamanho={20} />
            {ROTULOS.voltar}
          </Link>
          <Link className="btn primario cr-botao" href={createNamePath(TEMPLATE_PADRAO)}>
            {ROTULOS.escolherEsseTemplate}
          </Link>
        </div>
      </div>
    </div>
  );
}
