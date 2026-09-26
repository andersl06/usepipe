import Link from '../../../components/link';
import { useLocation } from 'react-router-dom';
import { contactBase, useContact } from '../contact';
import { IconePortal, type NomeDeIconePortal } from '../../../components/icones-portal';

/**
 * The Settings sidebar — `<bds-grid padding="2"><bds-nav-tree-group collapse="single">` with one `<bds-nav-tree icon text secondary-text>` per item (portal.js, template for the `auth.application.detail.configurations` state).
 *
 * The five items, in order and with the pt-BR package text (`modules.application.detail.configs.*` and `.persistentMenu.*`):
 *
 *   settings-general     configs.basic / basicSubtitle
 *   robot-2              configs.welcome.title / subtitle
 *   add-persistent-menu  persistentMenu.title / subtitle
 *   plugin               configs.apiKey / apiKeySubtitle      → /apikey
 *   sso                  configs.keys.title / subtitle        → /keys
 *
 * The sixth (`xml`, "Mime Types permitidos") only appears with `isMimeTypeManagementEnable`, which the ruler doesn't have turned on — it doesn't show up.
 */
const ITENS: {
  icone: NomeDeIconePortal;
  titulo: string;
  description: string;
  rota: string | null;
}[] = [
  {
    icone: 'config-basicas',
    titulo: 'Configurações básicas',
    description: 'Defina nome, descrição e a imagem de seu fluxo',
    rota: 'basic',
  },
  {
    icone: 'boas-vindas',
    titulo: 'Tela de Boas-vindas',
    description: 'Defina a Mensagem de Saudação e o botão Começar',
    rota: 'welcome',
  },
  {
    icone: 'menu-persistente',
    titulo: 'Menu Persistente',
    description: 'Configure o menu persistente de seu fluxo',
    rota: 'menu-persistente',
  },
  {
    icone: 'loja',
    titulo: 'Informações de conexão',
    description: 'Obtenha e defina as configurações de conexão do seu fluxo',
    rota: 'api',
  },
  {
    icone: 'chaves',
    titulo: 'Chaves de acesso',
    description: 'Gerencie as chaves de acesso para conexão com seu fluxo',
    rota: 'keys',
  },
];

export function NavigationSettings({ id }: { id: string }) {
  const caminho = useLocation().pathname;
  /* The prefix comes from the contact's type: router and flow have separate trees. */
  const base = contactBase(useContact().contact.tipo, id);
  return (
    <aside className="cf-lateral">
      <nav className="cf-arvore" aria-label="Configurações do fluxo">
        {ITENS.map((item) => {
          const href = item.rota ? `${base}/settings/${item.rota}` : null;
          const atual = href !== null && caminho === href;
          const miolo = (
            <>
              <IconePortal nome={item.icone} tamanho={24} className="cf-arvore-icone" />
              <span className="cf-arvore-texto">
                <span className="cf-arvore-titulo">{item.titulo}</span>
                <span className="cf-tree-description">{item.description}</span>
              </span>
            </>
          );
          return (
            <div className="cf-arvore-item" key={item.titulo}>
              {href ? (
                <Link
                  className="cf-arvore-linha"
                  href={href}
                  aria-current={atual ? 'page' : undefined}
                >
                  {miolo}
                </Link>
              ) : (
                <span className="cf-arvore-linha" role="button" tabIndex={0}>
                  {miolo}
                </span>
              )}
              <div className="cf-arvore-divisa" aria-hidden="true" />
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
