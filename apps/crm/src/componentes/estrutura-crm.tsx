'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Aplicacao, AreaConfiguracoes, Cabecalho, type ItemDeNavegacao } from '@pipe/ui';

/**
 * Estrutura do CRM, em dois modos.
 *
 * **Trabalho**: cabeçalho horizontal com os três objetos que a pessoa usa no
 * dia. Sem lateral: com três módulos não há o que pôr nela, e o Salesforce
 * mostra que a tela de lista não precisa de uma (medido: zero elementos
 * encostados à esquerda com mais de 300px de altura).
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

  return (
    <Aplicacao
      cabecalho={
        <Cabecalho
          nome="Pipe CRM"
          itens={MODULOS}
          caminhoAtual={caminho}
          hrefConfiguracoes="/configuracoes"
          Link={Link}
        />
      }
    >
      {children}
    </Aplicacao>
  );
}
