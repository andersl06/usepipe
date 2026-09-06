/**
 * Estruturas de aplicação: o cabeçalho com navegação horizontal, a lateral
 * contextual e o invólucro da área de configurações.
 *
 * São estas três que corrigem o problema estrutural que o dono reprovou
 * ("você está carregando todas as funções na aba à esquerda"). O que elas
 * impõem, e de onde veio:
 *
 * - MÓDULO NO TOPO, HORIZONTAL. Medido no Salesforce: barra de 40px com 7
 *   itens, e `temSidebar: false` na tela de lista — não existe lateral ali.
 *   Na Blip: Builder / Atendimento / Análise / Growth / Canais no topo.
 *
 * - LATERAL SÓ COM O CONTEXTO DO MÓDULO ABERTO, e curta. `LateralContexto`
 *   não renderiza nada quando recebe menos de dois itens: uma lateral com um
 *   item só é moldura sem função.
 *
 * - CONFIGURAÇÃO EM TELA PRÓPRIA, atrás da engrenagem. No Salesforce ela
 *   troca de domínio, corta a navegação de 7 itens para 3 e só então cria uma
 *   lateral de 250px.
 *
 * - ITEM QUE NÃO FUNCIONA NÃO APARECE. `ItemDeNavegacao` não tem estado
 *   desabilitado. Não é esquecimento: é o que impede a Gestão de voltar a ter
 *   32 itens de menu com 29 apagados.
 */

import type { ComponentType, ReactNode } from 'react';
import { Icone } from '../icones';
import { Simbolo } from '../icones';

/**
 * Um destino de navegação. Repare que não existe `desabilitado`:
 * quem não funciona não entra na lista.
 */
export type ItemDeNavegacao = {
  rotulo: string;
  href: string;
};

/**
 * O componente de link do aplicativo.
 *
 * Existe para que este pacote continue sem depender de `next`: cada aplicativo
 * passa o seu `next/link` e a navegação segue no cliente, sem recarregar a
 * página. Sem isso, um `<a>` cru transformaria toda troca de módulo num
 * recarregamento completo — uma regressão de sensação que ninguém pediu.
 */
export type ComponenteDeLink = ComponentType<{
  href: string;
  className?: string;
  children: ReactNode;
  'aria-current'?: 'page' | undefined;
  title?: string;
  'aria-label'?: string;
}>;

/** Link padrão: âncora comum, para quem não passar um. */
const LinkPadrao: ComponenteDeLink = ({ href, children, ...resto }) => (
  <a href={href} {...resto}>
    {children}
  </a>
);

/** Marca no canto superior esquerdo. Leva sempre para a raiz do aplicativo. */
export function Marca({
  nome,
  href = '/',
  Link = LinkPadrao,
}: {
  nome: string;
  href?: string;
  Link?: ComponenteDeLink;
}) {
  return (
    <Link className="p-marca" href={href}>
      <Simbolo />
      <b>{nome}</b>
    </Link>
  );
}

/**
 * Decide se um item está ativo. Um item de raiz (`/`) só casa exatamente;
 * os demais casam com os seus descendentes, para que `/leads/42` mantenha
 * "Leads" marcado.
 */
export function estaAtivo(href: string, caminhoAtual: string): boolean {
  if (href === '/') return caminhoAtual === '/';
  return caminhoAtual === href || caminhoAtual.startsWith(`${href}/`);
}

/** Navegação horizontal de módulos. Poucos itens, todos funcionando. */
export function NavModulos({
  itens,
  caminhoAtual,
  Link = LinkPadrao,
}: {
  itens: readonly ItemDeNavegacao[];
  caminhoAtual: string;
  Link?: ComponenteDeLink;
}) {
  return (
    <nav className="p-modulos" aria-label="Módulos">
      {itens.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={estaAtivo(item.href, caminhoAtual) ? 'page' : undefined}
        >
          {item.rotulo}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Cabeçalho da aplicação. Espelha o do Salesforce: marca à esquerda, módulos
 * ao lado, e à direita só o que é da CONTA — nunca do trabalho. A engrenagem
 * mora aqui, e é o único caminho para a configuração.
 */
export function Cabecalho({
  nome,
  itens,
  caminhoAtual,
  hrefConfiguracoes,
  fim,
  Link = LinkPadrao,
}: {
  nome: string;
  itens: readonly ItemDeNavegacao[];
  caminhoAtual: string;
  /** Omitido quando o aplicativo ainda não tem nenhuma tela de configuração. */
  hrefConfiguracoes?: string;
  fim?: ReactNode;
  Link?: ComponenteDeLink;
}) {
  return (
    <header className="p-topo">
      <Marca nome={nome} Link={Link} />
      <NavModulos itens={itens} caminhoAtual={caminhoAtual} Link={Link} />
      <div className="p-topo-fim">
        {fim}
        {hrefConfiguracoes ? (
          <Link
            className="iconbtn"
            href={hrefConfiguracoes}
            title="Configurações"
            aria-label="Configurações"
          >
            <Icone nome="engrenagem" />
          </Link>
        ) : null}
      </div>
    </header>
  );
}

/**
 * Lateral do módulo aberto. Curta por regra.
 *
 * Devolve `null` com menos de dois itens: sem escolha para oferecer, a
 * lateral só rouba largura do conteúdo.
 */
export function LateralContexto({
  titulo,
  itens,
  caminhoAtual,
  className,
  Link = LinkPadrao,
}: {
  titulo?: string;
  itens: readonly ItemDeNavegacao[];
  caminhoAtual: string;
  className?: string;
  Link?: ComponenteDeLink;
}) {
  if (itens.length < 2) return null;

  return (
    <nav
      className={className ? `p-lateral ${className}` : 'p-lateral'}
      aria-label={titulo ?? 'Seções do módulo'}
    >
      {titulo ? <span className="lbl">{titulo}</span> : null}
      {itens.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={estaAtivo(item.href, caminhoAtual) ? 'page' : undefined}
        >
          {item.rotulo}
        </Link>
      ))}
    </nav>
  );
}

/** Invólucro padrão: topo fixo, e abaixo lateral (opcional) + conteúdo. */
export function Aplicacao({ cabecalho, lateral, children }: { cabecalho: ReactNode; lateral?: ReactNode; children: ReactNode }) {
  return (
    <div className="p-app">
      {cabecalho}
      <div className="p-miolo">
        {lateral}
        <main className="p-conteudo">{children}</main>
      </div>
    </div>
  );
}

/**
 * Área de configurações: tela própria.
 *
 * Troca o cabeçalho inteiro — não há navegação de módulo aqui, só o caminho
 * de volta. É o corte que o Salesforce faz ao sair para `salesforce-setup.com`,
 * na escala que faz sentido para nós.
 */
export function AreaConfiguracoes({
  nome,
  itens,
  caminhoAtual,
  hrefVoltar = '/',
  children,
  Link = LinkPadrao,
}: {
  nome: string;
  itens: readonly ItemDeNavegacao[];
  caminhoAtual: string;
  hrefVoltar?: string;
  children: ReactNode;
  Link?: ComponenteDeLink;
}) {
  return (
    <div className="p-app">
      <header className="p-config-topo">
        <Link className="p-voltar" href={hrefVoltar}>
          <Icone nome="esquerda" tamanho={14} />
          Voltar para {nome}
        </Link>
        <b>Configurações</b>
      </header>
      <div className="p-miolo">
        <LateralContexto
          itens={itens}
          caminhoAtual={caminhoAtual}
          className="p-config-lateral"
          Link={Link}
        />
        <main className="p-conteudo">{children}</main>
      </div>
    </div>
  );
}
