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

export { TEMA, espaco } from './tema.js';
export type { Tema, NomeDeEstado } from './tema.js';

export { Icone, Simbolo } from './icones.js';
export type { NomeDeIcone, PropsDeIcone } from './icones.js';

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
} from './componentes/primitivos.js';
export type {
  PropsDeBotao,
  PropsDeBotaoDeIcone,
  VarianteDeBotao,
  TomDeEtiqueta,
  Aba,
} from './componentes/primitivos.js';

export {
  Marca,
  NavModulos,
  Cabecalho,
  LateralContexto,
  Aplicacao,
  AreaConfiguracoes,
  estaAtivo,
} from './componentes/estrutura.js';
export type { ItemDeNavegacao } from './componentes/estrutura.js';

export { Tabela } from './componentes/tabela.js';
export type { Coluna } from './componentes/tabela.js';
