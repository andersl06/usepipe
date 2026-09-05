'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Menu lateral do Pipe Gestão, com os grupos do mockup aprovado.
 *
 * Item sem `href` é caminho ainda não construído: aparece desabilitado em vez de
 * sumir, porque esconder o mapa da ferramenta é o que faz o gestor achar que ela
 * não tem a função.
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
      { rotulo: 'Monitoramento', href: '/' },
      { rotulo: 'Histórico', href: '/historico' },
    ],
  },
  {
    titulo: 'Relatórios',
    itens: [
      { rotulo: 'Atendimento' },
      { rotulo: 'Satisfação' },
      { rotulo: 'Esforço por atendente', href: '/relatorios/esforco' },
      { rotulo: 'Filas' },
      { rotulo: 'Equipes' },
      { rotulo: 'Etiquetas' },
      { rotulo: 'Caixas de entrada' },
    ],
  },
  {
    titulo: 'Comunicação',
    itens: [{ rotulo: 'Mensagens ativas' }, { rotulo: 'Campanhas' }, { rotulo: 'Modelos aprovados' }],
  },
  {
    titulo: 'Regras',
    itens: [
      { rotulo: 'Fila' },
      { rotulo: 'SLA' },
      { rotulo: 'Horário' },
      { rotulo: 'Automações' },
      { rotulo: 'Macros' },
    ],
  },
  {
    titulo: 'Operação',
    separadorAntes: true,
    itens: [
      { rotulo: 'Atendentes e capacidade' },
      { rotulo: 'Equipes' },
      { rotulo: 'Filas' },
      { rotulo: 'Caixas de entrada' },
      { rotulo: 'Respostas prontas' },
      { rotulo: 'Etiquetas' },
      { rotulo: 'Motivos de pausa' },
    ],
  },
  {
    titulo: 'Dados',
    itens: [
      { rotulo: 'Contatos e segmentos' },
      { rotulo: 'Atributos personalizados' },
      { rotulo: 'Importação' },
      { rotulo: 'Base de conhecimento' },
    ],
  },
  {
    titulo: 'Conta',
    itens: [
      { rotulo: 'Integrações e webhooks' },
      { rotulo: 'Auditoria' },
      { rotulo: 'Usuários e permissões' },
      { rotulo: 'Preferências' },
    ],
  },
];

export function MenuLateral() {
  const caminho = usePathname();

  return (
    <nav className="side" aria-label="Seções da Gestão">
      <div className="marca">
        <svg viewBox="0 0 120 120" role="img" aria-label="Pipe">
          <g fill="none" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9,99 V36 Q9,9 36,9 H63" stroke="currentColor" />
            <path d="M99,9 V72 Q99,99 72,99 H36" stroke="#8A9A5B" />
          </g>
        </svg>
        <div>
          <b>Pipe Gestão</b>
          <span className="mono">supervisão</span>
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
                  aria-current={caminho === item.href ? 'page' : undefined}
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
