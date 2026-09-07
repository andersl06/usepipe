'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Aplicacao,
  AreaConfiguracoes,
  Icone,
  Simbolo,
  estaAtivo,
  type ItemDeNavegacao,
} from '@pipe/ui';

/**
 * Estrutura do CRM, em dois modos.
 *
 * **Trabalho**: cabeçalho horizontal com os cinco objetos que a pessoa usa no
 * dia. Sem lateral: a tela de lista não precisa de uma, e o Salesforce mostra
 * isso (medido: zero elementos encostados à esquerda com mais de 300px de
 * altura).
 *
 * Contas e Contatos voltaram ao menu quando ganharam tela. Estavam fora pela
 * regra de que item que não funciona não aparece — que continua valendo, e é
 * por isso que a volta deles exigiu construir as duas listas antes.
 *
 * **Configuração**: atrás da engrenagem, em tela própria, com lateral própria
 * e um caminho de volta claro. É o corte que o Salesforce faz ao sair para
 * `salesforce-setup.com`, na escala que faz sentido para nós. O que se
 * configura uma vez para de disputar espaço com o que se usa todo dia.
 *
 * A lateral de configuração só lista o que abre. Os outros seis assuntos que
 * vão morar aqui (formulários, origens e UTM, motivos de desqualificação,
 * campos personalizados, importação, deduplicação) entram quando tiverem tela:
 * um menu de configuração com seis links mortos é o mesmo problema mudado de
 * lugar.
 */

const MODULOS: readonly ItemDeNavegacao[] = [
  { rotulo: 'Painel', href: '/' },
  { rotulo: 'Leads', href: '/leads' },
  { rotulo: 'Oportunidades', href: '/oportunidades' },
  { rotulo: 'Contas', href: '/contas' },
  { rotulo: 'Contatos', href: '/contatos' },
];

const CONFIGURACOES: readonly ItemDeNavegacao[] = [
  { rotulo: 'Regras de score', href: '/configuracoes/regras-de-score' },
  { rotulo: 'Faixas e roteamento', href: '/configuracoes/faixas' },
];

export function EstruturaCrm({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();

  if (caminho.startsWith('/configuracoes')) {
    return (
      <AreaConfiguracoes
        nome="Pipe CRM"
        itens={CONFIGURACOES}
        caminhoAtual={caminho}
        Link={Link}
      >
        {children}
      </AreaConfiguracoes>
    );
  }

  return <Aplicacao cabecalho={<CabecalhoCrm caminho={caminho} />}>{children}</Aplicacao>;
}

/**
 * O cromo em DUAS camadas do Lightning, medido em
 * `docs/pesquisa/salesforce-estrutura-e-visual.md` §4.4 e §4.5: cabeçalho
 * global de **50px** mais barra de objetos de **40px**, 90px de cromo fixo.
 *
 * A divisão não é decorativa, e é o que o nosso cabeçalho de 48px numa camada
 * perdia. Em cima fica o que vale para a CONTA — quem sou eu, o que estou
 * procurando, onde configuro. Embaixo, os OBJETOS do trabalho. Trocar de
 * objeto é o gesto do dia inteiro; trocar de conta, quase nunca.
 *
 * A tinta é nossa e é clara, ao contrário das barras escuras da Gestão: são
 * produtos diferentes com referências diferentes, e o Lightning não pinta
 * cromo escuro. O que se copia é a divisão, a altura e a densidade.
 *
 * A aba ativa é sublinhado de 3px com peso 700, não pílula com fundo: no
 * Lightning a marcação de aba é o fio embaixo, e a pílula era a nossa
 * divergência mais visível contra a tela medida.
 */
function CabecalhoCrm({ caminho }: { caminho: string }) {
  return (
    <div className="c-cromo">
      <header className="c-topo">
        <Link className="c-marca" href="/">
          <Simbolo tamanho={22} />
          <b>Pipe CRM</b>
        </Link>

        <div className="c-topo-fim">
          <Link
            className="c-iconbtn"
            href="/configuracoes"
            title="Configurações"
            aria-label="Configurações"
          >
            <Icone nome="engrenagem" tamanho={20} />
          </Link>
        </div>
      </header>

      <nav className="c-objetos" aria-label="Objetos">
        {MODULOS.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            aria-current={estaAtivo(m.href, caminho) ? 'page' : undefined}
          >
            {m.rotulo}
          </Link>
        ))}
      </nav>
    </div>
  );
}
