/**
 * Portado de chatwoot/chatwoot (MIT):
 * - app/services/whatsapp/phone_normalizers/base_phone_normalizer.rb
 * - app/services/whatsapp/phone_normalizers/brazil_phone_normalizer.rb
 * - `phone_number_candidates` de app/services/whatsapp/phone_number_normalization_service.rb
 *
 * O nono dígito do Brasil. Em 2012–2016 a Anatel pôs um "9" na frente de todo
 * celular, e o mesmo cliente existe nas duas formas: na planilha antiga, no
 * cadastro de outro sistema e — o caso que mais custa — no `wa_id` que a própria
 * Meta manda, que em conta antiga ainda vem sem o 9.
 *
 * A regra do original, e a razão de ela ser estreita: o 9 só entra em número de
 * oito dígitos que começa com 6, 7, 8 ou 9 (a faixa antiga de celular). Fixo
 * começa com 2 a 5 e fica como está — pôr um 9 num fixo é criar o telefone de
 * outra pessoa.
 *
 * Só o Brasil, dos três países do original. A lista de normalizadores é a
 * estrutura de lá justamente para Argentina e México entrarem acrescentando, e
 * não reescrevendo.
 *
 * `paraE164`, no fim, NÃO é porte: é o que o Pipe acrescenta para telefone
 * digitado por gente (CSV de planilha brasileira).
 */

export interface NormalizadorDeTelefone {
  /** `handles_country?` */
  atendePais(waid: string): boolean;
  /** `normalize`: a forma canônica. */
  normalizar(waid: string): string;
  /** `variants`: as formas em que o contato pode já estar guardado, a canônica primeiro. */
  variantes(waid: string): string[];
  /** `contact_candidates`: a forma recebida primeiro, para o casamento exato ganhar. */
  candidatosDeContato(waid: string): string[];
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

  candidatosDeContato(waid: string): string[] {
    return [...new Set([waid, ...this.variantes(waid)])];
  }

  /** O espelho de `normalizar`: tira o 9 só quando o que sobra é faixa antiga de celular, nunca fixo. */
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

/** `phone_number_candidates`: sem normalizador para o país, só a própria forma. */
export function candidatosDoTelefone(digitos: string): string[] {
  const normalizador = normalizadorDoPais(digitos);
  return normalizador ? normalizador.candidatosDeContato(digitos) : [digitos];
}

export function normalizarWaid(digitos: string): string {
  const normalizador = normalizadorDoPais(digitos);
  return normalizador ? normalizador.normalizar(digitos) : digitos;
}

/** O formato que o `Contact` do Chatwoot valida: `/\A\+[1-9]\d{1,14}\z/`. */
export const FORMATO_E164 = /^\+[1-9]\d{1,14}$/;

/**
 * Telefone como gente digita → E.164 canônico. Acréscimo do Pipe.
 *
 * - tira espaço, hífen, ponto e parêntese;
 * - sem `+`, tira o zero de tronco da frente, e número com 10 ou 11 dígitos
 *   (DDD + telefone, a forma brasileira de escrever) ganha o DDI padrão;
 * - aplica o nono dígito.
 *
 * Não valida: quem valida é `FORMATO_E164`, para a recusa sair com o motivo.
 * Vazio devolve `null` — "sem telefone" é diferente de "telefone inválido".
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
