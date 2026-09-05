'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Menu lateral do Pipe CRM, com os grupos da aba "CRM" do mockup aprovado.
 *
 * Item sem `href` é caminho ainda não construído: aparece desabilitado em vez de
 * sumir, pelo mesmo motivo da Gestão — esconder o mapa da ferramenta é o que faz o
 * usuário achar que ela não tem a função.
 */
interface Item {
  rotulo: string;
  href?: string;
}

interface Grupo {
  titulo?: string;
  separadorAntes?: boolean;
  itens: Item[];
}

const GRUPOS: Grupo[] = [
  {
    itens: [
      { rotulo: 'Painel', href: '/' },
      { rotulo: 'Leads', href: '/leads' },
      { rotulo: 'Oportunidades', href: '/oportunidades' },
      { rotulo: 'Contas' },
      { rotulo: 'Contatos' },
    ],
  },
  {
    titulo: 'Captação',
    itens: [{ rotulo: 'Formulários' }, { rotulo: 'Origens e UTM' }],
  },
  {
    titulo: 'Qualificação',
    itens: [
      { rotulo: 'Regras de score', href: '/qualificacao/regras' },
      { rotulo: 'Faixas e roteamento', href: '/qualificacao/faixas' },
      { rotulo: 'Motivos de desqualificação' },
    ],
  },
  {
    titulo: 'Relatórios',
    itens: [
      { rotulo: 'Volume de vendas' },
      { rotulo: 'Funil e conversão' },
      { rotulo: 'Por proprietário' },
      { rotulo: 'Origem e campanha' },
    ],
  },
  {
    titulo: 'Dados',
    separadorAntes: true,
    itens: [
      { rotulo: 'Importar de outro CRM' },
      { rotulo: 'Deduplicação' },
      { rotulo: 'Campos personalizados' },
    ],
  },
];

export function MenuLateral() {
  const caminho = usePathname();

  return (
    <nav className="side" aria-label="Seções do CRM">
      <div className="marca">
        <svg viewBox="0 0 120 120" role="img" aria-label="Pipe">
          <g fill="none" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9,99 V36 Q9,9 36,9 H63" stroke="currentColor" />
            <path d="M99,9 V72 Q99,99 72,99 H36" stroke="#8A9A5B" />
          </g>
        </svg>
        <div>
          <b>Pipe CRM</b>
          <span className="mono">leads e funil</span>
        </div>
      </div>

      {GRUPOS.map((grupo, i) => (
        <div key={grupo.titulo ?? `grupo-${i}`}>
          {grupo.separadorAntes ? <div className="sep" /> : null}
          <div className="grp">
            {grupo.titulo ? <div className="lbl">{grupo.titulo}</div> : null}
            {grupo.itens.map((item) =>
              item.href ? (
                <Link
                  key={`${grupo.titulo ?? ''}-${item.rotulo}`}
                  href={item.href}
                  aria-current={ativo(caminho, item.href) ? 'page' : undefined}
                >
                  {item.rotulo}
                </Link>
              ) : (
                <a
                  key={`${grupo.titulo ?? ''}-${item.rotulo}`}
                  aria-disabled="true"
                  title="Ainda não construído nesta entrega"
                >
                  {item.rotulo}
                </a>
              ),
            )}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** A ficha do lead mantém "Leads" marcado: o usuário não saiu da seção. */
function ativo(caminho: string, href: string): boolean {
  return href === '/' ? caminho === '/' : caminho === href || caminho.startsWith(`${href}/`);
}
