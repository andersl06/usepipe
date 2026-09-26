import { useState } from 'react';
import { Illustration } from '@pipe/ui';

/**
 * Growth › Anúncios (Beta) — `growth/adsbuying` in the origin. Rebuilt from a photo (the owner complained the first version "came out totally different"): the origin doesn't open in the 8790 clone (the `ads-buying` MFE shows a blank screen — a mock with no Marketing API account) and the captured HTML doesn't render outside Blip's domain, so the ruler here is the rendered DOM saved at `referencias-blip/canais/roteador/roteador-anuncios__pagina.html` (measured: centered `bds-paper`, `container xxs=8`, `margin: y-9`, a `justify-content: space-between; align-items: center` row up to 625px — illustration on the left, text on the right, button right-aligned with `padding-top: 30px`) — not a centered vertical card like before.
 *
 * Title and copy match the origin (`typo-account-connection-title` and the paragraph right below). The icon is OURS: the origin uses `bds-illustration name="notification-1"`, here it's `Ilustracao nome="vazio"` from Pipe's design system — same role (initial-state illustration), without copying their artwork.
 *
 * Pipe has no Marketing API account and no Facebook OAuth — none of that exists yet. Instead of simulating the connection (or inventing a contract the `api` doesn't have), the button opens the same controlled notice from `configuracoes/api/tela.tsx`: it says the integration isn't available, without faking a click that "works". TODO: once Pipe's Marketing API key exists, replace the notice with the real `lib/growth.ts#conectarFacebook`.
 */
export default function PageAds() {
  const [aviso, setAviso] = useState('');

  return (
    <div className="ck-pagina">
      <div className="ck-espaco" />
      <div className="ck-linha">
        <div className="ck-container">
          <div className="ck-col-8 ck-titulo-linha">
            <h1 className="ck-titulo">Anúncios</h1>
          </div>
        </div>
      </div>
      <div className="ck-espaco" />
      <div className="ck-container">
        <div className="ck-col-12">
          <div className="ck-papel an-conexao">
            <div className="an-ilustracao">
              <Illustration nome="vazio" tamanho={140} />
            </div>
            <div className="an-corpo">
              <h2 className="an-titulo">
                Conecte sua conta ao Facebook para começar a criar anúncios
              </h2>
              <p className="an-texto">
                Te redirecionaremos para a página de conexão com o Facebook Ads. Use uma conta com
                permissão de administrador da página da sua empresa e conceda acesso a todas as
                empresas e páginas, atuais e futuras, durante o processo de autorização.
              </p>
              <div className="an-acoes">
                <button
                  type="button"
                  className="an-botao"
                  onClick={() =>
                    setAviso('A conexão com o Facebook Ads ainda não está disponível no Pipe.')
                  }
                >
                  Conectar à API de Marketing
                </button>
              </div>
              {aviso ? (
                <p className="gr-aviso" role="alert">
                  {aviso}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
