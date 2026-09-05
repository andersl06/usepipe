'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Menu lateral do Pipe CRM, em dois modos.
 *
 * **Trabalho**: só os objetos que a pessoa usa no dia. Item que não funciona sai da
 * lista — mostrar caminho morto não é transparência, é ruído, e faz o produto parecer
 * inacabado. Relatório também não é item de menu: volume, conversão, por proprietário
 * e por origem são recortes da mesma lista, e vivem lá como agrupamento.
 *
 * **Configuração**: atrás da engrenagem do rodapé, em tela cheia com menu próprio.
 * O que se configura uma vez não disputa espaço com o que se usa todo dia. Aqui
 * dentro item desabilitado é aceitável, porque quem entra em configurações está
 * explorando o que existe.
 *
 * O padrão dos dois modos no mesmo drawer é o do Twenty (`navigation/components`),
 * lido para entender a ideia — nada copiado, o código é AGPL.
 */
interface Item {
  rotulo: string;
  href?: string;
}

const TRABALHO: Item[] = [
  { rotulo: 'Painel', href: '/' },
  { rotulo: 'Leads', href: '/leads' },
  { rotulo: 'Oportunidades', href: '/oportunidades' },
];

const CONFIGURACAO: { titulo: string; itens: Item[] }[] = [
  {
    titulo: 'Qualificação',
    itens: [
      { rotulo: 'Regras de score', href: '/configuracoes/regras-de-score' },
      { rotulo: 'Faixas e roteamento', href: '/configuracoes/faixas' },
      { rotulo: 'Motivos de desqualificação' },
    ],
  },
  {
    titulo: 'Captação',
    itens: [{ rotulo: 'Formulários' }, { rotulo: 'Origens e UTM' }],
  },
  {
    titulo: 'Dados',
    itens: [
      { rotulo: 'Campos personalizados' },
      { rotulo: 'Importação' },
      { rotulo: 'Deduplicação' },
    ],
  },
];

function Marca({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  return (
    <div className="marca">
      <svg viewBox="0 0 120 120" role="img" aria-label="Pipe">
        <g fill="none" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9,99 V36 Q9,9 36,9 H63" stroke="currentColor" />
          <path d="M99,9 V72 Q99,99 72,99 H36" stroke="#8A9A5B" />
        </g>
      </svg>
      <div>
        <b>{titulo}</b>
        <span>{subtitulo}</span>
      </div>
    </div>
  );
}

function Entrada({ item, atual }: { item: Item; atual: boolean }) {
  if (!item.href) {
    return (
      <a aria-disabled="true" title="Ainda não construído nesta entrega">
        {item.rotulo}
      </a>
    );
  }
  return (
    <Link href={item.href} aria-current={atual ? 'page' : undefined}>
      {item.rotulo}
    </Link>
  );
}

export function MenuLateral() {
  const caminho = usePathname();

  if (caminho.startsWith('/configuracoes')) {
    return (
      <nav className="side" aria-label="Configurações do CRM">
        <Marca titulo="Configurações" subtitulo="Pipe CRM" />
        <Link href="/" className="voltar-menu">
          ← Voltar ao CRM
        </Link>
        {CONFIGURACAO.map((grupo) => (
          <div className="grp" key={grupo.titulo}>
            <div className="lbl">{grupo.titulo}</div>
            {grupo.itens.map((item) => (
              <Entrada key={item.rotulo} item={item} atual={caminho === item.href} />
            ))}
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav className="side" aria-label="Seções do CRM">
      <Marca titulo="Pipe CRM" subtitulo="leads e funil" />
      <div className="grp">
        {TRABALHO.map((item) => (
          <Entrada key={item.rotulo} item={item} atual={ativo(caminho, item.href!)} />
        ))}
      </div>
      <Link href="/configuracoes" className="engrenagem">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        Configurações
      </Link>
    </nav>
  );
}

/** A ficha do lead mantém "Leads" marcado: a pessoa não saiu da seção. */
function ativo(caminho: string, href: string): boolean {
  return href === '/' ? caminho === '/' : caminho === href || caminho.startsWith(`${href}/`);
}
