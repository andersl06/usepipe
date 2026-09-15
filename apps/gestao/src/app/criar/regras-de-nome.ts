/**
 * As regras do nome do contato — as MESMAS para o roteador e para o fluxo.
 *
 * Este arquivo nasceu dentro de `roteador/regras.ts` e saiu de lá quando a tela
 * de criar fluxo chegou. A mudança não é arrumação: na origem as duas telas são
 * literalmente o MESMO template.
 *
 * O passo do nome é o módulo 96904, um só, e o que muda entre roteador e fluxo
 * são três `ng-if="$ctrl.template != 'master'"` trocando rótulo — o sobretítulo,
 * o título e o nome do campo. `required`, `ng-minlength="2"`, `ng-maxlength="30"`,
 * o `accept` do arquivo e o saneamento a cada tecla são os mesmos bytes para os
 * dois. Do lado do servidor, `validateApplicationName` é chamada de dentro de
 * `prepareApplicationData`, que roda para TODO template.
 *
 * Ou seja: regra de nome que divergisse entre as duas telas seria invenção
 * nossa. Por isso ela mora aqui, e cada tela só traz as próprias PALAVRAS.
 *
 * As peças do bundle do portal da origem (`portal.js`, `25.204.0-v0.43.1`):
 *
 * - `CreateApplicationController` (módulo 18502) — o saneamento em tempo real
 *   (`validateSpecialCharacter`) e os dois portões do envio;
 * - o template do passo do nome (módulo 96904) — os atributos do `<input>`;
 * - `CreateApplicationService.validateApplicationName` — `/(^[a-zA-Z])/`, a
 *   única regra que o servidor deles confere sozinho.
 *
 * Existe em arquivo, e não dentro da tela, porque precisa valer DUAS vezes: o
 * navegador barra (`required`, `minlength`, `maxlength`) e a Server Action barra
 * de novo, para quem mandar o POST por fora.
 */

/** Os tamanhos do campo de nome, direto dos atributos do `<input>` deles. */
export const TAMANHO = {
  nomeMin: 2,
  nomeMax: 30,
} as const;

/**
 * O seletor de imagem do passo do nome — o `<upload-button>` deles.
 *
 * Os tipos são os do template (módulo 96904), literais:
 *   `accept="'.gif, .png, .jpeg, .jpg'"`
 *   `ng-mime-type="image/png, image/jpg, image/jpeg, image/gif"`
 * `.jpg` e `.jpeg` são o MESMO MIME (`image/jpeg`), então a lista de tipos
 * reais tem TRÊS itens e a de extensões tem quatro.
 *
 * `maxBytes` é NOSSO, e a origem não tem correspondente: lá a foto vai para o
 * media store e a coluna guarda só a URL. Aqui ela é gravada como data URI na
 * própria coluna (ver `acoes.ts` de cada tela), então o teto protege a linha.
 * 256 KB de arquivo viram ~350 KB de texto em base64 — folgado para um avatar
 * que a tela desenha com 150px de diâmetro, e pequeno o bastante para a linha
 * continuar uma linha.
 */
export const IMAGEM = {
  /** O `accept` do `<input type="file">`, igual ao deles. */
  aceitos: ['.gif', '.png', '.jpeg', '.jpg'] as const,
  maxBytes: 262_144,
} as const;

/**
 * As assinaturas dos três tipos aceitos, nos primeiros bytes.
 *
 * Quem manda é o CONTEÚDO, nunca a extensão nem o `Content-Type`: os dois são
 * texto que quem envia escreveu. A versão canônica desta tabela — com os
 * quinze formatos do anexo — vive em `packages/armazenamento/src/tipo-real.ts`;
 * aqui ela está copiada em três linhas porque aquele pacote publica por `dist`
 * e puxá-lo para o Next custa uma etapa de build só por causa deste `if`.
 *
 * ponytail: tabela de três assinaturas; se estas telas passarem a aceitar mais
 * formato, troque pelo `tipoReal` de `@pipe/armazenamento`.
 */
const ASSINATURAS: readonly (readonly [string, readonly number[]])[] = [
  ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/gif', [0x47, 0x49, 0x46, 0x38]],
] as const;

/** O MIME que os bytes revelam, ou `null` quando não é nenhum dos três. */
export function tipoRealDaImagem(dados: Uint8Array): string | null {
  for (const [mime, bytes] of ASSINATURAS) {
    if (dados.length < bytes.length) continue;
    if (bytes.every((esperado, i) => dados[i] === esperado)) return mime;
  }
  return null;
}

/**
 * O saneamento que a origem aplica a CADA TECLA (`ng-change` chamando
 * `validateSpecialCharacter`, que passa o valor pelo regex abaixo e reescreve
 * o campo).
 *
 * A classe permitida é literalmente `a-zA-Z0-9[]()_ -` — ou seja, sem acento.
 * "Fluxo Padrão" vira "Fluxo Padro" enquanto a pessoa digita, e não há aviso
 * nenhum. Não é regra de negócio: é o filtro caindo sobre um alfabeto que não é
 * o do idioma da tela. Copiamos o filtro porque ele protege o `shortName` (ver
 * `nomeCurto` abaixo), mas ACRESCENTAMOS as letras acentuadas do português —
 * copiar defeito não é copiar disposição.
 */
const PROIBIDOS = /[^a-zA-ZÀ-ÿ0-9[\]() _-]/g;

/**
 * A primeira letra tem de ser LETRA.
 *
 * `validateApplicationName` deles: `if (!/(^[a-zA-Z])/.exec(e)) throw …`. O
 * porquê está na linha anterior do serviço — `shortName = name.toLowerCase()`,
 * e o `shortName` é o identificador do contato na plataforma. Identificador que
 * começa com dígito ou com `(` não vira endereço.
 */
const COMECA_COM_LETRA = /^[a-zA-ZÀ-ÿ]/;

/** Tira do nome tudo o que a origem tira, a cada tecla. */
export function limparNome(bruto: string): string {
  return bruto.replace(PROIBIDOS, '');
}

/**
 * O `shortName` da origem: `application.shortName = application.name.toLowerCase()`.
 *
 * Divergência anotada: lá isso deixa espaços dentro do identificador (o nome
 * "Meu Fluxo" viraria `meu fluxo`), e nenhum dos `shortName` que vimos em conta
 * real tem espaço — sinal de que quem limpa é o serviço do outro lado, que não
 * temos. Aqui os espaços viram hífen antes de gravar, para o identificador ser
 * sempre utilizável num endereço.
 *
 * Desde a migração `0020` ele É GRAVADO, na coluna `fluxo.short_name`. SEM
 * índice único: quem garante nome sem repetição continua sendo o `select` da
 * Server Action, sobre `nome`. Um índice aqui faria "Meu Bot" e "meu-bot"
 * colidirem, que é regra nova e não é cópia de nada.
 */
export function nomeCurto(nome: string): string {
  return limparNome(nome).trim().toLowerCase().replace(/\s+/g, '-');
}

/** O que a Server Action devolve quando recusa. */
export interface Recusa {
  motivo: string;
}

/**
 * As duas frases que `conferir` pode devolver.
 *
 * Vêm de fora porque são a ÚNICA parte da regra que muda entre as telas: a
 * origem tem `errorMsg.invalidName` escrita com a palavra "fluxo" e a tela do
 * roteador troca para "roteador". A regra é a mesma; o substantivo não.
 */
export interface RecadosDoNome {
  tamanho: string;
  comecoInvalido: string;
}

/**
 * Confere o nome — na MESMA ordem da origem.
 *
 * Lá são dois portões em sequência: o formulário (`validApplicationFormErrors`,
 * que só olha `required`/`minlength`/`maxlength`) e, depois do clique, o
 * serviço (`validateApplicationName`). Por isso tamanho vem antes de começo.
 *
 * Devolve a PRIMEIRA recusa: o `checkFormValidity` deles também para no
 * primeiro campo inválido.
 */
export function conferir(nome: string, recados: RecadosDoNome): Recusa | null {
  const limpo = limparNome(nome).trim();

  if (limpo.length < TAMANHO.nomeMin || limpo.length > TAMANHO.nomeMax) {
    return { motivo: recados.tamanho };
  }
  if (!COMECA_COM_LETRA.test(limpo)) {
    return { motivo: recados.comecoInvalido };
  }
  return null;
}
