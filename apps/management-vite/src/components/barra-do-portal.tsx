import { Avatar } from '@pipe/ui';
import { useSair, accountUseSwitch, type PortalShell } from '../lib/shell';
import { APPLICATION, tenantPath } from '../lib/application-paths';
import { Link } from './link';
import { IconePortal, type NomeDeIconePortal } from '@pipe/ui/icones-portal';

/**
 * Portal dark bar mirrors reference `main-navbar`. Keep it here, outside `app/portal/page.tsx`, because it persists across all Portal child screens, including news, store, and router creation; only the body changes. Each element is documented at its use site with its source DOM name; see `referencias-blip/pesquisa/blip-portal-contrato.md`.
 */

/** Support email is the only external destination currently available. */
const EMAIL_SUPORTE = 'suporte@usepipe.ai';

export function BarraDoPortal({ data }: { data: PortalShell }) {
  const accountSwitch = accountUseSwitch();
  const sair = useSair();
  /*
   * Show only OTHER accounts: in the source DOM, a user on `supernova` sees three items and none is `supernova`.
   */
  const outras = data.accounts.filter((c) => !c.inForce);

  return (
    <header className="g-barra g-barra-sup pt-barra">
      {/*
 * Wrap account, divider, and links as one left column in the three-column `.g-barra` grid (`1fr auto 1fr`), as `estrutura-gestao.tsx` does. Previously `position: absolute` and `z-index` let the centered brand cover `Início`/`Pipe Store` when account names grew. Give the left column `overflow: hidden` to truncate without entering the center column.
 */}
      <div className="pt-barra-inicio">
        {/*
 * The account selector names the current contract and lists other accounts, the first daily action in the reference. There, switching navigates to another subdomain; here it switches sessions when the `api` reissues the cookie for the selected account. With one account, show only its name: a one-item menu would repeat the current account.
 */}
        <details className="g-menu pt-account">
        {/*
 * Reference `menu-contract`: `business` in a light `icon-contract-white` circle, bold 16px name, 12px account type below (`pl3`), and `arrow-down` in a separate block outside `group-buttom-contract`.
 */}
        <summary>
          <span className="pt-account-icon">
            <IconePortal nome="contrato" tamanho={24} />
          </span>
          <span className="pt-account-text">
            <b>{data.tenant.nome}</b>
            <span className="pt-plano">{data.tenant.plano}</span>
          </span>
          <span className="pt-account-arrow">
            <IconePortal nome="baixo" tamanho={24} />
          </span>
        </summary>
        <div className="g-panel pt-account-menu">
          {/*
 * Reference menu's first destination is `Painel do contrato`, the contract panel, distinct from personal `Minha conta`; the previous link pointed to the wrong screen. Put the active account name beneath at 10px (`organization-panel-options`). Exclude the active account from the list below because it already titles the opener.
 */}
          <Link className="pt-panel" href={tenantPath('tenant')}>
            <IconePortal nome="painel" tamanho={24} />
            <span>
              Painel do contrato
              <span className="pt-panel-account">{data.tenant.nome}</span>
            </span>
          </Link>

          {outras.length > 0 ? (
            <div className="pt-accounts">
              {/*
 * Each reference `tenant-profile` item has a building icon for a contract or speech balloon for a personal account, a 16px name, then a 12px account type or personal address (source example `beagleaz.blip.ai`).
 */}
              {outras.map((account) => (
                <button
                  key={account.tenantId}
                  type="button"
                  disabled={accountSwitch.isPending}
                  onClick={() => accountSwitch.mutate(account.tenantId)}
                >
                  {/*
 * Local `balao` corresponds to source `message-ballon`; for `business` use local `panel`, the closest facade icon. Adding a shared-package icon for this single screen is unwarranted.
 */}
                  <IconePortal nome={account.personal ? 'balao' : 'contrato'} tamanho={24} />
                  <span>
                    {account.name}
                    {account.personal ? (
                      <span className="pt-account-type">{account.slug}.usepipe.ai</span>
                    ) : (
                      <span className="pt-account-type">{account.plan}</span>
                    )}
                    {account.onboardingCompleted ? null : <span className="g-tipo">em cadastro</span>}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </details>

      <div className="pt-divisoria" />

      {/*
 * Reference `nav-items` has only Home in all 22 captured screens (`referencias-blip/portal/dom/*.html`); there is no Blip Store or second item. Attendance, Channels, and Desk belong to an individual contact after entry. A store item here contradicted measured DOM rather than filling a documented gap.
 */}
      <nav className="pt-links" aria-label="Seções">
        <Link href={APPLICATION} aria-current="page">
          Início
        </Link>
      </nav>
      </div>

      {/*
 * Keep the brand in its own central `auto` grid column between the `1fr` columns `.pt-barra-inicio` and `.pt-barra-fim`, so a long account name cannot overlap it. Use a mask rather than `<img>`: the dark asset with moss stroke was designed for a light background and disappears on this black bar. The mask paints it with the bar's single-color ink, as in the reference.
 */}
      <Link className="pt-marca" href={APPLICATION} aria-label="Pipe">
        <span className="pt-lockup" role="img" aria-label="Pipe" />
      </Link>

      <div className="pt-barra-fim">
        {/*
 * The reference help `?` menu lists destinations, not explanatory prose: Blip Help, Academy, Community, Support. Our menu offers external help/community and support only when their URLs exist. Flow/router explanation belongs on the action card.
 */}
        <details className="g-menu">
          <summary className="g-iconbtn" title="Ajuda" aria-label="Ajuda">
            <IconePortal nome="ajuda" tamanho={24} />
          </summary>
          {/*
 * The reference `?` menu has Help, Academy, Community, Support. We currently have support and an upcoming community; show the latter dimmed with a blinking badge so the destination remains discoverable without a dead link.
 */}
          <div className="g-panel pt-menu">
            <a href={`mailto:${EMAIL_SUPORTE}`}>
              <IconePortal nome="suporte" tamanho={20} />
              Pipe Suporte
            </a>
            <ItemEmObra icone="comunidade" rotulo="Pipe Comunidade" />
          </div>
        </details>

        {/*
 * The reference bell is `notificationsCenter` between help and the divider, opening a mostly repeated message. We do not yet have a notification center, but retain the bell so the right bar matches the three-item reference layout.
 */}
        <details className="g-menu">
          <summary className="g-iconbtn" title="Notificações" aria-label="Notificações">
            <IconePortal nome="sino" tamanho={24} />
          </summary>
          <div className="g-panel pt-sino">
            <p>Você não tem nenhuma notificação</p>
          </div>
        </details>

        <div className="pt-divisoria" />

        <details className="g-menu pt-eu-menu">
          {/*
 * In the reference, `arrow-down` appears to the avatar's right in `menu-user`, indicating that it opens a menu.
 */}
          <summary
            className="g-iconbtn g-avatar"
            title={data.user.nome}
            aria-label={`Conta de ${data.user.nome}`}
          >
            {/*
 * Use a plain `<img>`, not `next/image`: the identity-provider photo (Google or SSO) comes from a customer-dependent domain, and configuring every `images.remotePatterns` just for 32px images is unwarranted. Sign-in makes the same choice.
 */}
            {data.user.avatarUrl ? (
              <img className="avatar pt-foto" src={data.user.avatarUrl} alt="" />
            ) : (
              <Avatar nome={data.user.nome} />
            )}
            <IconePortal nome="baixo" tamanho={24} className="pt-seta" />
          </summary>
          <div className="g-panel pt-menu pt-eu">
            {/*
 * Reference `bds-menu-exibition` places avatar left, name at 16, email at 10 below, then a divider; each following item has another divider, three in total.
 */}
            <div className="me-block">
              {data.user.avatarUrl ? (
                <img className="avatar" src={data.user.avatarUrl} alt="" />
              ) : (
                <Avatar nome={data.user.nome} />
              )}
              <span className="eu-nomes">
                <b>{data.user.nome}</b>
                <span>{data.user.email}</span>
              </span>
            </div>
            {/*
 * Reference menu order and icons are `user-default`, `settings-adjusments`, `logout`. Reference `Minhas preferências` is a separate screen; here it is the second `Minha conta` tab containing the same language/timezone fields.
 */}
            <Link href="/my-account">
              <IconePortal nome="pessoa" tamanho={20} />
              Minha conta
            </Link>
            <Link href="/my-account?aba=preferencias">
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
 * For an unfinished destination, stay on this screen rather than creating a dead link. Keep its dimmed place and blinking badge so the community remains discoverable and the menu keeps the reference item count.
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
