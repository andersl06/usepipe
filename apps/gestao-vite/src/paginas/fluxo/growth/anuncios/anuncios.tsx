import { useState } from 'react';
import { LogoPortal } from '../../../../componentes/icones-portal';

/**
 * Growth › Anúncios (Beta) — `growth/adsbuying` na origem (LEIA.md, rodada 3).
 * Tela de onboarding: sem conta do Facebook ligada, é um cartão único
 * "Conecte sua conta ao Facebook para começar a criar anúncios" com o botão
 * "Conectar à API de Marketing". A origem dispara direto uma chamada à Graph
 * API do Facebook ao clicar (`GET graph.facebook.com/.../me/accounts`).
 *
 * ponytail: o Pipe não tem conta de Marketing API nem OAuth com o Facebook —
 * nada disso existe ainda. Em vez de simular a conexão (ou inventar um
 * contrato que a `api` não tem), o botão aqui abre o mesmo aviso controlado
 * de `configuracoes/api/tela.tsx`: diz que a integração não está disponível,
 * sem fingir um clique que "funciona". TODO: quando existir a chave de
 * Marketing API do Pipe, trocar o aviso por `lib/growth.ts#conectarFacebook`
 * de verdade.
 */
export default function PaginaAnuncios() {
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
            <LogoPortal nome="meta" tamanho={64} />
            <h2 className="an-titulo">
              Conecte sua conta ao Facebook para começar a criar anúncios
            </h2>
            <p className="an-texto">
              Essa conexão pede permissão de administrador de página no Facebook e dá acesso a
              todas as páginas e contas de anúncio — atuais e futuras — vinculadas a ela.
            </p>
            <button
              type="button"
              className="an-botao"
              onClick={() =>
                setAviso('A conexão com o Facebook Ads ainda não está disponível no Pipe.')
              }
            >
              Conectar à API de Marketing
            </button>
            {aviso ? (
              <p className="gr-aviso" role="alert">
                {aviso}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
