/**
 * The WORDS for the "criar fluxo" screen — and only them. The name mechanics (length, sanitization, `shortName`, image types) live in `../regras-de-nome.ts`, shared with the create-router screen: in the source both use the SAME name-step template (module 96904), and what changes between them are three `ng-if="$ctrl.template != 'master'"` swapping a label. Checked: `required`, `ng-minlength="2"`, `ng-maxlength="30"`, the file's `accept`, and the server's `/(^[a-zA-Z])/` all hold equally. The labels come from their translation file (key `createApplication`, `pt-BR` block), copied word for word. There was NO change here: the source's sentences already talk about "fluxo", because this is the screen they were written for — it's the router's screen that rewrites the shared ones.
 */

import { TAMANHO } from '../regras-de-nome';

/**
 * `selectTemplate('blip_deskCustomerService')` — the only template the marketplace offers today (the other card is "Construir do zero", with no template). Confirmed in the 09/17/2026 capture (`referencias-blip/builder/criar-fluxo/`): `/application/create/name/{isto}`.
 */
export const TEMPLATE_PADRAO = 'blip_deskCustomerService';

export const ROTULOS = {
  /** `createApplication.tagline` — serves as both subtitle and submit button text. */
  tagline: 'Criar fluxo',

  /* ------------------------------------------- o passo do marketplace */

  /** `createApplication.marketplace.title` */
  tituloDoMarketplace: 'Escolha como começar seu fluxo',
  /** `createApplication.marketplace.template.title` */
  usarTemplate: 'Usar template',
  /** `createApplication.marketplace.template.tag` — o `bds-chip-tag` verde. */
  selo: 'Ideal para começar',
  /** `createApplication.marketplace.template.description` */
  usarTemplateDescricao:
    'Construa um fluxo a partir de um modelo com funcionalidades pré-configuradas e atendimento humano, simplificando o desenvolvimento.',
  /** `createApplication.marketplace.scratch.title` */
  doZero: 'Construir do zero',
  /** `createApplication.marketplace.scratch.description` */
  doZeroDescricao:
    'Construa um fluxo desde o início e faça todas as configurações manualmente. Recomendado para quem já tem experiência com o Pipe.',

  /*
   * --------------------------------------- the template presentation step `auth.application.create.test` — `#create-application-test-step`. Only exists for whoever clicked "Usar template"; "Construir do zero" skips straight to the name step.
   */

  /** `createApplication.test.subtitle` */
  apresentacaoSubtitulo: 'Modelo de fluxo pré-configurado',
  /**
   * `createApplication.test.description` — longer than the marketplace card's (`usarTemplateDescricao`); only appears on this screen.
   */
  apresentacaoDescricao:
    'Ótimo ponto de partida para construir o seu contato inteligente profissional. Funcionalidades pré-configuradas e atendimento humano para você começar a usar e poupar tempo no desenvolvimento.',
  /**
   * The four lines of the `blip_deskCustomerService` feature list, in the captured order. This is what the model promises to pre-configure — not what this screen applies: `MarketplaceTemplatesService.processTemplate` (business hours, handoff, evaluation, agent availability) doesn't exist on our side. See the TODO in `acoes.ts`.
   */
  funcionalidades: [
    'Verificação do horário de atendimento',
    'Transbordo para atendimento humano',
    'Avaliação do atendimento',
    'Verificação de atendentes disponíveis',
  ],
  /** `createApplication.test.chooseTemplate` */
  escolherEsseTemplate: 'Escolher esse template',

  /* ------------------------------------------------ o passo do nome */

  /**
   * `createApplication.name.titleScratch`. Note it's NOT "Dê um nome ao SEU fluxo": `getProvideANameText` falls back to `default` for `builder`, and that key is written without the possessive. The router's (`titleRouter`) has the "seu". We copied both as they are.
   */
  tituloDoNome: 'Dê um nome ao fluxo',
  /**
   * `createApplication.name.titleTemplate` — only for whoever came from `blip_deskCustomerService` ("Usar template"); `tituloDoNome` still applies to "Construir do zero".
   */
  tituloDoNomeComTemplate: 'Dê um nome ao fluxo pré-configurado',
  /** `createApplication.name.name` */
  rotuloDoNome: 'Nome do fluxo',
  /** `modules.ui.uploadButton.title` — the label inside the dashed circle. */
  setImage: 'Definir imagem',
  /** `createApplication.name.back` */
  voltar: 'Voltar',
} as const;

/** `createApplication.errorMsg.*`, um por um — aqui sem nenhuma reescrita. */
export const RECADOS = {
  /** `errorMsg.title` — the title of their red warning. */
  titulo: 'Ops... algo estranho aconteceu...',
  /**
   * `errorMsg.invalidName`. In the source this phrase NEVER appears: `validateApplicationName` throws with the `DataValidation` step, and the controller translates `DataValidation` to `errorMsg.2` ("Este nome não é válido."), which doesn't say what to do. We use the phrase that explains the rule; the slot goes unused, as it does there.
   */
  comecoInvalido: 'O nome de seu fluxo não pode começar com números ou caracteres especiais.',
  /** Derivado de `ng-minlength="2"` / `ng-maxlength="30"`. */
  tamanho: `O nome do fluxo precisa ter entre ${TAMANHO.nomeMin} e ${TAMANHO.nomeMax} caracteres.`,
  /**
   * `errorMsg.1` — "Experimente usar outro nome" is literal, and it's the clue that the name is unique: the `shortName` comes from it, and two matching ones collide in the service.
   */
  nomeEmUso: 'Houve um erro na criação do seu fluxo. Experimente usar outro nome.',
  /** Ours, with no counterpart: there the permission hides the button before it gets here. */
  withoutPermission: 'Você não tem permissão para criar fluxos nesta conta.',
} as const;
