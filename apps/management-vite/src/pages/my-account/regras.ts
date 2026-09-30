/**
 * The account form's rules — the same on screen and on the server.
 *
 * They live in a single file because they need to hold twice: the browser blocks (`required`, `minlength`, `pattern` attributes) and the server action blocks again, for whoever sends the POST from outside. A rule written twice is a rule that diverges at the first tweak.
 *
 * The numbers come from the source platform's `lib/AccountIndex.js`, where each field is a `BlipInput` with `minLength`/`maxLength`/`required` declared.
 */

/** Source sizes, with one noted exception. */
export const TAMANHO = {
  /*
   * 6 is the source's minimum. Its maximum there is 250, but our `api` truncates at 120 when saving (`texto(corpo['nome'], 120)`): accepting 250 here would save a truncated name without telling anyone. The smaller of the two wins until the `api` changes.
   */
  nomeMin: 6,
  nomeMax: 120,
  siteMin: 3,
  siteMax: 50,
  telefoneMax: 40,
  cidadeMax: 120,
  paisMax: 60,
} as const;

/**
 * The source's site regex, copied character for character.
 *
 * One change: the classes gained `A-Z`. The original only accepts lowercase and has no `i` flag, so `Empresa.com.br` is refused there — a defect, not a rule, and copying a defect isn't copying intent.
 */
export const PADRAO_DE_SITE =
  '(http://www\\.|https://www\\.|http://|https://)?[a-zA-Z0-9]+([\\-\\.]{1}[a-zA-Z0-9]+)*\\.[a-zA-Z]{2,8}(:[0-9]{1,5})?(/.*)?';

/** The source's three languages, with the name it gives each one. */
export const ROTULO_DE_IDIOMA: Record<string, string> = {
  'pt-BR': 'Português (BR)',
  'en-US': 'Inglês',
  'es-ES': 'Espanhol',
};

/**
 * Timezones, written as the source writes them: offset in parentheses and the city at the end. Whoever picks a timezone looks for the city, not the IANA name.
 */
export const ROTULO_DE_FUSO: Record<string, string> = {
  'America/Sao_Paulo': '(UTC-03:00) Brasília, São Paulo',
  'America/Bahia': '(UTC-03:00) Salvador',
  'America/Fortaleza': '(UTC-03:00) Fortaleza',
  'America/Recife': '(UTC-03:00) Recife',
  'America/Belem': '(UTC-03:00) Belém',
  'America/Manaus': '(UTC-04:00) Manaus',
  'America/Campo_Grande': '(UTC-04:00) Campo Grande',
  'America/Cuiaba': '(UTC-04:00) Cuiabá',
  'America/Porto_Velho': '(UTC-04:00) Porto Velho',
  'America/Boa_Vista': '(UTC-04:00) Boa Vista',
  'America/Rio_Branco': '(UTC-05:00) Rio Branco',
  'America/Noronha': '(UTC-02:00) Fernando de Noronha',
};

/** Os recados de erro, um por campo, no tom dos da origem. */
export const RECADOS = {
  nome: `Informe um nome entre ${TAMANHO.nomeMin} e ${TAMANHO.nomeMax} caracteres.`,
  telefone: 'Informe um telefone válido.',
  site: 'Informe um site válido.',
  funcionarios: 'Escolha uma das faixas da lista.',
  idioma: 'Escolha um dos idiomas da lista.',
  fuso: 'Escolha um dos fusos da lista.',
} as const;

/** What the server action returns on refusal: the field and the reason. */
export interface Recusa {
  campo: keyof typeof RECADOS;
  motivo: string;
}

/**
 * Checks whatever can be checked with what we have.
 *
 * Returns the FIRST refusal, as in the source: its `checkFormValidity` also stops at the first invalid field, and a screen that flags seven errors at once isn't more honest, just noisier.
 */
export function conferir(data: {
  nome: string;
  telefone: string;
  site: string;
  funcionarios: string;
  idioma: string;
  fuso: string;
  faixas: readonly string[];
  idiomas: readonly string[];
  fusos: readonly string[];
}): Recusa | null {
  const nome = data.nome.trim();
  if (nome.length < TAMANHO.nomeMin || nome.length > TAMANHO.nomeMax) {
    return { campo: 'nome', motivo: RECADOS.nome };
  }

  /*
   * The source uses `libphonenumber.isPossible` with the account's locale. Without that library here, the ruler is the E.164 standard: 8 to 15 digits, a plus sign and separators as wanted. It blocks the empty field and the truncated number, which is what its validation catches in practice; it can't tell that 21 9 9999 9999 doesn't exist in Rio.
   */
  const digitos = data.telefone.replace(/\D/g, '');
  if (digitos.length < 8 || digitos.length > 15) {
    return { campo: 'telefone', motivo: RECADOS.telefone };
  }

  const site = data.site.trim();
  if (site.length < TAMANHO.siteMin || site.length > TAMANHO.siteMax) {
    return { campo: 'site', motivo: RECADOS.site };
  }
  if (!new RegExp(`^(?:${PADRAO_DE_SITE})$`).test(site)) {
    return { campo: 'site', motivo: RECADOS.site };
  }

  /*
   * Closed lists: whoever sends text outside them is POSTing outside the screen. The `api` checks again, and all three lists come from there — a local copy of them would go stale on the wrong side.
   */
  const foraDaLista = (value: string, lista: readonly string[]) => value && !lista.includes(value);
  if (foraDaLista(data.funcionarios, data.faixas)) {
    return { campo: 'funcionarios', motivo: RECADOS.funcionarios };
  }
  if (foraDaLista(data.idioma, data.idiomas)) {
    return { campo: 'idioma', motivo: RECADOS.idioma };
  }
  if (foraDaLista(data.fuso, data.fusos)) {
    return { campo: 'fuso', motivo: RECADOS.fuso };
  }

  return null;
}
