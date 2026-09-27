/**
 * Current and available accounts go through `api`; this front never touches the DB. `onboarding_concluido_em` and account switching issue sessions, identity rules owned by the API. The screen only displays and submits.
 */

export interface AccountInForce {
  id: string;
  name: string;
  slug: string;
  plan: string;
  site: string | null;
  employees: string | null;
  city: string | null;
  state: string | null;
  pais: string | null;
  phone: string | null;
  optinWhatsapp: boolean;
  /** Reference Preferences tab holds account language and timezone. */
  idioma: string;
  fuso: string;
  onboardingConcluidoEm: string | null;
  faixasDeFuncionarios: readonly string[];
  idiomas: readonly string[];
  fusos: readonly string[];
}

export interface AccountInList {
  tenantId: string;
  name: string;
  slug: string;
  plan: string;
  inForce: boolean;
  onboardingCompleted: boolean;
  /**
   * A PERSONAL account is self-service and not yet a contract. The `api` criterion is ZERO verified domains: contract owners publish a company DNS TXT record, while self-service users have not. This mirrors reference contract (with `tenant.id`) versus personal space (without); render them differently in the selector.
   */
  personal: boolean;
}
