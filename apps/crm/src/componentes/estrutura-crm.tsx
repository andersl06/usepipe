'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AreaConfiguracoes,
  Icone,
  Simbolo,
  estaAtivo,
  type ItemDeNavegacao,
  type NomeDeIcone,
} from '@pipe/ui';
import { MenuDeComando } from './menu-de-comando';
import { sair } from '../app/entrar/acoes';

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

/**
 * A lateral da área de configuração, na ordem dos grupos do Twenty: o que é da
 * PESSOA primeiro, o que é da EMPRESA depois, e o que se liga a fora por último.
 *
 * Cada item abre tela que existe — a régua contra item apagado vale aqui como
 * vale nas barras da Gestão.
 */
const CONFIGURACOES: readonly ItemDeNavegacao[] = [
  { rotulo: 'Perfil', href: '/configuracoes/perfil' },
  { rotulo: 'Espaço de trabalho', href: '/configuracoes/espaco' },
  { rotulo: 'Membros', href: '/configuracoes/membros' },
  { rotulo: 'Papéis', href: '/configuracoes/papeis' },
  { rotulo: 'Campos personalizados', href: '/configuracoes/campos' },
  { rotulo: 'Regras de score', href: '/configuracoes/regras-de-score' },
  { rotulo: 'Faixas e roteamento', href: '/configuracoes/faixas' },
  { rotulo: 'Chaves e webhooks', href: '/configuracoes/api' },
];

/** Quem está logado. `null` nas duas rotas públicas, e só nelas. */
export interface UsuarioNaLateral {
  nome: string;
  email: string;
  tenant: string;
}

/**
 * As duas rotas públicas do produto. Elas não têm lateral: quem chega nelas não
 * está logado, e a lateral inteira é navegação de dado de tenant.
 */
const PUBLICO = /^\/(entrar|convite)(\/|$)/;

export function EstruturaCrm({
  usuario,
  children,
}: {
  usuario: UsuarioNaLateral | null;
  children: React.ReactNode;
}) {
  const caminho = usePathname();

  if (PUBLICO.test(caminho)) return <>{children}</>;

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
    <div className="c-app">
      <LateralCrm caminho={caminho} usuario={usuario} />
      <main className="c-conteudo">{children}</main>
      {/* Fora do <main> de propósito: o menu de comando não é de uma tela, é
          do aplicativo inteiro — ele alcança a pessoa onde ela estiver. */}
      <MenuDeComando />
    </div>
  );
}

/**
 * A lateral do Twenty, medida no código de `twenty-front` em 07/09/2026.
 *
 * A DISPOSIÇÃO É DELES, A TINTA É NOSSA — o mesmo método da Gestão e do Desk
 * com a Blip. O que se copia aqui:
 *
 * - **navegação em coluna à esquerda, de 220px**, e nenhuma barra no topo. A
 *   tela de trabalho começa no alto da janela e usa a altura inteira; numa
 *   listagem de 60 leads isso é uma linha e meia a mais por dobra.
 * - **item de 28px** com ícone à esquerda, raio 8 e realce por FUNDO, não por
 *   sublinhado — o sublinhado era do Lightning e saiu junto com as barras.
 * - **seções nomeadas em caixa alta**, que agrupam objetos em vez de empilhar
 *   tudo numa lista só.
 * - **contagem à direita do item**, que é o que faz a lateral informar em vez
 *   de só navegar.
 *
 * Onde eles põem o seletor de espaço de trabalho, nós pomos o nome do produto:
 * o Pipe resolve o tenant pelo login, e trocar de espaço não é um gesto que
 * exista aqui.
 */

/** Seção da lateral: um rótulo e os objetos embaixo dele. */
type SecaoLateral = { rotulo: string; itens: readonly ItemLateralCrm[] };
type ItemLateralCrm = { rotulo: string; href: string; icone: NomeDeIcone };

const SECOES: readonly SecaoLateral[] = [
  {
    rotulo: 'Trabalho',
    itens: [
      { rotulo: 'Painel', href: '/', icone: 'painel' },
      { rotulo: 'Leads', href: '/leads', icone: 'funil' },
      { rotulo: 'Oportunidades', href: '/oportunidades', icone: 'grade' },
    ],
  },
  {
    rotulo: 'Registros',
    itens: [
      { rotulo: 'Contas', href: '/contas', icone: 'pessoas' },
      { rotulo: 'Contatos', href: '/contatos', icone: 'pessoa' },
    ],
  },
];

function LateralCrm({
  caminho,
  usuario,
}: {
  caminho: string;
  usuario: UsuarioNaLateral | null;
}) {
  return (
    <nav className="c-lateral" aria-label="Navegação">
      <div className="c-lateral-topo">
        <Simbolo tamanho={20} />
        <b>Pipe CRM</b>
        <Link
          className="c-iconbtn"
          href="/configuracoes"
          title="Configurações"
          aria-label="Configurações"
        >
          <Icone nome="engrenagem" tamanho={16} />
        </Link>
      </div>

      {SECOES.map((secao) => (
        <div key={secao.rotulo}>
          <div className="c-secao">{secao.rotulo}</div>
          {secao.itens.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="c-item"
              aria-current={estaAtivo(item.href, caminho) ? 'page' : undefined}
            >
              <Icone nome={item.icone} tamanho={16} />
              {item.rotulo}
            </Link>
          ))}
        </div>
      ))}

      {/* No RODAPÉ da lateral, e não no topo: quem está logado é referência,
          não navegação — e o topo é do produto. É o mesmo lugar em que o
          Twenty põe a conta. */}
      {usuario ? (
        <div className="c-lateral-eu">
          <div className="eu-bloco">
            <b>{usuario.nome}</b>
            <span>{usuario.email}</span>
            <span>{usuario.tenant}</span>
          </div>
          <form className="eu-sair" action={sair}>
            <button type="submit" className="btn">
              Sair
            </button>
          </form>
        </div>
      ) : null}
    </nav>
  );
}
