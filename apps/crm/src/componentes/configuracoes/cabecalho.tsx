import Link from 'next/link';
import { Icone } from '@pipe/ui';

/**
 * O índice da área de configurações, e o cabeçalho que toda seção usa.
 *
 * **Por que existe um índice e não só a lateral.** A lateral de configuração é
 * montada em `componentes/estrutura-crm.tsx`, que pertence a outra frente de
 * trabalho neste momento. Enquanto as seções novas não entram naquela lista, o
 * índice em `/configuracoes` é o que as torna alcançáveis — e continua útil
 * depois, porque ele descreve o que cada seção faz, coisa que um item de menu de
 * 28px não consegue.
 *
 * Os grupos são os do Twenty, medidos em `useSettingsNavigationItems`: o que é
 * da PESSOA em cima, o que é do ESPAÇO no meio, o que é de desenvolvedor por
 * último. A diferença é o grupo do CRM, que lá não existe porque lá o CRM é o
 * produto inteiro.
 */

export type Secao = {
  rotulo: string;
  href: string;
  descricao: string;
};

export const GRUPOS: readonly { rotulo: string; secoes: readonly Secao[] }[] = [
  {
    rotulo: 'Você',
    secoes: [
      {
        rotulo: 'Perfil',
        href: '/configuracoes/perfil',
        descricao: 'Seu nome, sua foto e o tema desta tela.',
      },
    ],
  },
  {
    rotulo: 'Espaço de trabalho',
    secoes: [
      {
        rotulo: 'Espaço de trabalho',
        href: '/configuracoes/espaco',
        descricao: 'Nome da empresa, logo, fuso horário e domínios.',
      },
      {
        rotulo: 'Membros',
        href: '/configuracoes/membros',
        descricao: 'Quem tem acesso, convites pendentes e papel de cada um.',
      },
      {
        rotulo: 'Papéis e permissões',
        href: '/configuracoes/papeis',
        descricao: 'O que cada papel pode fazer, permissão por permissão.',
      },
    ],
  },
  {
    rotulo: 'CRM',
    secoes: [
      {
        rotulo: 'Regras de score',
        href: '/configuracoes/regras-de-score',
        descricao: 'As regras que somam e tiram ponto, com a versão de cada uma.',
      },
      {
        rotulo: 'Faixas e roteamento',
        href: '/configuracoes/faixas',
        descricao: 'A faixa decide a fila e o proprietário do lead.',
      },
      {
        rotulo: 'Campos personalizados',
        href: '/configuracoes/campos',
        descricao: 'Os campos do lead que são seus, além dos que o Pipe já traz.',
      },
    ],
  },
  {
    rotulo: 'Desenvolvedor',
    secoes: [
      {
        rotulo: 'Chaves e webhooks',
        href: '/configuracoes/api',
        descricao: 'Chaves da API REST e webhooks de saída, com os eventos que assinam.',
      },
    ],
  },
];

/**
 * Cabeçalho de seção: o caminho de volta, o título e uma linha do que a tela faz.
 *
 * O caminho de volta vem primeiro na ordem do DOM, e não flutuando ao lado do
 * título, porque é o primeiro alvo do `Tab` — quem entrou na seção errada sai
 * dela sem atravessar o formulário inteiro.
 */
/**
 * Um bloco dentro da seção: título, uma linha de explicação, conteúdo.
 *
 * É a `Section` + `H2Title` do Twenty, medida no fork: título, descrição em
 * cinza e 32px até o bloco seguinte. O `aria-labelledby` liga o `<section>` ao
 * próprio título, que é o que faz a navegação por regiões do leitor de tela
 * listar "Foto e nome" em vez de "seção".
 */
export function Bloco({
  titulo,
  descricao,
  acoes,
  children,
}: {
  titulo: string;
  descricao?: string;
  acoes?: React.ReactNode;
  children: React.ReactNode;
}) {
  const id = `b-${titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section className="cfg-bloco" aria-labelledby={id}>
      <header>
        <h3 id={id}>{titulo}</h3>
        {acoes}
      </header>
      {descricao ? <p className="sub">{descricao}</p> : null}
      {children}
    </section>
  );
}

export function CabecalhoDaSecao({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="cfg-cabecalho">
      <Link className="cfg-voltar" href="/configuracoes">
        <Icone nome="esquerda" tamanho={14} />
        Configurações
      </Link>
      <h2>{titulo}</h2>
      {children ? <p className="sub">{children}</p> : null}
    </div>
  );
}
