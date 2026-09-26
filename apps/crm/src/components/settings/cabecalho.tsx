import Link from 'next/link';
import { Icone } from '@pipe/ui';

/**
 * The settings area's index, and the header every section uses.
 *
 * **Why there's an index and not just the sidebar.** The settings sidebar is
 * assembled in `componentes/estrutura-crm.tsx`, which belongs to another
 * workstream right now. While the new sections aren't in that list yet, the
 * index at `/configuracoes` is what makes them reachable — and it stays useful
 * afterward too, because it describes what each section does, something a 28px
 * menu item can't.
 *
 * The groups are Twenty's, measured in `useSettingsNavigationItems`: what
 * belongs to the PERSON on top, what belongs to the WORKSPACE in the middle,
 * what belongs to developers last. The difference is the CRM group, which
 * doesn't exist there because there the CRM is the whole product.
 */

export type Section = {
  rotulo: string;
  href: string;
  description: string;
};

export const GROUPS: readonly { rotulo: string; sections: readonly Section[] }[] = [
  {
    rotulo: 'Você',
    sections: [
      {
        rotulo: 'Perfil',
        href: '/settings/profile',
        description: 'Seu nome, sua foto e o tema desta tela.',
      },
    ],
  },
  {
    rotulo: 'Espaço de trabalho',
    sections: [
      {
        rotulo: 'Espaço de trabalho',
        href: '/settings/workspace',
        description: 'Nome da empresa, logo, fuso horário e domínios.',
      },
      {
        rotulo: 'Membros',
        href: '/settings/members',
        description: 'Quem tem acesso, convites pendentes e papel de cada um.',
      },
      {
        rotulo: 'Papéis e permissões',
        href: '/settings/roles',
        description: 'O que cada papel pode fazer, permissão por permissão.',
      },
    ],
  },
  {
    rotulo: 'CRM',
    sections: [
      {
        rotulo: 'Regras de score',
        href: '/settings/score-rules',
        description: 'As regras que somam e tiram ponto, com a versão de cada uma.',
      },
      {
        rotulo: 'Faixas e roteamento',
        href: '/settings/tiers',
        description: 'A faixa decide a fila e o proprietário do lead.',
      },
      {
        rotulo: 'Campos personalizados',
        href: '/settings/fields',
        description: 'Os campos do lead que são seus, além dos que o Pipe já traz.',
      },
    ],
  },
  {
    rotulo: 'Desenvolvedor',
    sections: [
      {
        rotulo: 'Chaves e webhooks',
        href: '/settings/api',
        description: 'Chaves da API REST e webhooks de saída, com os eventos que assinam.',
      },
    ],
  },
];

/**
 * Section header: the way back, the title, and one line about what the screen
 * does.
 *
 * The way back comes first in DOM order, not floating next to the title,
 * because it's the first `Tab` target — whoever entered the wrong section
 * leaves it without crossing the whole form.
 */
/**
 * A block inside the section: title, one line of explanation, content.
 *
 * It's Twenty's `Section` + `H2Title`, measured in the fork: title, gray
 * description, and 32px to the next block. `aria-labelledby` links the
 * `<section>` to its own title, which is what makes region navigation in a
 * screen reader list "Photo and name" instead of "section".
 */
export function Block({
  titulo,
  description,
  actions,
  children,
}: {
  titulo: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const id = `b-${titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section className="cfg-bloco" aria-labelledby={id}>
      <header>
        <h3 id={id}>{titulo}</h3>
        {actions}
      </header>
      {description ? <p className="sub">{description}</p> : null}
      {children}
    </section>
  );
}

export function SectionHeader({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="cfg-cabecalho">
      <Link className="cfg-voltar" href="/settings">
        <Icone nome="esquerda" tamanho={14} />
        Configurações
      </Link>
      <h2>{titulo}</h2>
      {children ? <p className="sub">{children}</p> : null}
    </div>
  );
}
