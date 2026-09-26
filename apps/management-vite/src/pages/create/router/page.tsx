import Link from '../../../components/link';
import { IconeManagement } from '../../../components/icones-management';
import { IconePortal } from '../../../components/icones-portal';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { portalUseShell } from '../../../lib/shell';
import { CreationCasco, PassoDoNome } from '../casco';
import { createRouter } from './actions';
import { RECADOS, ROTULOS } from './regras';
import '../create.css';
import './create-router.css';

/**
 * Create router — a copy of their portal's `auth.application.create.router` flow,
 * read from the `portal.js` bundle (`25.204.0-v0.43.1`).
 *
 * ═══ THE FLOW HAS TWO STEPS, AND ONLY TWO ═══
 *
 * In the source these are two `ui-router` states under the same `<form>`:
 *
 *   `auth.application.create.router` → `/application/create/router`
 *     The invitation. Overline "Criar roteador", an image on the left, and on the
 *     right the title "Como funciona o roteador", the description, the "Quero
 *     saber mais" link, and ONE button. The button calls `selectTemplate('master')`,
 *     which stores the template and does `$state.go('^.name', 'master')`.
 *
 *   `auth.application.create.name` → `/application/create/name/master`
 *     The name. Same overline, title "Dê um nome ao seu roteador", the image
 *     picker, the name field with a counter, and two buttons: "Voltar" and
 *     "Criar roteador" (`type="submit"`).
 *
 * Here the two steps are the SAME route, separated by `?passo=nome`. It's a Server
 * Component: two steps with no client state are two renders, and the first step's
 * button is a link, just as their `ui-sref` is a link.
 *
 * ═══ WHAT THE ROUTER SKIPS, AND THE FLOW DOESN'T ═══
 *
 * `selectTemplate('master')` goes DIRECTLY to the name step. The sibling screen,
 * `/criar/fluxo`, first enters the marketplace
 * (`auth.application.create.marketplace`) to choose a template. It's the only
 * difference in STEPS between the two.
 *
 * The shell and the name step, being the same for both, live in `../casco.tsx` —
 * in the source they're literally the same template.
 */
/*
 * Empty = item not rendered, the same rule as the portal's `URL_AJUDA`: a link to
 * a page that doesn't exist yet is worse than one invitation fewer. In the source
 * it's `createApplication.router.learnMoreUrl`, an article from their help center.
 */
const URL_SABER_MAIS = (import.meta.env['VITE_PIPE_AJUDA_ROTEADOR_URL'] as string | undefined) ?? '';

export function PageCreateRouter() {
  const shell = portalUseShell();
  const { passo } = useParams();
  const [search] = useSearchParams();
  const parametros = {
    erro: search.get('erro') ?? undefined,
    nome: search.get('nome') ?? undefined,
  };

  /*
   * Their `canCreateChatbot` is checked in the controller's `$onInit`, BEFORE
   * rendering any step: whoever can't do it falls into
   * `$state.go(getReturnState())`, which is the contact list. Here, `/portal`.
   */
  if (!shell.canCreate) return <Navigate to="/portal" replace />;

  return (
    <CreationCasco>
      {passo === 'name' ? (
        <PassoDoNome
          acao={createRouter}
          voltarPara="/create/router"
          rotulos={ROTULOS}
          errorTitulo={RECADOS.titulo}
          error={parametros.erro}
          nome={parametros.nome}
        />
      ) : (
        <InvitationPasso />
      )}
    </CreationCasco>
  );
}

/* ================================================== passo 1: o convite */

/**
 * `#create-application-router-step`.
 *
 * Not a `<form>`: in the source the `<form>` belongs to the shell and wraps both
 * steps, but this one's only control is a button that changes state. Here it's a
 * link, and a form with no field and no submission would be chrome for its own
 * sake.
 *
 * Two-column row with a 2.5rem gap, 52.5rem total: the image on the left (40% of
 * the width, at most 18.75rem) and the text on the right (at most 27.5rem). The
 * button closes off the right column — it isn't centered on the screen.
 */
function InvitationPasso() {
  return (
    <div className="cr-forma">
      {/*
 * `.tagline-title-container`: column, 1rem gap, centered. The overline is the SAME
 * text as the button that brought the person here
 * (`createApplication.taglineRouter`) — it's what tells them, in both steps, that
 * what's being created is a router and not a flow.
 */}
      <div className="cr-titulos">
        <h4 className="cr-tagline">{ROTULOS.tagline}</h4>
      </div>

      <div className="cr-invitation">
        {/*
 * There it's `<img src="/assets/img/templates/router.svg">`, a drawing of the
 * concept. We don't have a router illustration (the four from `@pipe/ui` are empty
 * states), so the spot is filled by the `roteador` icon — the SAME artwork as the
 * button that brought the person here and the card label on the portal, enlarged.
 * It's in the report.
 */}
        <div className="cr-invitation-illustration" aria-hidden="true">
          <IconePortal nome="roteador" tamanho={128} />
        </div>

        <div className="cr-invitation-text">
          <h3>{ROTULOS.comoFunciona}</h3>
          <p>{ROTULOS.descricao}</p>

          {URL_SABER_MAIS ? (
            <a className="cr-saber-mais" href={URL_SABER_MAIS} target="_blank" rel="noreferrer">
              {/*
 * `bds-icon name="external-file"` in the source. `icones-portal.tsx` has no
 * matching artwork; `externo` from `icones-gestao.tsx` is the same gesture — the
 * sheet with the arrow pointing out.
 */}
              <IconeManagement nome="externo" tamanho={16} />
              {ROTULOS.saberMais}
            </a>
          ) : null}

          {/*
 * Their `<bds-button ng-click="$ctrl.selectTemplate('master')">`, with the tagline
 * text. Here it's a link because the next step is another render, not another
 * state in the browser's memory.
 */}
          <Link className="btn primario cr-botao" href="/create/router/name">
            {ROTULOS.tagline}
          </Link>
        </div>
      </div>
    </div>
  );
}
