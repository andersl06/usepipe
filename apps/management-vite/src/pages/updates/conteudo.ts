/**
 * The product's news — our changelog, in the language of whoever uses it, not whoever writes code.
 *
 * It lives in a file, not the database: the list changes when we ship a version, and a version already goes through code review. A CMS here would be a second publishing door to maintain, with one item a month going through it. When the frequency justifies it, this becomes a table without changing the screen.
 */

export interface Update {
  /** The slug that goes in the URL once each news item gets its own page. */
  id: string;
  categoria: string;
  titulo: string;
  resumo: string;
  /** ISO, date only. Timezone doesn't matter for a version announcement. */
  data: string;
  /** Minutos de leitura, arredondados para cima. */
  read: number;
  /** The first in the list becomes the big card, like Barboo's blog. */
  destaque?: boolean;
}

export const CATEGORIAS = ['Todas as categorias', 'Portal', 'Atendimento', 'Automação'] as const;

export const UPDATES: readonly Update[] = [
  {
    id: 'portal-igual-a-referencia',
    categoria: 'Portal',
    titulo: 'O portal ganhou a barra, os menus e a busca da tela de referência',
    resumo:
      'A barra do topo foi refeita peça por peça: o bloco do contrato com o plano embaixo, o sino, o menu do "?", o menu da conta com nome e e-mail, e a busca sem caixa. Os cartões de ação passaram a aparecer também em conta que já tem fluxo.',
    data: '2026-09-13',
    read: 3,
    destaque: true,
  },
  {
    id: 'criar-roteador',
    categoria: 'Automação',
    titulo: 'Criar roteador, em dois passos',
    resumo:
      'O roteador reúne vários fluxos num contato só. A criação agora tem o passo do convite e o passo do nome, com a validação do nome explicada — em vez de um "nome inválido" que não diz o que fazer.',
    data: '2026-09-13',
    read: 2,
  },
  {
    id: 'painel-do-contrato',
    categoria: 'Portal',
    titulo: 'Painel do contrato, e o que cada papel enxerga nele',
    resumo:
      'Quem administra o contrato vê membros, certificados e consumo; quem é membro vê o que pode editar; quem é convidado vê o resumo. O painel monta a lista conforme a permissão de quem abriu.',
    data: '2026-09-13',
    read: 4,
  },
];
