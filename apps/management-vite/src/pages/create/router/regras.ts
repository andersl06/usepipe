/**
 * As PALAVRAS da tela "criar roteador" — e só elas.
 *
 * A mecânica do nome (tamanho, saneamento, `shortName`, tipos de imagem) mora
 * em `../regras-de-nome.ts`, compartilhada com a tela de criar fluxo: na origem
 * as duas usam o mesmo template do passo do nome (módulo 96904), e o que muda
 * entre elas são três `ng-if="$ctrl.template != 'master'"` trocando rótulo.
 *
 * Os rótulos abaixo são os do arquivo de tradução deles (chave
 * `createApplication`, bloco `pt-BR`), copiados palavra por palavra. Onde
 * mudamos, está anotado.
 */

import { TAMANHO } from '../regras-de-nome';

/**
 * Os rótulos, com a chave da origem ao lado. Nada aqui é escrito por nós.
 *
 * A única troca sistemática: onde a chave é compartilhada com a criação de
 * fluxo e o texto diz "fluxo" mesmo estando na tela do roteador, escrevemos
 * "roteador". É o caso de `errorMsg.1` e de `errorMsg.invalidName` — a tela
 * deles mostra "Houve um erro na criação do seu FLUXO" para quem acabou de
 * clicar em "Criar roteador".
 */
export const ROTULOS = {
  /** `createApplication.taglineRouter` — serve de sobretítulo E de botão. */
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
  /** `modules.ui.uploadButton.title` — o rótulo dentro do círculo tracejado. */
  definirImagem: 'Definir imagem',
  /** `createApplication.name.back` */
  voltar: 'Voltar',
} as const;

/** `createApplication.errorMsg.*`, um por um. */
export const RECADOS = {
  /** `errorMsg.title` — o título do aviso vermelho deles. */
  titulo: 'Ops... algo estranho aconteceu...',
  /**
   * `errorMsg.invalidName`.
   *
   * Na origem esta frase NUNCA aparece nesta tela: `validateApplicationName`
   * lança com passo `DataValidation`, e o controlador traduz `DataValidation`
   * para `errorMsg.2` ("Este nome não é válido."), que não diz o que fazer.
   * Usamos a frase que explica a regra; a vaga fica sem uso, como lá.
   */
  comecoInvalido: 'O nome do seu roteador não pode começar com números ou caracteres especiais.',
  /** Derivado de `ng-minlength="2"` / `ng-maxlength="30"`. */
  tamanho: `O nome do roteador precisa ter entre ${TAMANHO.nomeMin} e ${TAMANHO.nomeMax} caracteres.`,
  /**
   * `errorMsg.1` — "Experimente usar outro nome" é literal, e é a pista de que
   * o nome é único: o `shortName` sai dele, e dois iguais colidem no serviço.
   */
  nomeEmUso: 'Houve um erro na criação do seu roteador. Experimente usar outro nome.',
  /** Nossa, sem correspondente: lá a permissão some o botão antes de chegar aqui. */
  semPermissao: 'Você não tem permissão para criar roteadores nesta conta.',
} as const;
