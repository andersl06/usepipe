import Link from '../../../componentes/link';
import { IconePortal } from '../../../componentes/icones-portal';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useCascaDoPortal } from '../../../lib/casca';
import { CascoDeCriacao, PassoDoNome } from '../casco';
import { criarFluxo } from './acoes';
import { ROTULOS, RECADOS, TEMPLATE_PADRAO } from './regras';
import '../criar.css';
import './criar-fluxo.css';

/**
 * Criar fluxo — cópia de `auth.application.create.marketplace` → `…create.name`
 * do portal deles, lido no bundle `portal.js` (`25.204.0-v0.43.1`).
 *
 * Até agora o botão primário da barra clara do portal apontava para cá e dava
 * 404. É a tela que faltava.
 *
 * ═══ A DIFERENÇA PARA O ROTEADOR É UM PASSO A MAIS ═══
 *
 * `selectTemplate('master')`, do roteador, vai DIRETO para o passo do nome. O
 * fluxo não: o botão do portal entra em `auth.application.create.marketplace`
 * (`/application/create/marketplace`, template do módulo 92466), a tela que
 * pergunta COMO começar. Só depois vem o nome — e o nome é o mesmo template das
 * duas telas, por isso ele mora em `../casco.tsx`.
 *
 *   passo 1  `…create.marketplace`  duas opções, lado a lado
 *   passo 2  `…create.name/{template}`  o nome, a foto, e o botão que cria
 *
 * Aqui os TRÊS passos são a MESMA rota, separados por `?passo=` — o mesmo
 * arranjo do roteador, pelo mesmo motivo: sem estado de cliente, cada passo é
 * uma renderização.
 *
 * ═══ O MARKETPLACE TEM DOIS CARTÕES, E SÓ ═══
 *
 * Não há busca, não há categoria, não há grade de modelos. O template inteiro
 * é `<div class="marketplace-step-options flex justify-center flex-wrap">` com
 * dois `<bds-paper class="option-card">`:
 *
 *   "Usar template"      → `selectTemplate('blip_deskCustomerService')`
 *   "Construir do zero"  → `selectTemplate('builder')`
 *
 * E os dois NÃO vão para o mesmo lugar. `selectTemplate` termina em:
 *
 *   if ('blip_deskCustomerService' === e) this.$state.go('^.test', …)
 *   else                                  this.$state.go('^.name', …)
 *
 * Ou seja: "Construir do zero" cai DIRETO no passo do nome, e "Usar template"
 * passa antes por `auth.application.create.test` (`?passo=template` aqui) — a
 * apresentação do modelo pré-configurado, com a descrição e as quatro
 * funcionalidades confirmadas na captura de 17/09/2026
 * (`referencias-blip/builder/criar-fluxo/`). O chat de teste ao vivo que a origem
 * roda ao lado (nome e status do próprio chatbot da conta) NÃO entra: é
 * simulação de estado de cliente, a mesma régua que já tirou o contador do
 * campo e a pré-visualização da foto em `../casco.tsx`.
 *
 * O que a apresentação PROMETE — `MarketplaceTemplatesService.processTemplate`
 * pré-configurando horário de atendimento, transbordo, avaliação e
 * verificação de atendentes — continua sem o nosso lado: ver TODO em
 * `acoes.ts`. "Escolher esse template" cria um fluxo em branco, como
 * "Construir do zero"; só o título do passo do nome muda.
 */
export function PaginaCriarFluxo() {
  const casca = useCascaDoPortal();
  const [busca] = useSearchParams();
  const parametros = {
    passo: busca.get('passo') ?? undefined,
    erro: busca.get('erro') ?? undefined,
    nome: busca.get('nome') ?? undefined,
    template: busca.get('template') ?? undefined,
  };
  const veioDoTemplate = parametros.template === TEMPLATE_PADRAO;

  /* `canCreateChatbot` deles é conferido no `$onInit` do controlador, ANTES de
     desenhar qualquer passo: quem não pode cai em `$state.go(getReturnState())`,
     que é a lista de contatos. Aqui, `/portal`. */
  if (!casca.podeCriar) return <Navigate to="/portal" replace />;

  return (
    <CascoDeCriacao>
      {parametros.passo === 'nome' ? (
        <PassoDoNome
          acao={criarFluxo}
          voltarPara={veioDoTemplate ? `/criar/fluxo?passo=template` : '/criar/fluxo'}
          rotulos={{
            ...ROTULOS,
            tituloDoNome: veioDoTemplate ? ROTULOS.tituloDoNomeComTemplate : ROTULOS.tituloDoNome,
          }}
          tituloDoErro={RECADOS.titulo}
          erro={parametros.erro}
          nome={parametros.nome}
          camposOcultos={veioDoTemplate ? { template: TEMPLATE_PADRAO } : undefined}
        />
      ) : parametros.passo === 'template' ? (
        <PassoDoTemplate />
      ) : (
        <PassoDoMarketplace />
      )}
    </CascoDeCriacao>
  );
}

/* ============================================== passo 1: o marketplace */

/**
 * `#create-application-marketplace-step`.
 *
 * Não é `<form>`: os dois controles do passo são cartões que mudam de estado, e
 * um formulário sem campo nem envio seria cromo. O da direita é link; o da
 * esquerda é um `<div>` porque não leva a lugar nenhum ainda.
 *
 * Fileira centrada que quebra (`flex justify-center flex-wrap`), 2.5rem de vão,
 * 3.5rem abaixo dos títulos, cada cartão com 20rem de largura.
 */
function PassoDoMarketplace() {
  return (
    <div className="cr-forma">
      {/* `.tagline-title-container`: coluna, vão de 1rem, centrada. Os DOIS
          `bds-typo` deste passo — sobretítulo `fs-20` e título `fs-32`. */}
      <div className="cr-titulos">
        <h4 className="cr-tagline">{ROTULOS.tagline}</h4>
        <h2 className="cr-titulo-nome">{ROTULOS.tituloDoMarketplace}</h2>
      </div>

      <div className="cf-opcoes">
        {/* `selectTemplate('blip_deskCustomerService')` → `^.test`, a
            apresentação do modelo (`PassoDoTemplate`, abaixo). O
            `bds-chip-tag color="success"` da origem — "Ideal para começar" —
            continua meio a meio sobre a borda de cima: ele é o que faz a
            pessoa olhar primeiro para este cartão. */}
        <Link className="cf-cartao" href="/criar/fluxo?passo=template">
          <span className="cf-selo-recomendado">{ROTULOS.selo}</span>
          {/* `bds-icon name="integration" size="brand"`. O nosso `loja` é o
              desenho `plugin` do mesmo conjunto — a tomada que encaixa. */}
          <IconePortal nome="loja" tamanho={48} />
          <h3>{ROTULOS.usarTemplate}</h3>
          <p>{ROTULOS.usarTemplateDescricao}</p>
        </Link>

        {/* `selectTemplate('builder')` → `^.name`. É o caminho inteiro que
            copiamos: daqui sai o `template = 'builder'`, que é o nosso
            `tipo = 'fluxo'`. */}
        <Link className="cf-cartao" href="/criar/fluxo?passo=nome">
          {/* `bds-icon name="file-empty-file" size="brand"` — a folha em
              branco. `icones-portal.tsx` não tem esse desenho; o `fluxo`
              (`builder-new-state`, o bloco vazio do construtor) é o mesmo
              gesto e é o MESMO ícone do botão que trouxe a pessoa até aqui. */}
          <IconePortal nome="fluxo" tamanho={48} />
          <h3>{ROTULOS.doZero}</h3>
          <p>{ROTULOS.doZeroDescricao}</p>
        </Link>
      </div>
    </div>
  );
}

/* ======================================== passo 2: a apresentação do template */

/** Um ícone do `icones-portal.tsx` para cada linha de `ROTULOS.funcionalidades`,
    na mesma ordem — relógio para horário, atendente para transbordo, cheque
    para avaliação, equipe para atendentes disponíveis. Sem correspondente
    exato na origem: lá cada linha tem o próprio ícone do catálogo deles, que
    não temos; a distinção visual entre as quatro é o que importa aqui. */
const ICONES_DAS_FUNCIONALIDADES = ['relogio', 'suporte', 'concluido', 'equipe'] as const;

/**
 * `#create-application-test-step` — `auth.application.create.test`.
 *
 * Não temos as medidas em pixel desta tela (só o passo 1, o marketplace, foi
 * capturado renderizado): a disposição abaixo reaproveita o mesmo palco
 * centrado dos outros passos (`.cr-forma` / `.cr-titulos` / `.cr-acoes`, de
 * `../criar.css`), com a descrição e a lista de funcionalidades em coluna.
 */
function PassoDoTemplate() {
  return (
    <div className="cr-forma">
      <div className="cr-titulos">
        <h4 className="cr-tagline">{ROTULOS.tagline}</h4>
        <h2 className="cr-titulo-nome">{ROTULOS.usarTemplate}</h2>
      </div>

      <div className="cf-apresentacao">
        <h3 className="cf-apresentacao-subtitulo">{ROTULOS.apresentacaoSubtitulo}</h3>
        <p>{ROTULOS.apresentacaoDescricao}</p>

        <ul className="cf-lista">
          {ROTULOS.funcionalidades.map((funcionalidade, indice) => (
            <li key={funcionalidade}>
              <IconePortal nome={ICONES_DAS_FUNCIONALIDADES[indice]!} tamanho={20} />
              {funcionalidade}
            </li>
          ))}
        </ul>

        <div className="cr-acoes">
          {/* Volta ao passo 1, como o `back()` deles guardado em `beforeNameStep`. */}
          <Link className="btn cr-botao" href="/criar/fluxo">
            <IconePortal nome="esquerda" tamanho={20} />
            {ROTULOS.voltar}
          </Link>
          <Link
            className="btn primario cr-botao"
            href={`/criar/fluxo?passo=nome&template=${TEMPLATE_PADRAO}`}
          >
            {ROTULOS.escolherEsseTemplate}
          </Link>
        </div>
      </div>
    </div>
  );
}
