import { useState } from 'react';
import { Ilustracao } from '@pipe/ui';

/**
 * Growth › Anúncios (Beta) — `growth/adsbuying` na origem. Refeito por foto
 * (dono reclamou que a primeira versão "ficou totalmente diferente"): a
 * origem não abre no clone de 8790 (o MFE `ads-buying` fica com a tela em
 * branco — mock sem conta de Marketing API) nem o HTML capturado renderiza
 * com CSS fora do domínio da Blip, então a régua aqui é o DOM renderizado
 * salvo em `referencias-blip/canais/roteador/roteador-anuncios__pagina.html`
 * (medido: `bds-paper` centralizado, `container xxs=8`, `margin: y-9`,
 * fileira `justify-content: space-between; align-items: center` de até
 * 625px — ilustração à esquerda, texto à direita, botão alinhado à direita
 * com `padding-top: 30px`) — não um cartão vertical centrado como antes.
 *
 * Título e texto batem com o que está na origem (`typo-account-connection-title`
 * e o parágrafo logo abaixo). O ícone é NOSSO: a origem usa
 * `bds-illustration name="notification-1"`, aqui é `Ilustracao nome="vazio"`
 * do design system do Pipe — mesma função (ilustração de estado inicial), sem
 * copiar o desenho deles.
 *
 * O Pipe não tem conta de Marketing API nem OAuth com o Facebook — nada disso
 * existe ainda. Em vez de simular a conexão (ou inventar um contrato que a
 * `api` não tem), o botão abre o mesmo aviso controlado de
 * `configuracoes/api/tela.tsx`: diz que a integração não está disponível, sem
 * fingir um clique que "funciona". TODO: quando existir a chave de Marketing
 * API do Pipe, trocar o aviso por `lib/growth.ts#conectarFacebook` de verdade.
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
            <div className="an-ilustracao">
              <Ilustracao nome="vazio" tamanho={140} />
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
