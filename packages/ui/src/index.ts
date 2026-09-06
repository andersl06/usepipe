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
 * `docs/pesquisa/visual-blip-salesforce.md`.
 */

export { TEMA, espaco } from './tema';
export type { Tema, NomeDeEstado } from './tema';

export { Icone, Simbolo } from './icones';
export type { NomeDeIcone, PropsDeIcone } from './icones';

export {
  Botao,
  BotaoDeIcone,
  Etiqueta,
  Campo,
  Seletor,
  Abas,
  EstadoVazio,
  Carregando,
  Avatar,
  Cartao,
  iniciais,
} from './componentes/primitivos';
export type {
  PropsDeBotao,
  PropsDeBotaoDeIcone,
  VarianteDeBotao,
  TomDeEtiqueta,
  Aba,
} from './componentes/primitivos';

export {
  Marca,
  NavModulos,
  Cabecalho,
  LateralContexto,
  Aplicacao,
  AreaConfiguracoes,
  estaAtivo,
} from './componentes/estrutura';
export type { ItemDeNavegacao, ComponenteDeLink } from './componentes/estrutura';

export { Tabela } from './componentes/tabela';
export type { Coluna } from './componentes/tabela';
