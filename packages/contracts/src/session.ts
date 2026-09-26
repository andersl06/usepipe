/**
 * Session contract shared by the `api` and four front ends. A single definition of the logged-in user exposes field-name divergence when fields change.
 */

/** `GET /v1/eu` response, the source of truth for the logged-in user. */
export interface Eu {
  user: {
    id: string;
    nome: string;
    email: string;
    avatarUrl: string | null;
  };
  tenant: {
    id: string;
    nome: string;
    slug: string;
    plano: Plano;
    /**
     * False until the account has completed "minha conta". Every logged-in screen needs this in `Eu` to send accounts missing company details to onboarding rather than the product. Fetching it separately would add a network request per screen, while the `Eu` query already reads the tenant row.
     */
    onboardingConcluido: boolean;
  };
  /** Catalog permission codes; the screen hides features absent from this list. */
  permissions: string[];
  /** Login origin, shown on the account screen and used by audit. */
  origem: OriginOfSession;
}

export const PLANOS = ['essencial', 'operacao', 'escala'] as const;
export type Plano = (typeof PLANOS)[number];

export const ORIGINS_OF_SESSION = ['senha', 'google', 'sso'] as const;
export type OriginOfSession = (typeof ORIGINS_OF_SESSION)[number];

/**
 * Reason login was refused, represented as a code rather than a sentence. Screens choose text independently without breaking the contract; each code gives the person a distinct recovery path instead of generic unauthorized feedback.
 */
export const REFUSESS_OF_INBOUND = [
  /** A personal email does not identify a company. Recovery: use an invitation. */
  'domain_public',
  /** No Pipe account uses this domain. Recovery: contact the purchaser. */
  'domain_unknown',
  /** The domain is known, but this person was not invited. Recovery: request an invitation. */
  'without_invitation',
  /** Access was disabled after joining. Recovery: contact the administrator. */
  'user_inactive',
  /** The provider did not verify the email. Recovery: verify the provider account. */
  'email_nao_verificado',
  /** The company requires SSO. Recovery: use its identity provider. */
  'sso_obrigatorio',
  /** Communication with Google failed. Recovery: retry. */
  'falha_no_provedor',
] as const;
export type RefusesOfInbound = (typeof REFUSESS_OF_INBOUND)[number];

export interface ApiError {
  codigo: string;
  message: string;
}

/**
 * `POST /v1/auth/descobrir` returns the login method for this email: `sso` directs to the company identity provider and `google` to Google. There is no `senha`: Pipe has never stored passwords, and promising a nonexistent method would make the screen offer an impossible flow. Known and unknown email addresses receive the same answer except when the domain is verified and has active SSO; otherwise the route would reveal which companies use Pipe.
 */
export interface RespostaDaDescoberta {
  metodo: 'sso' | 'google';
  /** API path for `sso`; only the public base is missing. */
  irPara?: string;
}

/**
 * `GET /v1/convites/:token` exposes only enough for an unauthenticated recipient to decide whether the invitation is theirs: company name, target email, role, and expiry. No other tenant data is included because the recipient is not logged in.
 */
export interface InvitationVisible {
  email: string;
  role: string;
  tenant: { name: string; slug: string };
  /** ISO 8601 as returned by the API; the screen handles formatting. */
  expiresAt: string;
}
