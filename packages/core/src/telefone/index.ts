/**
 * Ported from chatwoot/chatwoot (MIT): app/services/whatsapp/phone_normalizers/base_phone_normalizer.rb, app/services/whatsapp/phone_normalizers/brazil_phone_normalizer.rb, and `phone_number_candidates` from app/services/whatsapp/phone_number_normalization_service.rb. Brazil added the ninth mobile digit in 2012–2016. The same customer may still appear in both forms, including old spreadsheets, other systems, and Meta `wa_id` values from older accounts. The original rule is narrow: add 9 only to eight-digit numbers starting with 6, 7, 8, or 9, the old mobile range. Landlines start with 2–5 and must remain unchanged; adding 9 could identify another person. Only Brazil is implemented of the source's three countries; its normalizer list allows Argentina and Mexico to be added without rewriting. `paraE164` is a Pipe addition for human-entered Brazilian CSV numbers, not a port.
 */

export interface NormalizadorDeTelefone {
  /** `handles_country?` */
  atendePais(waid: string): boolean;
  /** `normalize`: canonical form. */
  normalizar(waid: string): string;
  /** `variants`: stored forms of this contact, canonical first. */
  variantes(waid: string): string[];
  /** `contact_candidates`: received form first so an exact match wins. */
  contactCandidates(waid: string): string[];
}

const TAMANHO_DO_DDI = 2;
const TAMANHO_DO_DDD = 2;
const MOVEL_ANTIGO = /^[6-9]\d{7}$/;
const MOVEL_CANONICO = /^9([6-9]\d{7})$/;

export class NormalizadorBrasil implements NormalizadorDeTelefone {
  atendePais(waid: string): boolean {
    return /^55/.test(waid);
  }

  normalizar(waid: string): string {
    if (!this.atendePais(waid)) return waid;
    const ddd = waid.slice(TAMANHO_DO_DDI, TAMANHO_DO_DDI + TAMANHO_DO_DDD);
    const numero = this.assinante(waid);
    if (!MOVEL_ANTIGO.test(numero)) return waid;
    return `55${ddd}9${numero}`;
  }

  variantes(waid: string): string[] {
    const normalizado = this.normalizar(waid);
    const antigo = this.formaAntiga(normalizado);
    return [...new Set(antigo ? [normalizado, antigo] : [normalizado])];
  }

  contactCandidates(waid: string): string[] {
    return [...new Set([waid, ...this.variantes(waid)])];
  }

  /** Mirror of `normalizar`: remove 9 only when the remainder is an old mobile range, never a landline. */
  private formaAntiga(waid: string): string | null {
    if (!this.atendePais(waid)) return null;
    const achado = this.assinante(waid).match(MOVEL_CANONICO);
    if (!achado) return null;
    return `55${waid.slice(TAMANHO_DO_DDI, TAMANHO_DO_DDI + TAMANHO_DO_DDD)}${achado[1]}`;
  }

  private assinante(waid: string): string {
    return waid.slice(TAMANHO_DO_DDI + TAMANHO_DO_DDD);
  }
}

const NORMALIZADORES: readonly NormalizadorDeTelefone[] = [new NormalizadorBrasil()];

function normalizadorDoPais(digitos: string): NormalizadorDeTelefone | null {
  return NORMALIZADORES.find((n) => n.atendePais(digitos)) ?? null;
}

/** `phone_number_candidates`: with no normalizer for the country, return only the input form. */
export function candidatosDoTelefone(digitos: string): string[] {
  const normalizador = normalizadorDoPais(digitos);
  return normalizador ? normalizador.contactCandidates(digitos) : [digitos];
}

export function normalizarWaid(digitos: string): string {
  const normalizador = normalizadorDoPais(digitos);
  return normalizador ? normalizador.normalizar(digitos) : digitos;
}

/** E.164 format validated by Chatwoot `Contact`. */
export const FORMAT_E164 = /^\+[1-9]\d{1,14}$/;

/**
 * Convert human-entered phone numbers to canonical E.164; this is a Pipe addition. Remove spaces, hyphens, periods, and parentheses. Without `+`, remove a leading trunk zero; a 10- or 11-digit Brazilian DDD plus number gets the default country code. Apply Brazil's ninth mobile digit. Do not validate here: `FORMATO_E164` validates so refusal can explain why. Empty input returns null because no phone differs from an invalid phone.
 */
export function paraE164(cru: string | null | undefined, ddiPadrao = '55'): string | null {
  const limpo = (cru ?? '').trim();
  if (!limpo) return null;
  let digitos = limpo.replace(/\D/g, '');
  if (!limpo.startsWith('+')) {
    digitos = digitos.replace(/^0+/, '');
    if (digitos.length === 10 || digitos.length === 11) digitos = `${ddiPadrao}${digitos}`;
  }
  return `+${normalizarWaid(digitos)}`;
}
