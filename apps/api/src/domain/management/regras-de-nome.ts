/**
 * Share contact-name rules between router and flow because Blip uses the SAME creation template for both. Source name step module 96904 changes only labels through three `ng-if="$ctrl.template != 'master'"`; `required`, 2–30 length, file `accept` and per-key sanitization are identical. Server `validateApplicationName` runs through `prepareApplicationData` for every template. Evidence: source `portal.js` 25.204.0-v0.43.1 modules `CreateApplicationController` (18502), name template (96904), and `CreateApplicationService.validateApplicationName`. Keep the rules outside either screen and enforce them both in browser validation and the Server Action against direct POSTs.
 */

/** Os tamanhos do campo de nome, direto dos atributos do `<input>` deles. */
export const TAMANHO = {
  nomeMin: 2,
  nomeMax: 30,
} as const;

/**
 * Source name-step `<upload-button>` (module 96904) accepts literal `accept="'.gif, .png, .jpeg, .jpg'"` and `ng-mime-type="image/png, image/jpg, image/jpeg, image/gif"`. `.jpg` and `.jpeg` share `image/jpeg`, so four extensions mean three real MIME types. Pipe's `maxBytes` has no source counterpart: Blip stores a media URL, while Pipe stores a data URI in the row (`acoes.ts`), so a 256 KB file expands to about 350 KB base64 while remaining adequate for a 150px avatar.
 */
export const IMAGE = {
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
 * formato, troque pelo `tipoReal` de `@pipe/storage`.
 */
const ASSINATURAS: readonly (readonly [string, readonly number[]])[] = [
  ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/gif', [0x47, 0x49, 0x46, 0x38]],
] as const;

/** MIME determined from bytes, or `null` if none of the three signatures match. */
export function typeRealOfImage(data: Uint8Array): string | null {
  for (const [mime, bytes] of ASSINATURAS) {
    if (data.length < bytes.length) continue;
    if (bytes.every((esperado, i) => data[i] === esperado)) return mime;
  }
  return null;
}

/**
 * Blip sanitizes on EVERY keystroke with `ng-change` and `validateSpecialCharacter`. Its allowed class `a-zA-Z0-9[]()_ -` excludes accents, silently turning 'Fluxo Padrão' into 'Fluxo Padro'. Pipe retains filtering to protect `shortName` (`nomeCurto`) but adds Portuguese accented letters; reproducing the source bug is unnecessary.
 */
const PROIBIDOS = /[^a-zA-ZÀ-ÿ0-9[\]() _-]/g;

/**
 * Require a LETTER first. Source `validateApplicationName` uses `/(^[a-zA-Z])/` because `shortName = name.toLowerCase()` becomes the platform contact identifier; a digit or `(` cannot start that address.
 */
const COMECA_COM_LETRA = /^[a-zA-ZÀ-ÿ]/;

/** Apply the source's per-keystroke name sanitization. */
export function limparNome(bruto: string): string {
  return bruto.replace(PROIBIDOS, '');
}

/**
 * Source `application.shortName = application.name.toLowerCase()` would leave spaces (e.g. 'Meu Fluxo' to `meu fluxo`), though observed real short names have none; an unseen downstream service likely normalizes them. Pipe replaces spaces with hyphens before saving `fluxo.short_name` (migration `0020`) so addresses work. D-52 makes this the collision key: `nomeEmUso` compares `nomeCurto` results, not raw `nome`, and `fluxo_short_name_vivo_uk` (migration `0051`) enforces it in the database — 'Meu Bot' and 'meu-bot' can no longer both be live in the same tenant.
 */
export function nomeCurto(nome: string): string {
  return limparNome(nome).trim().toLowerCase().replace(/\s+/g, '-');
}


export interface Recusa {
  motivo: string;
}

/**
 * `conferir` returns one of two screen-supplied sentences. Source `errorMsg.invalidName` says 'fluxo' while the router screen says 'roteador'; the rule stays identical and only the noun changes.
 */
export interface RecadosDoNome {
  tamanho: string;
  comecoInvalido: string;
}

/**
 * Validate names in source order: form `validApplicationFormErrors` checks required/min/max length before service `validateApplicationName` checks the first letter. Return the FIRST refusal, as source `checkFormValidity` stops at the first invalid field.
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
