import Link from '../../../componentes/link';
import { IconeGestao } from '../../../componentes/icones-gestao';
import { IconePortal } from '../../../componentes/icones-portal';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useCascaDoPortal } from '../../../lib/casca';
import { CascoDeCriacao, PassoDoNome } from '../casco';
import { criarRoteador } from './acoes';
import { RECADOS, ROTULOS } from './regras';
import '../criar.css';
import './criar-roteador.css';

/**
 * Criar roteador — cópia do fluxo `auth.application.create.router` do portal
 * deles, lido no bundle `portal.js` (`25.204.0-v0.43.1`).
 *
 * ═══ O FLUXO TEM DOIS PASSOS, E SÓ ═══
 *
 * Na origem são dois estados do `ui-router` sob o mesmo `<form>`:
 *
 *   `auth.application.create.router` → `/application/create/router`
 *     O convite. Sobretítulo "Criar roteador", uma imagem à esquerda, e à
 *     direita o título "Como funciona o roteador", a descrição, o link "Quero
 *     saber mais" e UM botão. O botão chama `selectTemplate('master')`, que
 *     guarda o template e faz `$state.go('^.name', 'master')`.
 *
 *   `auth.application.create.name` → `/application/create/name/master`
 *     O nome. Mesmo sobretítulo, título "Dê um nome ao seu roteador", o seletor
 *     de imagem, o campo de nome com contador, e dois botões: "Voltar" e
 *     "Criar roteador" (`type="submit"`).
 *
 * Aqui os dois passos são a MESMA rota, separados por `?passo=nome`. É Server
 * Component: dois passos sem estado de cliente são duas renderizações, e o
 * botão do primeiro passo é um link, como o `ui-sref` deles é um link.
 *
 * ═══ O QUE O ROTEADOR PULA, E O FLUXO NÃO ═══
 *
 * `selectTemplate('master')` sai DIRETO para o passo do nome. A tela irmã,
 * `/criar/fluxo`, entra antes no marketplace (`auth.application.create.marketplace`)
 * para escolher o modelo. É a única diferença de PASSOS entre as duas.
 *
 * O casco e o passo do nome, por serem os mesmos das duas, vivem em
 * `../casco.tsx` — na origem eles são literalmente o mesmo template.
 */
/* Vazio = item não desenhado, a mesma regra do `URL_AJUDA` do portal: link para
   página que ainda não existe é pior do que um convite a menos. Na origem é
   `createApplication.router.learnMoreUrl`, um artigo do help deles. */
const URL_SABER_MAIS = (import.meta.env['VITE_PIPE_AJUDA_ROTEADOR_URL'] as string | undefined) ?? '';

export function PaginaCriarRoteador() {
  const casca = useCascaDoPortal();
  const [busca] = useSearchParams();
  const parametros = {
    passo: busca.get('passo') ?? undefined,
    erro: busca.get('erro') ?? undefined,
    nome: busca.get('nome') ?? undefined,
  };

  /* `canCreateChatbot` deles é conferido no `$onInit` do controlador, ANTES de
     desenhar qualquer passo: quem não pode cai em `$state.go(getReturnState())`,
     que é a lista de contatos. Aqui, `/portal`. */
  if (!casca.podeCriar) return <Navigate to="/portal" replace />;

  return (
    <CascoDeCriacao>
      {parametros.passo === 'nome' ? (
        <PassoDoNome
          acao={criarRoteador}
          voltarPara="/criar/roteador"
          rotulos={ROTULOS}
          tituloDoErro={RECADOS.titulo}
          erro={parametros.erro}
          nome={parametros.nome}
        />
      ) : (
        <PassoDoConvite />
      )}
    </CascoDeCriacao>
  );
}

/* ================================================== passo 1: o convite */

/**
 * `#create-application-router-step`.
 *
 * Não é `<form>`: na origem o `<form>` é do casco e envolve os dois passos,
 * mas o único controle deste é um botão que muda de estado. Aqui ele é link, e
 * um formulário sem campo nem envio seria cromo.
 *
 * Fileira de duas colunas com 2.5rem de vão, 52.5rem no total: a imagem à
 * esquerda (40% da largura, no máximo 18.75rem) e o texto à direita (no máximo
 * 27.5rem). O botão fecha a coluna da direita — não é centrado na tela.
 */
function PassoDoConvite() {
  return (
    <div className="cr-forma">
      {/* `.tagline-title-container`: coluna, vão de 1rem, centrada. O
          sobretítulo é o MESMO texto do botão que trouxe a pessoa até aqui
          (`createApplication.taglineRouter`) — é ele que diz, nos dois passos,
          que o que está sendo criado é um roteador e não um fluxo. */}
      <div className="cr-titulos">
        <h4 className="cr-tagline">{ROTULOS.tagline}</h4>
      </div>

      <div className="cr-convite">
        {/* Lá é `<img src="/assets/img/templates/router.svg">`, um desenho do
            conceito. Não temos ilustração de roteador (as quatro do `@pipe/ui`
            são estados vazios), então o lugar é ocupado pelo ícone `roteador`
            — o MESMO desenho do botão que trouxe a pessoa e da etiqueta do
            cartão no portal, ampliado. Está no relatório. */}
        <div className="cr-convite-desenho" aria-hidden="true">
          <IconePortal nome="roteador" tamanho={128} />
        </div>

        <div className="cr-convite-texto">
          <h3>{ROTULOS.comoFunciona}</h3>
          <p>{ROTULOS.descricao}</p>

          {URL_SABER_MAIS ? (
            <a className="cr-saber-mais" href={URL_SABER_MAIS} target="_blank" rel="noreferrer">
              {/* `bds-icon name="external-file"` na origem. `icones-portal.tsx`
                  não tem esse desenho; `externo` do `icones-gestao.tsx` é o
                  mesmo gesto — a folha com a seta que sai. */}
              <IconeGestao nome="externo" tamanho={16} />
              {ROTULOS.saberMais}
            </a>
          ) : null}

          {/* O `<bds-button ng-click="$ctrl.selectTemplate('master')">` deles,
              com o texto da tagline. Aqui é link porque o passo seguinte é
              outra renderização, e não outro estado na memória do navegador. */}
          <Link className="btn primario cr-botao" href="/criar/roteador?passo=nome">
            {ROTULOS.tagline}
          </Link>
        </div>
      </div>
    </div>
  );
}
