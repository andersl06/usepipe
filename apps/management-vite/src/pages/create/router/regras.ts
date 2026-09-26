/**
 * The WORDS of the "create router" screen — and only them.
 *
 * The name mechanics (length, sanitization, `shortName`, image types) live in
 * `../regras-de-nome.ts`, shared with the create-flow screen: in the source both
 * use the same name-step template (module 96904), and what changes between them
 * are three `ng-if="$ctrl.template != 'master'"` swapping labels.
 *
 * The labels below are from their translation file (key `createApplication`,
 * `pt-BR` block), copied word for word. Where we changed something, it's noted.
 */

import { TAMANHO } from '../regras-de-nome';

/**
 * The labels, with the source key alongside. Nothing here is written by us.
 *
 * The one systematic change: where the key is shared with flow creation and the
 * text says "fluxo" while on the router screen, we write "roteador". That's the
 * case for `errorMsg.1` and `errorMsg.invalidName` — their screen shows "Houve um
 * erro na criação do seu FLUXO" to someone who just clicked "Criar roteador".
 */
export const ROTULOS = {
  /** `createApplication.taglineRouter` — serves as both overline AND button. */
  tagline: 'Criar roteador',
  /** `createApplication.router.title` */
  comoFunciona: 'Como funciona o roteador',
  /** `createApplication.router.description` */
  descricao:
    'O roteador ajuda a reunir vários fluxos em um só. Dessa forma, seu cliente terá acesso a múltiplos serviços conversando com um único contato inteligente.',
  /** `createApplication.router.learnMore` */
  saberMais: 'Quero saber mais',
  /** `createApplication.name.titleRouter` */
  tituloDoNome: 'Dê um nome ao seu roteador',
  /** `createApplication.name.nameRouter` */
  rotuloDoNome: 'Nome do roteador',
  /** `modules.ui.uploadButton.title` — the label inside the dashed circle. */
  definirImage: 'Definir imagem',
  /** `createApplication.name.back` */
  voltar: 'Voltar',
} as const;

/** `createApplication.errorMsg.*`, um por um. */
export const RECADOS = {
  /** `errorMsg.title` — the title of their red warning. */
  titulo: 'Ops... algo estranho aconteceu...',
  /**
   * `errorMsg.invalidName`.
   *
   * In the source this phrase NEVER appears on this screen: `validateApplicationName`
   * throws with step `DataValidation`, and the controller translates `DataValidation`
   * to `errorMsg.2` ("Este nome não é válido."), which doesn't say what to do. We use
   * the phrase that explains the rule; the unused slot stays unused, as it does
   * there.
   */
  comecoInvalido: 'O nome do seu roteador não pode começar com números ou caracteres especiais.',
  /** Derivado de `ng-minlength="2"` / `ng-maxlength="30"`. */
  tamanho: `O nome do roteador precisa ter entre ${TAMANHO.nomeMin} e ${TAMANHO.nomeMax} caracteres.`,
  /**
   * `errorMsg.1` — "Experimente usar outro nome" is literal, and it's the hint that
   * the name is unique: `shortName` is derived from it, and two identical ones
   * collide in the service.
   */
  nomeEmUso: 'Houve um erro na criação do seu roteador. Experimente usar outro nome.',
  /**
   * Ours, with no counterpart: there the permission check hides the button before
   * reaching this point.
   */
  withoutPermission: 'Você não tem permissão para criar roteadores nesta conta.',
} as const;
