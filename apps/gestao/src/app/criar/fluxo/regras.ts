/**
 * As PALAVRAS da tela "criar fluxo" — e só elas.
 *
 * A mecânica do nome (tamanho, saneamento, `shortName`, tipos de imagem) mora
 * em `../regras-de-nome.ts`, compartilhada com a tela de criar roteador: na
 * origem as duas usam o MESMO template do passo do nome (módulo 96904), e o que
 * muda entre elas são três `ng-if="$ctrl.template != 'master'"` trocando
 * rótulo. Conferido: o `required`, o `ng-minlength="2"`, o `ng-maxlength="30"`,
 * o `accept` do arquivo e o `/(^[a-zA-Z])/` do servidor valem igual.
 *
 * Os rótulos são do arquivo de tradução deles (chave `createApplication`, bloco
 * `pt-BR`), copiados palavra por palavra. Aqui não houve NENHUMA troca: as
 * frases da origem já falam de "fluxo", porque esta é a tela para a qual elas
 * foram escritas — é a do roteador que reescreve as compartilhadas.
 */

import { TAMANHO } from '../regras-de-nome';

export const ROTULOS = {
  /** `createApplication.tagline` — serve de sobretítulo E de botão de envio. */
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

  /* ------------------------------------------------ o passo do nome */

  /**
   * `createApplication.name.titleScratch`.
   *
   * Repare que NÃO é "Dê um nome ao SEU fluxo": o `getProvideANameText` cai no
   * `default` para `builder` e essa chave é escrita sem o possessivo. A do
   * roteador (`titleRouter`) tem o "seu". Copiamos as duas como estão.
   */
  tituloDoNome: 'Dê um nome ao fluxo',
  /** `createApplication.name.name` */
  rotuloDoNome: 'Nome do fluxo',
  /** `modules.ui.uploadButton.title` — o rótulo dentro do círculo tracejado. */
  definirImagem: 'Definir imagem',
  /** `createApplication.name.back` */
  voltar: 'Voltar',
} as const;

/** `createApplication.errorMsg.*`, um por um — aqui sem nenhuma reescrita. */
export const RECADOS = {
  /** `errorMsg.title` — o título do aviso vermelho deles. */
  titulo: 'Ops... algo estranho aconteceu...',
  /**
   * `errorMsg.invalidName`.
   *
   * Na origem esta frase NUNCA aparece: `validateApplicationName` lança com
   * passo `DataValidation`, e o controlador traduz `DataValidation` para
   * `errorMsg.2` ("Este nome não é válido."), que não diz o que fazer. Usamos a
   * frase que explica a regra; a vaga fica sem uso, como lá.
   */
  comecoInvalido: 'O nome de seu fluxo não pode começar com números ou caracteres especiais.',
  /** Derivado de `ng-minlength="2"` / `ng-maxlength="30"`. */
  tamanho: `O nome do fluxo precisa ter entre ${TAMANHO.nomeMin} e ${TAMANHO.nomeMax} caracteres.`,
  /**
   * `errorMsg.1` — "Experimente usar outro nome" é literal, e é a pista de que
   * o nome é único: o `shortName` sai dele, e dois iguais colidem no serviço.
   */
  nomeEmUso: 'Houve um erro na criação do seu fluxo. Experimente usar outro nome.',
  /** Nossa, sem correspondente: lá a permissão some o botão antes de chegar aqui. */
  semPermissao: 'Você não tem permissão para criar fluxos nesta conta.',
} as const;
