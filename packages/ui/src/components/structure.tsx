/**
 * Application structures: the horizontal navigation header, contextual sidebar, and settings-area wrapper.
 *
 * These three address the structural problem rejected by the owner ("você está carregando todas as funções na aba à esquerda"). They enforce these rules, based on the cited references:
 *
 * - MODULES AT THE TOP, HORIZONTALLY. Salesforce was measured with a 40px bar containing seven items and `temSidebar: false` on the list screen, which has no sidebar. Blip places Builder / Atendimento / Análise / Growth / Canais at the top.
 * - SIDEBAR ONLY FOR THE OPEN MODULE'S CONTEXT, and short. `LateralContexto` renders nothing with fewer than two items: a one-item sidebar is framing without purpose.
 * - SETTINGS ON A SEPARATE SCREEN, behind the gear. Salesforce changes domain, reduces seven navigation items to three, and only then adds a 250px sidebar.
 * - NONFUNCTIONAL ITEMS DO NOT APPEAR. `ItemDeNavegacao` has no disabled state deliberately: this prevents Management from returning to 32 menu items with 29 disabled.
 */

import type { ComponentType, ReactNode } from 'react';
import { Icone } from '../icones';
import { Simbolo } from '../icones';

/**
 * A navigation destination. There is no `desabilitado`: nonfunctional destinations do not enter the list.
 */
export type NavigationItem = {
  rotulo: string;
  href: string;
};

/**
 * The application's link component.
 *
 * It keeps this package independent of `next`: each application supplies its own `next/link`, preserving client-side navigation without a page reload. A plain `<a>` would turn every module change into a full reload, an unwanted interaction regression.
 */
export type LinkComponent = ComponentType<{
  href: string;
  className?: string;
  children: ReactNode;
  'aria-current'?: 'page' | undefined;
  title?: string;
  'aria-label'?: string;
}>;


const LinkPadrao: LinkComponent = ({ href, children, ...resto }) => (
  <a href={href} {...resto}>
    {children}
  </a>
);


export function Marca({
  nome,
  href = '/',
  Link = LinkPadrao,
}: {
  nome: string;
  href?: string;
  Link?: LinkComponent;
}) {
  return (
    <Link className="p-marca" href={href}>
      <Simbolo />
      <b>{nome}</b>
    </Link>
  );
}

/**
 * Determine whether an item is active. The root item (`/`) matches only exactly; other items match descendants so `/leads/42` keeps "Leads" selected.
 */
export function estaAtivo(href: string, caminhoAtual: string): boolean {
  if (href === '/') return caminhoAtual === '/';
  return caminhoAtual === href || caminhoAtual.startsWith(`${href}/`);
}


export function NavModulos({
  itens,
  caminhoAtual,
  Link = LinkPadrao,
}: {
  itens: readonly NavigationItem[];
  caminhoAtual: string;
  Link?: LinkComponent;
}) {
  return (
    <nav className="p-modulos" aria-label="Módulos">
      {itens.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={estaAtivo(item.href, caminhoAtual) ? 'page' : undefined}
        >
          {item.rotulo}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Application header modeled on Salesforce: brand on the left, modules beside it, and only ACCOUNT controls on the right, never work controls. The gear lives here as the sole route to settings.
 */
export function Cabecalho({
  nome,
  itens,
  caminhoAtual,
  hrefSettings,
  fim,
  Link = LinkPadrao,
}: {
  nome: string;
  itens: readonly NavigationItem[];
  caminhoAtual: string;

  hrefSettings?: string;
  fim?: ReactNode;
  Link?: LinkComponent;
}) {
  return (
    <header className="p-topo">
      <Marca nome={nome} Link={Link} />
      <NavModulos itens={itens} caminhoAtual={caminhoAtual} Link={Link} />
      <div className="p-topo-fim">
        {fim}
        {hrefSettings ? (
          <Link
            className="iconbtn"
            href={hrefSettings}
            title="Configurações"
            aria-label="Configurações"
          >
            <Icone nome="engrenagem" />
          </Link>
        ) : null}
      </div>
    </header>
  );
}

/**
 * Sidebar for the open module, deliberately short.
 *
 * Returns `null` with fewer than two items: without a choice to offer, the sidebar only takes width from content.
 */
export function SidebarContext({
  titulo,
  itens,
  caminhoAtual,
  className,
  Link = LinkPadrao,
}: {
  titulo?: string;
  itens: readonly NavigationItem[];
  caminhoAtual: string;
  className?: string;
  Link?: LinkComponent;
}) {
  if (itens.length < 2) return null;

  return (
    <nav
      className={className ? `p-lateral ${className}` : 'p-lateral'}
      aria-label={titulo ?? 'Seções do módulo'}
    >
      {titulo ? <span className="lbl">{titulo}</span> : null}
      {itens.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={estaAtivo(item.href, caminhoAtual) ? 'page' : undefined}
        >
          {item.rotulo}
        </Link>
      ))}
    </nav>
  );
}


export function Application({ cabecalho, lateral, children }: { cabecalho: ReactNode; lateral?: ReactNode; children: ReactNode }) {
  return (
    <div className="p-app">
      {cabecalho}
      <div className="p-miolo">
        {lateral}
        <main className="p-conteudo">{children}</main>
      </div>
    </div>
  );
}

/**
 * Settings area on a separate screen.
 *
 * It replaces the entire header: there is no module navigation here, only a way back. This follows Salesforce's transition to `salesforce-setup.com`, at a scale suitable for this product.
 */
export function AreaSettings({
  nome,
  itens,
  caminhoAtual,
  hrefVoltar = '/',
  children,
  Link = LinkPadrao,
}: {
  nome: string;
  itens: readonly NavigationItem[];
  caminhoAtual: string;
  hrefVoltar?: string;
  children: ReactNode;
  Link?: LinkComponent;
}) {
  return (
    <div className="p-app">
      <header className="p-config-topo">
        <Link className="p-voltar" href={hrefVoltar}>
          <Icone nome="esquerda" tamanho={14} />
          Voltar para {nome}
        </Link>
        <b>Configurações</b>
      </header>
      <div className="p-miolo">
        <SidebarContext
          itens={itens}
          caminhoAtual={caminhoAtual}
          className="p-config-lateral"
          Link={Link}
        />
        <main className="p-conteudo">{children}</main>
      </div>
    </div>
  );
}
