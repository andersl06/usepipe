/**
 * The Webhook form's rules — what the origin's `WebhookController` (portal.js) decides, with no screen nearby, so the test locks it down.
 *
 *   addUrl():      `this.urls.length >= 10 || (this.urls = this.urls.concat([""]))`
 *   removeUrl(i):  removes row `i`; with zero rows the integration is disabled
 *   isUrlValid(e): length ≤ 512, matches the HTTPS regex, and isn't repeated in the list
 *   handleSwitchBehavior(): the "Ativar" switch stays disabled when any URL is invalid or the first one is empty
 *   shouldDisableSave(): any invalid URL (the other branches depend on feature flags for dispatch types and headers)
 */

export const LIMITE_URLS = 10;

/** The origin's regex (`VY`), verbatim: HTTPS only, host with a 2-to-5-letter TLD. */
const URL_HTTPS =
  /^(https:\/\/)[a-z0-9]+[a-z0-9-]*([-.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?/;

export function adicionarUrl(urls: readonly string[]): string[] {
  return urls.length >= LIMITE_URLS ? [...urls] : [...urls, ''];
}

export function removerUrl(urls: readonly string[], indice: number): string[] {
  return urls.filter((_, position) => position !== indice);
}

export function urlValida(url: string, urls: readonly string[]): boolean {
  const tamanhoOk = url.length <= 512;
  const formatOk = URL_HTTPS.test(url);
  const unica = urls.filter((outra) => outra === url).length === 1;
  return tamanhoOk && formatOk && unica;
}

/** `validateUrls()` on load: an empty row counts as valid until it's touched. */
export function validarUrls(urls: readonly string[]): boolean[] {
  return urls.map((url) => url === '' || urlValida(url, urls));
}

export function salvarDesabilitado(urls: readonly string[]): boolean {
  return validarUrls(urls).some((ok) => !ok);
}
