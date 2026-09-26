/**
 * Pipe design system: the single source of tokens and components for `apps/desk`, `apps/gestao`, and `apps/crm`.
 *
 * This file does NOT import styles: each application imports `@pipe/ui/estilos.css` once in its root layout. Keeping them separate lets server code use the typed theme without pulling in CSS.
 *
 * The decisions enforced by this package are in `docs/specs/2026-09-05-design-system.md`; brand identity remains in `docs/marca/MARCA.md`; supporting measurements are in `referencias-blip/pesquisa/visual-blip-salesforce.md` and `referencias-blip/pesquisa/blip-design-system.md`.
 *
 * Its public API enforces three rules that applications must not bypass by declaring their own colors:
 * 1. ONE brand color (moss) for primary actions and active state only.
 * 2. A state is a PAIR: pastel background with dark content, across four states.
 * 3. The extended palette (`TEMA.grafico`) is only for charts and illustrations.
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
  SidebarContext,
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
