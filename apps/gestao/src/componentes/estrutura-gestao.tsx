'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Aplicacao, AreaConfiguracoes, Cabecalho, type ItemDeNavegacao } from '@pipe/ui';

/**
 * Estrutura da Gestão, em dois modos — o mesmo corte que o CRM já faz.
 *
 * **Trabalho**: cabeçalho horizontal com os módulos que a pessoa usa no dia, e
 * nada mais. O que havia antes: um menu lateral de 224px com **32 itens em 7
 * grupos, dos quais 29 estavam desabilitados** — 91% do menu era caminho morto
 * em cinza. O comentário do arquivo antigo defendia a escolha dizendo que
 * "esconder o mapa da ferramenta é o que faz o gestor achar que ela não tem a
 * função". A medição das referências derruba o argumento: Blip, Salesforce e
 * Twenty não mostram um único item desabilitado. Um mapa em que 29 das 32
 * estradas estão interditadas não informa, cansa — e foi exatamente isso que o
 * dono leu como "parece que foi construído por IA".
 *
 * Com três módulos não há o que pôr numa lateral: `LateralContexto` do
 * @pipe/ui devolveria nulo de qualquer jeito, e por isso nem é montada aqui.
 *
 * **Configuração**: atrás da engrenagem, em tela própria, sem navegação de
 * módulo — quem configura não está trabalhando. Os quatro grupos que saíram do
 * menu de trabalho (Regras, Operação, Dados e Conta) viram três seções, e não
 * quatro: Conta ainda não tem nada que se leia do banco, e seção vazia é o
 * mesmo item morto mudado de lugar.
 */

const MODULOS: readonly ItemDeNavegacao[] = [
  { rotulo: 'Monitoramento', href: '/' },
  { rotulo: 'Histórico', href: '/historico' },
  /*
   * "Esforço por atendente" era um dos sete itens do grupo Relatórios, e o
   * único que abria. Os outros seis sumiram. Este continua tela própria porque
   * lê a operação por um eixo que a lista de encerradas não tem — caractere
   * escrito, áudio ouvido, ocupação — e a régua da MARCA reserva exatamente
   * esse caso. Os recortes que a lista dá conta (por fila, por atendente, por
   * etiqueta) viraram agrupamento no Histórico.
   */
  { rotulo: 'Esforço', href: '/relatorios/esforco' },
];

const CONFIGURACOES: readonly ItemDeNavegacao[] = [
  { rotulo: 'Regras', href: '/configuracoes/regras' },
  { rotulo: 'Operação', href: '/configuracoes/operacao' },
  { rotulo: 'Dados', href: '/configuracoes/dados' },
];

export function EstruturaGestao({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();

  if (caminho.startsWith('/configuracoes')) {
    return (
      <AreaConfiguracoes
        nome="Pipe Gestão"
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
          nome="Pipe Gestão"
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
