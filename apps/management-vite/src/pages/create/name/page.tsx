import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { portalUseShell } from '../../../lib/shell';
import { APPLICATION, createPath } from '../../../lib/application-paths';
import { CreationShell, PassoDoNome } from '../casco';
import { createFlow } from '../flow/actions';
import { ROTULOS as ROTULOS_FLOW, RECADOS as RECADOS_FLOW, TEMPLATE_PADRAO } from '../flow/regras';
import { createRouter } from '../router/actions';
import { RECADOS as RECADOS_ROUTER, ROTULOS as ROTULOS_ROUTER } from '../router/regras';

/**
 * `/application/create/name/:template` — the name step, the one piece the flow and router
 * wizards share (D-52; `casco.tsx`: "in the source they're literally the same template"). The
 * Blip capture confirms the address (`/application/create/name/index.html`,
 * `INDICE.md:16`); `:template` decides who's creating what — `master` is the router
 * (`create/router/page.tsx`'s `selectTemplate('master')`), anything else is the flow, with
 * `blip_deskCustomerService` (`TEMPLATE_PADRAO`) meaning "arrived from the pre-configured model"
 * and `builder` meaning "from scratch". Anything else is an unknown template — same as the
 * marketplace's own two cards, there is no third choice — and redirects back to the marketplace.
 */
const KNOWN_TEMPLATES: ReadonlySet<string> = new Set(['master', 'builder', TEMPLATE_PADRAO]);

export function PageCreateName() {
  const shell = portalUseShell();
  const { template = '' } = useParams();
  const [search] = useSearchParams();
  const erro = search.get('erro') ?? undefined;
  const nome = search.get('nome') ?? undefined;

  if (!shell.canCreate) return <Navigate to={APPLICATION} replace />;
  if (!KNOWN_TEMPLATES.has(template)) return <Navigate to={createPath('marketplace')} replace />;

  if (template === 'master') {
    return (
      <CreationShell>
        <PassoDoNome
          acao={createRouter}
          voltarPara={createPath('router')}
          rotulos={ROTULOS_ROUTER}
          errorTitle={RECADOS_ROUTER.titulo}
          error={erro}
          nome={nome}
        />
      </CreationShell>
    );
  }

  const veioDoTemplate = template === TEMPLATE_PADRAO;
  return (
    <CreationShell>
      <PassoDoNome
        acao={createFlow}
        voltarPara={veioDoTemplate ? createPath('test') : createPath('marketplace')}
        rotulos={{
          ...ROTULOS_FLOW,
          tituloDoNome: veioDoTemplate ? ROTULOS_FLOW.tituloDoNomeComTemplate : ROTULOS_FLOW.tituloDoNome,
        }}
        errorTitle={RECADOS_FLOW.titulo}
        error={erro}
        nome={nome}
        camposOcultos={veioDoTemplate ? { template: TEMPLATE_PADRAO } : undefined}
      />
    </CreationShell>
  );
}
