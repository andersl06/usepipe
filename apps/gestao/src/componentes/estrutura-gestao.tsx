'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Aplicacao, Cabecalho, type ItemDeNavegacao } from '@pipe/ui';

/**
 * Estrutura da Gestão: cabeçalho horizontal com os módulos, e nada mais.
 *
 * O que havia antes: um menu lateral de 224px com **32 itens em 7 grupos, dos
 * quais 29 estavam desabilitados** — 91% do menu era caminho morto em cinza.
 * O comentário do arquivo antigo defendia a escolha dizendo que "esconder o
 * mapa da ferramenta é o que faz o gestor achar que ela não tem a função". A
 * medição das referências derruba o argumento: Blip, Salesforce e Twenty não
 * mostram um único item desabilitado. Um mapa em que 29 das 32 estradas estão
 * interditadas não informa, cansa — e foi exatamente isso que o dono leu como
 * "parece que foi construído por IA".
 *
 * Sobram os três módulos que existem de verdade. Com três itens não há o que
 * pôr numa lateral: `LateralContexto` do @pipe/ui devolveria nulo de qualquer
 * jeito, e por isso nem é montada aqui.
 *
 * Sem engrenagem, e isso é deliberado. Os quatro grupos que o dono mandou para
 * configurações (Regras, Operação, Dados e Conta) somam 20 itens e **nenhum
 * deles tem tela**. Uma engrenagem que abre uma página com 20 links mortos é o
 * mesmo problema mudado de lugar. Ela entra junto com a primeira tela de
 * configuração de verdade.
 */

const MODULOS: readonly ItemDeNavegacao[] = [
  { rotulo: 'Monitoramento', href: '/' },
  { rotulo: 'Histórico', href: '/historico' },
  /*
   * "Esforço por atendente" era um dos sete itens do grupo Relatórios, e o
   * único que abria. Os outros seis sumiram. Este vira módulo porque é uma
   * leitura própria da operação, não um recorte da lista de atendimentos.
   */
  { rotulo: 'Esforço', href: '/relatorios/esforco' },
];

export function EstruturaGestao({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();

  return (
    <Aplicacao
      cabecalho={
        <Cabecalho nome="Pipe Gestão" itens={MODULOS} caminhoAtual={caminho} Link={Link} />
      }
    >
      {children}
    </Aplicacao>
  );
}
