'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Aplicacao,
  AreaConfiguracoes,
  Cabecalho,
  LateralContexto,
  type ItemDeNavegacao,
} from '@pipe/ui';
import { AlternarTema } from './alternar-tema';

/**
 * Estrutura da Gestão, em duas camadas — o modelo real da Blip, medido em
 * `docs/pesquisa/blip-portal-telas.md` e resumido no §3.2 do design system.
 *
 * **Topo: os módulos.** Na Blip são Builder, Atendimento, Análise, Growth e
 * Canais — os produtos da plataforma. O nosso, hoje, é um: Atendimento. Um
 * módulo no topo não é item morto nem moldura: é o mapa honesto do que existe,
 * e é onde Monitoria e Análise entram quando tiverem tela. A Blip mostra cinco
 * porque tem cinco.
 *
 * **Lateral: os itens do módulo aberto.** Dentro de Atendimento, a lateral da
 * Blip tem Monitoramento, Histórico, Relatórios, Comunicação, Regras,
 * Atendentes e Preferências. A nossa tem os três que abrem de verdade. Foi a
 * passada anterior que a removeu inteira, com o argumento de que três itens
 * cabiam no topo; cabiam, mas aí a tela perdeu a camada de contexto e ficou
 * sem navegação nenhuma. A lateral é constante nas três telas de trabalho, e
 * por isso não some nem empurra o conteúdo ao trocar de tela.
 *
 * Continua valendo, e é o que impede a volta dos 32 itens com 29 apagados:
 * **nenhum item desabilitado** (`ItemDeNavegacao` não tem o campo), e
 * **configuração atrás da engrenagem**, em tela própria — quem configura não
 * está trabalhando.
 */

/*
 * Um módulo. O `caminhoAtual` do cabeçalho é normalizado para `/` logo abaixo:
 * toda tela de trabalho pertence a Atendimento, e sem isso o módulo apagaria
 * ao abrir Histórico ou Esforço.
 */
const MODULOS: readonly ItemDeNavegacao[] = [{ rotulo: 'Atendimento', href: '/' }];

const SECOES: readonly ItemDeNavegacao[] = [
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
  { rotulo: 'Esforço por atendente', href: '/relatorios/esforco' },
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
          caminhoAtual="/"
          hrefConfiguracoes="/configuracoes"
          fim={<AlternarTema />}
          Link={Link}
        />
      }
      lateral={
        <LateralContexto
          titulo="Atendimento"
          itens={SECOES}
          caminhoAtual={caminho}
          Link={Link}
        />
      }
    >
      {children}
    </Aplicacao>
  );
}
