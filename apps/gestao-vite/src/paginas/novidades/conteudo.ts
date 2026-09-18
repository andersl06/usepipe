/**
 * As novidades do produto — o nosso registro de mudanças, em linguagem de quem
 * usa e não de quem escreve código.
 *
 * Mora num arquivo, e não no banco: a lista muda quando a gente publica uma
 * versão, e versão já passa por revisão de código. Um CMS aqui seria uma segunda
 * porta de publicação para manter, com um item por mês entrando por ela.
 * Quando a frequência justificar, isto vira tabela sem mudar a tela.
 */

export interface Novidade {
  /** O trecho que vai na URL quando cada novidade ganhar página própria. */
  id: string;
  categoria: string;
  titulo: string;
  resumo: string;
  /** ISO, só a data. O fuso não importa num aviso de versão. */
  data: string;
  /** Minutos de leitura, arredondados para cima. */
  leitura: number;
  /** A primeira da lista vira o cartão grande, como no blog do Barboo. */
  destaque?: boolean;
}

export const CATEGORIAS = ['Todas as categorias', 'Portal', 'Atendimento', 'Automação'] as const;

export const NOVIDADES: readonly Novidade[] = [
  {
    id: 'portal-igual-a-referencia',
    categoria: 'Portal',
    titulo: 'O portal ganhou a barra, os menus e a busca da tela de referência',
    resumo:
      'A barra do topo foi refeita peça por peça: o bloco do contrato com o plano embaixo, o sino, o menu do "?", o menu da conta com nome e e-mail, e a busca sem caixa. Os cartões de ação passaram a aparecer também em conta que já tem fluxo.',
    data: '2026-09-13',
    leitura: 3,
    destaque: true,
  },
  {
    id: 'criar-roteador',
    categoria: 'Automação',
    titulo: 'Criar roteador, em dois passos',
    resumo:
      'O roteador reúne vários fluxos num contato só. A criação agora tem o passo do convite e o passo do nome, com a validação do nome explicada — em vez de um "nome inválido" que não diz o que fazer.',
    data: '2026-09-13',
    leitura: 2,
  },
  {
    id: 'painel-do-contrato',
    categoria: 'Portal',
    titulo: 'Painel do contrato, e o que cada papel enxerga nele',
    resumo:
      'Quem administra o contrato vê membros, certificados e consumo; quem é membro vê o que pode editar; quem é convidado vê o resumo. O painel monta a lista conforme a permissão de quem abriu.',
    data: '2026-09-13',
    leitura: 4,
  },
];
