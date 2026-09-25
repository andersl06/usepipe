/**
 * Design system do Pipe — fonte única de token e de componente para
 * `apps/desk`, `apps/gestao` e `apps/crm`.
 *
 * O estilo NÃO é importado por este arquivo: cada aplicativo importa
 * `@pipe/ui/estilos.css` uma vez, no seu layout raiz. Manter os dois separados
 * é o que permite usar o tema tipado em código de servidor sem arrastar CSS.
 *
 * Decisões que este pacote existe para impor estão em
 * `docs/specs/2026-09-05-design-system.md`; a identidade continua sendo
 * `docs/marca/MARCA.md`; os números que as justificam estão em
 * `referencias-blip/pesquisa/visual-blip-salesforce.md` e em
 * `referencias-blip/pesquisa/blip-design-system.md`.
 *
 * As três regras que a API pública impõe, e que nenhum aplicativo pode
 * contornar declarando cor própria:
 *   1. UMA cor de marca (moss), em ação primária e estado ativo. Mais nada.
 *   2. Estado é PAR: fundo pastel com conteúdo escuro. Quatro estados.
 *   3. A paleta estendida (`TEMA.grafico`) é exclusiva de gráfico e
 *      ilustração. Fora dali ela não existe.
 */

export { TEMA, espaco } from './tema';
export type { Tema, StateName } from './tema';

export { Icone, Simbolo } from './icones';
export type { NomeDeIcone, PropsDeIcone } from './icones';

export { Illustration } from './illustrations';
export type { IllustrationName, IllustrationProps } from './illustrations';

export {
  Botao,
  BotaoDeIcone,
  Etiqueta,
  Campo,
  Seletor,
  Abas,
  EmptyState,
  Carregando,
  Avatar,
  Card,
  initials,
} from './components/primitivos';
export type {
  PropsDeBotao,
  PropsDeBotaoDeIcone,
  VarianteDeBotao,
  PropsDeEtiqueta,
  TomDeEtiqueta,
  Aba,
} from './components/primitivos';

export {
  Marca,
  NavModulos,
  Cabecalho,
  LateralContext,
  Application,
  AreaSettings,
  estaAtivo,
} from './components/structure';
export type { NavigationItem, LinkComponent } from './components/structure';

export { Tabela } from './components/tabela';
export type { Column } from './components/tabela';

export { CardClosureTicket } from './components/closure-ticket';
export { ClosureNotice, avisarTicketFinalizado } from './components/notice-closure';
export { closureCanConfirm } from './rules-closure';
export type { ClosureTag } from './rules-closure';
