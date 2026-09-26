/**
 * The contact-name rules — the SAME for router and flow.
 *
 * This file was born inside `roteador/regras.ts` and moved out when the create-flow
 * screen arrived. The split isn't tidying: in the source the two screens are
 * literally the SAME template.
 *
 * The name step is module 96904, a single one, and what changes between router and
 * flow are three `ng-if="$ctrl.template != 'master'"` swapping labels — the
 * overline, the title, and the field name. `required`, `ng-minlength="2"`,
 * `ng-maxlength="30"`, the file `accept`, and the per-keystroke sanitization are the
 * same bytes for both. Server-side, `validateApplicationName` is called from inside
 * `prepareApplicationData`, which runs for EVERY template.
 *
 * In other words: a name rule that diverged between the two screens would be our
 * own invention. That's why it lives here, and each screen only brings its own
 * WORDS.
 *
 * The pieces from the source portal bundle (`portal.js`, `25.204.0-v0.43.1`):
 *
 * - `CreateApplicationController` (module 18502) — the real-time sanitization
 *   (`validateSpecialCharacter`) and the two submission gates;
 * - the name-step template (module 96904) — the `<input>` attributes;
 * - `CreateApplicationService.validateApplicationName` — `/(^[a-zA-Z])/`, the
 *   only rule their server checks by itself.
 *
 * It exists as its own file, not inside the screen, because it must hold TWICE: the
 * browser blocks it (`required`, `minlength`, `maxlength`) and the Server Action
 * blocks it again, for anyone who posts outside the browser.
 */

/** Os tamanhos do campo de nome, direto dos atributos do `<input>` deles. */
export const TAMANHO = {
  nomeMin: 2,
  nomeMax: 30,
} as const;

/**
 * The image picker for the name step — their `<upload-button>`.
 *
 * The types are the template's (module 96904), literal:
 *   `accept="'.gif, .png, .jpeg, .jpg'"`
 *   `ng-mime-type="image/png, image/jpg, image/jpeg, image/gif"`
 * `.jpg` and `.jpeg` are the SAME MIME type (`image/jpeg`), so the real-type list
 * has THREE items while the extension list has four.
 *
 * `maxBytes` is OURS, with no counterpart in the source: there the photo goes to
 * the media store and the column only holds the URL. Here it's stored as a data
 * URI in the column itself (see each screen's `acoes.ts`), so the cap protects the
 * row. A 256 KB file becomes ~350 KB of base64 text — generous for an avatar the
 * screen draws at 150px diameter, and small enough for the row to stay a single
 * row.
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

/** The MIME type revealed by the bytes, or `null` when it's none of the three. */
export function imageTypeReal(data: Uint8Array): string | null {
  for (const [mime, bytes] of ASSINATURAS) {
    if (data.length < bytes.length) continue;
    if (bytes.every((esperado, i) => data[i] === esperado)) return mime;
  }
  return null;
}

/**
 * The sanitization the source applies on EVERY KEYSTROKE (`ng-change` calling
 * `validateSpecialCharacter`, which runs the value through the regex below and
 * rewrites the field).
 *
 * The allowed character class is literally `a-zA-Z0-9[]()_ -` — that is, no
 * accents. "Fluxo Padrão" becomes "Fluxo Padro" as the person types, with no
 * warning at all. It isn't a business rule: it's the filter falling on an alphabet
 * that isn't the screen's language. We copy the filter because it protects
 * `shortName` (see `nomeCurto` below), but we ADD the accented Portuguese
 * letters — copying a defect isn't copying an intent.
 */
const PROIBIDOS = /[^a-zA-ZÀ-ÿ0-9[\]() _-]/g;

/**
 * The first character must be a LETTER.
 *
 * Their `validateApplicationName`: `if (!/(^[a-zA-Z])/.exec(e)) throw …`. The why
 * is in the previous line of their service — `shortName = name.toLowerCase()`, and
 * `shortName` is the contact's identifier on the platform. An identifier starting
 * with a digit or with `(` doesn't become a valid address.
 */
const COMECA_COM_LETRA = /^[a-zA-ZÀ-ÿ]/;

/** Strips from the name everything the source strips, on every keystroke. */
export function limparNome(bruto: string): string {
  return bruto.replace(PROIBIDOS, '');
}

/**
 * The source's `shortName`: `application.shortName = application.name.toLowerCase()`.
 *
 * Noted divergence: there this leaves spaces inside the identifier (the name
 * "Meu Fluxo" would become `meu fluxo`), and none of the `shortName` values we've
 * seen on a real account has a space — a sign that the cleanup happens in the
 * other side's service, which we don't have. Here spaces become hyphens before
 * saving, so the identifier is always usable in a URL.
 *
 * Since migration `0020` it IS PERSISTED, in column `fluxo.short_name`. WITHOUT a
 * unique index: what guarantees a non-duplicate name is still the Server Action's
 * `select` over `nome`. An index here would make "Meu Bot" and "meu-bot" collide,
 * which is a new rule and not a copy of anything.
 */
export function nomeCurto(nome: string): string {
  return limparNome(nome).trim().toLowerCase().replace(/\s+/g, '-');
}

/** What the Server Action returns when it refuses. */
export interface Recusa {
  motivo: string;
}

/**
 * The two phrases `conferir` can return.
 *
 * They come from outside because they're the ONLY part of the rule that changes
 * between screens: the source has `errorMsg.invalidName` written with the word
 * "fluxo" and the router screen swaps it for "roteador". The rule is the same; the
 * noun isn't.
 */
export interface RecadosDoNome {
  tamanho: string;
  comecoInvalido: string;
}

/**
 * Validates the name — in the SAME order as the source.
 *
 * There it's two gates in sequence: the form (`validApplicationFormErrors`, which
 * only checks `required`/`minlength`/`maxlength`) and, after the click, the service
 * (`validateApplicationName`). That's why length comes before the starting
 * character.
 *
 * Returns the FIRST rejection: their `checkFormValidity` also stops at the first
 * invalid field.
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
