import { Avatar } from '@pipe/ui';
import { useSair, useTrocarDeConta, type CascaDoPortal } from '../lib/casca';
import { Link } from './link';
import { IconePortal, type NomeDeIconePortal } from './icones-portal';

/**
 * A barra escura do portal — a `main-navbar` deles.
 *
 * Mora aqui, e não dentro de `app/portal/page.tsx`, porque na origem ela
 * continua em toda tela pendurada no portal: as novidades, a loja, a criação de
 * roteador. Só o miolo troca.
 *
 * Cada peça está comentada no ponto em que é aplicada, com o nome que ela tem
 * no DOM da origem. A régua é `docs/pesquisa/blip-portal-contrato.md`.
 */

/** O e-mail do suporte, o único destino de fora que já existe hoje. */
const EMAIL_SUPORTE = 'suporte@usepipe.ai';

export function BarraDoPortal({ dados }: { dados: CascaDoPortal }) {
  const trocarDeConta = useTrocarDeConta();
  const sair = useSair();
  /* A lista do menu traz as OUTRAS contas, não todas: no DOM da origem, quem
     está em `supernova` vê três itens e nenhum deles é `supernova`. */
  const outras = dados.contas.filter((c) => !c.emVigor);

  return (
    <header className="g-barra g-barra-sup pt-barra">
      {/* O seletor de conta. Na tela deles ele é o primeiro gesto do dia: diz
          em qual contrato a pessoa está e abre a lista dos outros — lá trocar é
          ir para outro subdomínio; aqui é trocar a sessão, que a `api` emite de
          novo para a conta escolhida.

          Uma pessoa com uma conta só vê o próprio nome e nada mais: a lista de
          um item é ruído, e o item seria ela mesma. */}
      <details className="g-menu pt-conta">
        {/* O `menu-contract` deles, peça por peça: o `business` dentro de um
            círculo claro (`icon-contract-white`), o nome em 16 negrito e o tipo
            de conta em 12 embaixo (`pl3`), e a seta `arrow-down` num bloco
            PRÓPRIO, fora do `group-buttom-contract`. */}
        <summary>
          <span className="pt-conta-icone">
            <IconePortal nome="contrato" tamanho={24} />
          </span>
          <span className="pt-conta-texto">
            <b>{dados.tenant.nome}</b>
            <span className="pt-plano">{dados.tenant.plano}</span>
          </span>
          <span className="pt-conta-seta">
            <IconePortal nome="baixo" tamanho={24} />
          </span>
        </summary>
        <div className="g-painel pt-conta-menu">
          {/* O PRIMEIRO item do menu deles é o "Painel do contrato" — com esse
              nome, e levando ao painel do CONTRATO, que é outra tela que não
              "Minha conta" (o cadastro da pessoa). Apontava para o lugar errado.
              Com o nome
              da conta em vigor em 10px embaixo (`organization-panel-options`).
              A conta em vigor NÃO aparece na lista abaixo: ela já é o título
              do botão que abriu este menu. */}
          <Link className="pt-painel" href="/contrato">
            <IconePortal nome="painel" tamanho={24} />
            <span>
              Painel do contrato
              <span className="pt-painel-conta">{dados.tenant.nome}</span>
            </span>
          </Link>

          {outras.length > 0 ? (
            <div className="pt-contas">
              {/* Cada item é o `tenant-profile` deles: ícone de PRÉDIO quando é
                  contrato e de BALÃO quando é a conta pessoal, o nome em 16 e,
                  embaixo, em 12, o tipo de conta (contrato) ou o endereço
                  (pessoal — é onde eles põem `beagleaz.blip.ai`). */}
              {outras.map((conta) => (
                <button
                  key={conta.tenantId}
                  type="button"
                  disabled={trocarDeConta.isPending}
                  onClick={() => trocarDeConta.mutate(conta.tenantId)}
                >
                  {/* `balao` é o `message-ballon` deles, tal e qual. No lugar
                      do `business` vai o `painel`, que é o que mais lembra uma
                      fachada no nosso jogo de ícones — ícone novo no pacote
                      compartilhado por causa de uma tela não se paga. */}
                  <IconePortal nome={conta.pessoal ? 'balao' : 'contrato'} tamanho={24} />
                  <span>
                    {conta.nome}
                    {conta.pessoal ? (
                      <span className="pt-conta-tipo">{conta.slug}.usepipe.ai</span>
                    ) : (
                      <span className="pt-conta-tipo">{conta.plano}</span>
                    )}
                    {conta.onboardingConcluido ? null : <span className="g-tipo">em cadastro</span>}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </details>

      <div className="pt-divisoria" />

      {/* A `nav-items` deles tem exatamente dois itens — "Home" (esta tela,
          com `main-navbar__active-link`) e "Blip Store" — e NADA mais: nem
          "Atendimento", nem "Canais", nem atalho para o Desk. Esses são do
          contexto de UM contato, depois que se entra nele.

          Aqui fica UM: "Início". A loja não existe ainda, e o Desk não entra
          no lugar dela — a barra da origem não tem esse atalho, e inventá-lo
          era o que deixava a nossa barra diferente. */}
      <nav className="pt-links" aria-label="Seções">
        <Link href="/portal" aria-current="page">
          Início
        </Link>
        {/* O segundo item da `nav-items` deles é a "Blip Store". A nossa loja
            ainda não existe — o item fica no lugar dele, apagado e com o aviso,
            para a barra não encolher e para quem espera a loja saber que ela
            está a caminho. */}
        <span className="pt-links-obra" aria-disabled="true" title="Em desenvolvimento">
          Pipe Store
          <span className="pt-obra-selo">em breve</span>
        </span>
      </nav>

      {/* A marca ocupa o bloco central da barra, fora do fluxo, para que o
          seletor de conta possa crescer sem empurrá-la do centro.

          O lockup entra como MÁSCARA e não como `<img>`: o arquivo é tinta
          escura com o traço moss, desenhado para fundo claro, e sobre a barra
          preta ele some. A máscara o pinta com a tinta da barra — que é o que
          a marca deles faz aqui também, num tom só. */}
      <Link className="pt-marca" href="/portal" aria-label="Pipe">
        <span className="pt-lockup" role="img" aria-label="Pipe" />
      </Link>

      <div className="pt-barra-fim">
        {/* O menu do "?" deles é uma lista de DESTINOS — Blip Help, Academy,
            Community, Support —, não um texto explicativo. Os nossos são os
            dois sites de fora (ajuda e comunidade) e o suporte; cada um só
            aparece quando o endereço existe. A explicação do que é fluxo e
            roteador ficou onde ela serve: no cartão de ação da fileira. */}
        <details className="g-menu">
          <summary className="g-iconbtn" title="Ajuda" aria-label="Ajuda">
            <IconePortal nome="ajuda" tamanho={24} />
          </summary>
          {/* O menu do "?" deles tem quatro destinos (Help, Academy, Community,
              Support). Hoje temos DOIS: o suporte, que existe, e a comunidade,
              que está sendo feita — e esta entra apagada e piscando, para quem
              procurar por ela saber que vem aí em vez de achar que sumiu. */}
          <div className="g-painel pt-menu">
            <a href={`mailto:${EMAIL_SUPORTE}`}>
              <IconePortal nome="suporte" tamanho={20} />
              Pipe Suporte
            </a>
            <ItemEmObra icone="comunidade" rotulo="Pipe Comunidade" />
          </div>
        </details>

        {/* O sino. Na origem é o `notificationsCenter`, entre o "?" e a
            divisória, e abre um painel que quase sempre diz a mesma frase.
            Não temos central de notificação ainda, e o sino que não conta nada
            ainda é parte da barra — sem ele a ponta direita fica com dois
            itens onde a deles tem três. */}
        <details className="g-menu">
          <summary className="g-iconbtn" title="Notificações" aria-label="Notificações">
            <IconePortal nome="sino" tamanho={24} />
          </summary>
          <div className="g-painel pt-sino">
            <p>Você não tem nenhuma notificação</p>
          </div>
        </details>

        <div className="pt-divisoria" />

        <details className="g-menu pt-eu-menu">
          {/* Na origem o avatar vem acompanhado de uma seta `arrow-down` à
              direita (`menu-user`), e é ela que diz que ali abre um menu. */}
          <summary
            className="g-iconbtn g-avatar"
            title={dados.usuario.nome}
            aria-label={`Conta de ${dados.usuario.nome}`}
          >
            {/* `<img>` cru e não `next/image`: a foto vem do provedor de
                identidade (Google, SSO), em domínio que muda por cliente, e
                cadastrar cada um em `images.remotePatterns` para servir 32px
                é trabalho que não paga. Mesma escolha da tela de entrada. */}
            {dados.usuario.avatarUrl ? (
              <img className="avatar pt-foto" src={dados.usuario.avatarUrl} alt="" />
            ) : (
              <Avatar nome={dados.usuario.nome} />
            )}
            <IconePortal nome="baixo" tamanho={24} className="pt-seta" />
          </summary>
          <div className="g-painel pt-menu pt-eu">
            {/* O `bds-menu-exibition` deles: avatar à esquerda, o NOME em 16 e
                o e-mail em 10 embaixo. Depois dele vem uma régua, e cada item
                é separado por outra — o menu deles tem três réguas. */}
            <div className="eu-bloco">
              {dados.usuario.avatarUrl ? (
                <img className="avatar" src={dados.usuario.avatarUrl} alt="" />
              ) : (
                <Avatar nome={dados.usuario.nome} />
              )}
              <span className="eu-nomes">
                <b>{dados.usuario.nome}</b>
                <span>{dados.usuario.email}</span>
              </span>
            </div>
            {/* Os três itens do menu deles, nesta ordem e cada um com o seu
                ícone à esquerda: `user-default`, `settings-adjusments` e
                `logout`. "Minhas preferências" lá é tela à parte; aqui é a
                segunda aba de "Minha conta" (idioma e fuso), que é onde o mesmo
                par de campos vive. */}
            <Link href="/minha-conta">
              <IconePortal nome="pessoa" tamanho={20} />
              Minha conta
            </Link>
            <Link href="/minha-conta?aba=preferencias">
              <IconePortal nome="preferencias" tamanho={20} />
              Minhas preferências
            </Link>
            <form
              onSubmit={(evento) => {
                evento.preventDefault();
                void sair();
              }}
            >
              <button type="submit">
                <IconePortal nome="sair" tamanho={20} />
                Sair
              </button>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}

/**
 * Um destino que ainda está sendo feito.
 *
 * Não sai da tela e não vira link morto: fica no lugar, apagado, com o selo
 * piscando — quem procura a comunidade descobre que ela vem aí, e o menu
 * mantém os itens da origem em vez de encolher para um.
 */
function ItemEmObra({ icone, rotulo }: { icone: NomeDeIconePortal; rotulo: string }) {
  return (
    <span className="pt-obra" aria-disabled="true" title="Em desenvolvimento">
      <IconePortal nome={icone} tamanho={20} />
      {rotulo}
      <span className="pt-obra-selo">em breve</span>
    </span>
  );
}
