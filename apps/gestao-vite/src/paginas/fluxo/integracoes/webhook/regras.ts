/**
 * As regras do formulário do Webhook — o que o controlador `WebhookController`
 * da origem (portal.js) decide, sem a tela por perto, para o teste travar.
 *
 *   addUrl():      `this.urls.length >= 10 || (this.urls = this.urls.concat([""]))`
 *   removeUrl(i):  tira a linha `i`; com zero linhas a integração é desativada
 *   isUrlValid(e): tamanho ≤ 512, casa a regex de HTTPS e não repete na lista
 *   handleSwitchBehavior(): o interruptor "Ativar" fica desabilitado quando
 *                  alguma URL é inválida ou a primeira está vazia
 *   shouldDisableSave(): alguma URL inválida (os outros ramos dependem de
 *                  feature flags de tipos de envio e cabeçalhos)
 */

export const LIMITE_URLS = 10;

/** A regex da origem (`VY`), tal qual: só HTTPS, host com TLD de 2 a 5 letras. */
const URL_HTTPS =
  /^(https:\/\/)[a-z0-9]+[a-z0-9-]*([-.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?/;

export function adicionarUrl(urls: readonly string[]): string[] {
  return urls.length >= LIMITE_URLS ? [...urls] : [...urls, ''];
}

export function removerUrl(urls: readonly string[], indice: number): string[] {
  return urls.filter((_, posicao) => posicao !== indice);
}

export function urlValida(url: string, urls: readonly string[]): boolean {
  const tamanhoOk = url.length <= 512;
  const formatoOk = URL_HTTPS.test(url);
  const unica = urls.filter((outra) => outra === url).length === 1;
  return tamanhoOk && formatoOk && unica;
}

/** `validateUrls()` no carregamento: linha vazia conta como válida até ser tocada. */
export function validarUrls(urls: readonly string[]): boolean[] {
  return urls.map((url) => url === '' || urlValida(url, urls));
}

export function interruptorDesabilitado(urls: readonly string[]): boolean {
  const semUrl = urls.length === 0 || urls[0] === '';
  return semUrl || validarUrls(urls).some((ok) => !ok);
}

export function salvarDesabilitado(urls: readonly string[]): boolean {
  return validarUrls(urls).some((ok) => !ok);
}
