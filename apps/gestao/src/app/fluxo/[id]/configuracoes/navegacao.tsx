'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconePortal, type NomeDeIconePortal } from '../../../../componentes/icones-portal';

/**
 * A lateral de Configurações — `<bds-grid padding="2"><bds-nav-tree-group
 * collapse="single">` com um `<bds-nav-tree icon text secondary-text>` por
 * item (portal.js, template do estado `auth.application.detail.configurations`).
 *
 * Os cinco itens, na ordem e com o texto do pacote pt-BR
 * (`modules.application.detail.configs.*` e `.persistentMenu.*`):
 *
 *   settings-general     configs.basic / basicSubtitle
 *   robot-2              configs.welcome.title / subtitle
 *   add-persistent-menu  persistentMenu.title / subtitle
 *   plugin               configs.apiKey / apiKeySubtitle      → /apikey
 *   sso                  configs.keys.title / subtitle        → /keys
 *
 * O sexto (`xml`, "Mime Types permitidos") só aparece com
 * `isMimeTypeManagementEnable`, que a régua não tem ligado — não entra.
 *
 * ponytail: Configurações básicas, Boas-vindas e Menu Persistente ainda não
 * têm tela aqui; ficam sem destino (só visual), como o combinado.
 */
const ITENS: {
  icone: NomeDeIconePortal;
  titulo: string;
  descricao: string;
  rota: string | null;
}[] = [
  {
    icone: 'config-basicas',
    titulo: 'Configurações básicas',
    descricao: 'Defina nome, descrição e a imagem de seu fluxo',
    rota: null,
  },
  {
    icone: 'boas-vindas',
    titulo: 'Tela de Boas-vindas',
    descricao: 'Defina a Mensagem de Saudação e o botão Começar',
    rota: null,
  },
  {
    icone: 'menu-persistente',
    titulo: 'Menu Persistente',
    descricao: 'Configure o menu persistente de seu fluxo',
    rota: null,
  },
  {
    icone: 'loja',
    titulo: 'Informações de conexão',
    descricao: 'Obtenha e defina as configurações de conexão do seu fluxo',
    rota: 'api',
  },
  {
    icone: 'chaves',
    titulo: 'Chaves de acesso',
    descricao: 'Gerencie as chaves de acesso para conexão com seu fluxo',
    rota: 'keys',
  },
];

export function NavegacaoConfiguracoes({ id }: { id: string }) {
  const caminho = usePathname();
  return (
    <aside className="cf-lateral">
      <nav className="cf-arvore" aria-label="Configurações do fluxo">
        {ITENS.map((item) => {
          const href = item.rota ? `/fluxo/${id}/configuracoes/${item.rota}` : null;
          const atual = href !== null && caminho === href;
          const miolo = (
            <>
              <IconePortal nome={item.icone} tamanho={24} className="cf-arvore-icone" />
              <span className="cf-arvore-texto">
                <span className="cf-arvore-titulo">{item.titulo}</span>
                <span className="cf-arvore-descricao">{item.descricao}</span>
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
