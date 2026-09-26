/**
 * Current and available accounts go through `api`; this front never touches the DB. `onboarding_concluido_em` and account switching issue sessions, identity rules owned by the API. The screen only displays and submits.
 */

export interface AccountInVigor {
  id: string;
  nome: string;
  slug: string;
  plano: string;
  site: string | null;
  funcionarios: string | null;
  city: string | null;
  state: string | null;
  pais: string | null;
  telefone: string | null;
  optinWhatsapp: boolean;
  /** Reference Preferences tab holds account language and timezone. */
  idioma: string;
  fuso: string;
  onboardingConcluidoEm: string | null;
  faixasDeFuncionarios: readonly string[];
  idiomas: readonly string[];
  fusos: readonly string[];
}

export interface AccountInLista {
  tenantId: string;
  nome: string;
  slug: string;
  plano: string;
  emVigor: boolean;
  onboardingConcluido: boolean;
  /**
   * A PERSONAL account is self-service and not yet a contract. The `api` criterion is ZERO verified domains: contract owners publish a company DNS TXT record, while self-service users have not. This mirrors reference contract (with `tenant.id`) versus personal space (without); render them differently in the selector.
   */
  pessoal: boolean;
}
