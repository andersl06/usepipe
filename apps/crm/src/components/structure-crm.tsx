'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AreaSettings,
  Icone,
  Simbolo,
  estaAtivo,
  type NavigationItem,
  type NomeDeIcone,
} from '@pipe/ui';
import { MenuDeComando } from './menu-de-comando';
import { sair } from '../app/login/actions';

/**
 * CRM structure, in two modes.
 *
 * **Work**: a horizontal header with the five objects the person uses day to
 * day. No sidebar: the list screen doesn't need one, and Salesforce shows that
 * (measured: zero elements pinned to the left with more than 300px of height).
 *
 * Accounts and Contacts came back to the menu once they got a screen. They were
 * out under the rule that an item that doesn't work doesn't appear — which
 * still holds, and it's why bringing them back required building both lists
 * first.
 *
 * **Settings**: behind the gear icon, on its own screen, with its own sidebar
 * and a clear way back. It's the same split Salesforce makes when it leaves for
 * `salesforce-setup.com`, at the scale that makes sense for us. What gets
 * configured once stops competing for space with what gets used every day.
 *
 * The settings sidebar only lists what actually opens. The other six topics
 * that will live here (forms, sources and UTM, disqualification reasons, custom
 * fields, import, deduplication) come in once they have a screen: a settings
 * menu with six dead links is the same problem in a different place.
 */

/**
 * The settings sidebar, in Twenty's group order: what belongs to the PERSON
 * first, what belongs to the COMPANY next, and what connects outward last.
 *
 * Every item opens a screen that exists — the rule against dead items holds
 * here the same way it holds in Gestão's bars.
 */
const SETTINGS: readonly NavigationItem[] = [
  { rotulo: 'Perfil', href: '/settings/profile' },
  { rotulo: 'Espaço de trabalho', href: '/settings/workspace' },
  { rotulo: 'Membros', href: '/settings/members' },
  { rotulo: 'Papéis', href: '/settings/roles' },
  { rotulo: 'Campos personalizados', href: '/settings/fields' },
  { rotulo: 'Regras de score', href: '/settings/score-rules' },
  { rotulo: 'Faixas e roteamento', href: '/settings/tiers' },
  { rotulo: 'Chaves e webhooks', href: '/settings/api' },
];

/** Whoever's logged in. `null` on both public routes, and only there. */
export interface UserInLateral {
  nome: string;
  email: string;
  tenant: string;
}

/**
 * The product's two public routes. They have no sidebar: whoever lands on them
 * isn't logged in, and the whole sidebar is tenant-data navigation.
 */
const PUBLICO = /^\/(login|invite)(\/|$)/;

export function StructureCrm({
  user,
  children,
}: {
  user: UserInLateral | null;
  children: React.ReactNode;
}) {
  const caminho = usePathname();

  if (PUBLICO.test(caminho)) return <>{children}</>;

  if (caminho.startsWith('/settings')) {
    return (
      <AreaSettings
        nome="Pipe CRM"
        itens={SETTINGS}
        caminhoAtual={caminho}
        Link={Link}
      >
        {children}
      </AreaSettings>
    );
  }

  return (
    <div className="c-app">
      <LateralCrm caminho={caminho} user={user} />
      <main className="c-conteudo">{children}</main>
      {/*
 * Outside the `<main>` on purpose: the command menu doesn't belong to one
 * screen, it belongs to the whole app — it reaches the person wherever they
 * are.
 */}
      <MenuDeComando />
    </div>
  );
}

/**
 * Twenty's sidebar, measured against `twenty-front`'s code on 09/07/2026.
 *
 * THE LAYOUT IS THEIRS, THE PAINT IS OURS — the same method as Gestão and Desk
 * used with Blip. What gets copied here:
 *
 * - **left-column navigation, 220px wide**, and no top bar. The work screen
 *   starts at the top of the window and uses the full height; in a 60-lead
 *   listing that's a row and a half more per screenful.
 * - **28px items** with a left icon, 8px radius, and highlight by BACKGROUND, not
 *   underline — the underline was Lightning's and left along with the bars.
 * - **uppercase named sections**, which group objects instead of stacking
 *   everything into one single list.
 * - **a count to the right of the item**, which is what makes the sidebar inform
 *   instead of just navigate.
 *
 * Where they put the workspace switcher, we put the product name: Pipe resolves
 * the tenant from the login, and switching workspaces isn't a gesture that
 * exists here.
 */

/** A sidebar section: a label and the objects under it. */
type SectionLateral = { rotulo: string; itens: readonly ItemLateralCrm[] };
type ItemLateralCrm = { rotulo: string; href: string; icone: NomeDeIcone };

const SECTIONS: readonly SectionLateral[] = [
  {
    rotulo: 'Trabalho',
    itens: [
      { rotulo: 'Painel', href: '/', icone: 'painel' },
      { rotulo: 'Leads', href: '/leads', icone: 'funil' },
      { rotulo: 'Oportunidades', href: '/opportunities', icone: 'grade' },
    ],
  },
  {
    rotulo: 'Registros',
    itens: [
      { rotulo: 'Contas', href: '/accounts', icone: 'pessoas' },
      { rotulo: 'Contatos', href: '/contacts', icone: 'pessoa' },
    ],
  },
];

function LateralCrm({
  caminho,
  user,
}: {
  caminho: string;
  user: UserInLateral | null;
}) {
  return (
    <nav className="c-lateral" aria-label="Navegação">
      <div className="c-lateral-topo">
        <Simbolo tamanho={20} />
        <b>Pipe CRM</b>
        <Link
          className="c-iconbtn"
          href="/settings"
          title="Configurações"
          aria-label="Configurações"
        >
          <Icone nome="engrenagem" tamanho={16} />
        </Link>
      </div>

      {SECTIONS.map((section) => (
        <div key={section.rotulo}>
          <div className="c-section">{section.rotulo}</div>
          {section.itens.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="c-item"
              aria-current={estaAtivo(item.href, caminho) ? 'page' : undefined}
            >
              <Icone nome={item.icone} tamanho={16} />
              {item.rotulo}
            </Link>
          ))}
        </div>
      ))}

      {/*
 * In the FOOTER of the sidebar, not the top: whoever's logged in is a
 * reference, not navigation — and the top belongs to the product. It's the same
 * spot where Twenty puts the account.
 */}
      {user ? (
        <div className="c-lateral-eu">
          <div className="me-block">
            <b>{user.nome}</b>
            <span>{user.email}</span>
            <span>{user.tenant}</span>
          </div>
          <form className="eu-sair" action={sair}>
            <button type="submit" className="btn">
              Sair
            </button>
          </form>
        </div>
      ) : null}
    </nav>
  );
}
