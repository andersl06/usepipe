import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { IconePortal } from '../../../componentes/icones-portal';
import { carregarCascaDoPortal } from '../../../lib/portal';
import { CascoDeCriacao, PassoDoNome } from '../casco';
import { criarFluxo } from './acoes';
import { ROTULOS, RECADOS } from './regras';
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
 * Aqui os dois passos são a MESMA rota, separados por `?passo=nome` — o mesmo
 * arranjo do roteador, pelo mesmo motivo: sem estado de cliente, dois passos
 * são duas renderizações.
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
 * Ou seja: "Construir do zero" cai no passo do nome (é o caminho que copiamos
 * inteiro), e "Usar template" desvia antes para `auth.application.create.test`
 * — uma tela de apresentação do modelo pré-configurado, com seis atrações
 * listadas e um chat de verdade rodando ao lado para a pessoa experimentar
 * antes de escolher. Essa tela não existe aqui, e o modelo que ela aplica
 * (`MarketplaceTemplatesService.processTemplate`, com horário de atendimento,
 * transbordo, avaliação e encerramento por inatividade) também não. O cartão
 * fica no lugar, apagado, com o selo "em breve" — a fileira não encolhe e quem
 * procura descobre que vem aí.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Criar fluxo · Pipe',
  description: 'Escolha como começar seu fluxo.',
};

export default async function PaginaCriarFluxo({
  searchParams,
}: {
  searchParams: Promise<{ passo?: string; erro?: string; nome?: string }>;
}) {
  const [casca, parametros] = await Promise.all([carregarCascaDoPortal(), searchParams]);

  /* `canCreateChatbot` deles é conferido no `$onInit` do controlador, ANTES de
     desenhar qualquer passo: quem não pode cai em `$state.go(getReturnState())`,
     que é a lista de contatos. Aqui, `/portal`. */
  if (!casca.podeCriar) redirect('/portal');

  return (
    <CascoDeCriacao>
      {parametros.passo === 'nome' ? (
        <PassoDoNome
          acao={criarFluxo}
          voltarPara="/criar/fluxo"
          rotulos={ROTULOS}
          tituloDoErro={RECADOS.titulo}
          erro={parametros.erro}
          nome={parametros.nome}
        />
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
        {/* `selectTemplate('blip_deskCustomerService')` → `^.test`, a tela de
            apresentação do modelo que não temos. Fica apagado, com o selo. O
            `bds-chip-tag color="success"` da origem — "Ideal para começar" —
            continua onde estava, meio a meio sobre a borda de cima: ele é o
            que faz a pessoa olhar primeiro para este cartão. */}
        <div className="cf-cartao pt-obra" aria-disabled="true" title="Em desenvolvimento">
          <span className="cf-selo">{ROTULOS.selo}</span>
          {/* `bds-icon name="integration" size="brand"`. O nosso `loja` é o
              desenho `plugin` do mesmo conjunto — a tomada que encaixa. */}
          <IconePortal nome="loja" tamanho={48} />
          <h3>
            {ROTULOS.usarTemplate}
            <span className="pt-obra-selo">em breve</span>
          </h3>
          <p>{ROTULOS.usarTemplateDescricao}</p>
        </div>

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
