import { and, eq, isNull, sql } from 'drizzle-orm';
import { comTenant } from '@pipe/db';
import { conexaoSso, domainTenant, identityExternal, session, user } from '@pipe/db/schema';
import type { DatabasePipe, TransactionPipe } from '@pipe/db';
import { ehDomainPublic, domainOfEmail } from './google.js';
import { createToken, estaValida } from './session.js';
import type { PessoaExterna } from './google.js';
import type { SessionActive } from './session.js';

/**
 * Between provider identification and an authenticated Pipe session, Google and the tenant IdP use the SAME entry path. One path applies one set of checks; a second entry path is easy to leave unguarded. The tenant comes from the verified email domain for Google or from the SSO connection that initiated the flow.
 *
 * Check in this order:
 * 1. If an external identity is already linked, find it by `(emissor, sujeito)`, never by email; reject a linked identity from a different tenant.
 * 2. Enforce tenant policy: `obrigatorio` allows SSO only, even for an already linked Google identity.
 * 3. For a new identity, require provider-confirmed email before linking or account creation. Otherwise a provider asserting a victim's email could grant the victim's roles.
 * 4. A public email domain does not identify a company. Google self-service may create an account for it; otherwise reject.
 * 5. For other domains, use only a VERIFIED domain; SSO must match the initiating tenant. If the domain is unclaimed, Google self-service may create its first account; otherwise reject.
 * 6. For a claimed domain, require an existing active invited user with that email, then link the identity. A verified domain alone cannot grant entry to another tenant's account.
 */

export class InboundRefused extends Error {
  constructor(
    readonly codigo:
      | 'dominio_publico'
      | 'dominio_desconhecido'
      | 'sem_convite'
      | 'usuario_inativo'
      | 'email_nao_verificado'
      | 'sso_obrigatorio'
      | 'outro_tenant',
    message: string,
  ) {
    super(message);
    this.name = 'EntradaRecusada';
  }
}

export interface InboundCompleted {
  tenantId: string;
  userId: string;
  /** Vai para o cookie. */
  token: string;
  expiraEm: Date;
}

export interface OptionsOfInbound {
  /** Stored in `sessao.origem`; bulk policy revocation depends on this value. */
  origem: 'google' | 'sso';
  /**
   * A tenant already resolved when the flow began through an SSO connection.
   *
   * With it, domain discovery no longer selects the tenant; it CONFIRMS it. The domain must still be verified for this tenant. Without that check, one tenant's IdP could authenticate another tenant's user by asserting the right email.
   */
  tenantId?: string | undefined;
  /**
   * Self-service behavior when a person authenticates without an existing account.
   *
   * Without this callback, entry is closed to those without an invitation or verified domain. With it, the account is CREATED immediately: login, account creation, welcome screen, then "minha conta" for details, following the reference platform.
   *
   * The API provides the callback because provisioning lives there. This module narrowly decides WHEN to call it: only if no tenant owns the domain. An uninvited user on a claimed verified domain is still rejected; allowing them in would expose another tenant's account.
   */
  createAccount?: ((pessoa: PessoaExterna) => Promise<AccountNew>) | undefined;
}


export interface AccountNew {
  tenantId: string;
  usuarioId: string;
}

/**
 * `bancoDono` deliberately bypasses RLS only for queries needed BEFORE tenant context exists: finding the external identity, resolving the domain, and reading tenant policy. API-key resolution follows the same approach because `pipe.tenant_id` cannot be set until the tenant is known.
 *
 * Every later operation uses `comTenant`.
 */
export async function loginWithIdentity(
  databaseOwner: DatabasePipe,
  databaseApp: DatabasePipe,
  pessoa: PessoaExterna,
  options: OptionsOfInbound,
  context: { ip?: string; agente?: string } = {},
): Promise<InboundCompleted> {
  const ligada = await databaseOwner
    .select({ tenantId: identityExternal.tenantId, usuarioId: identityExternal.usuarioId })
    .from(identityExternal)
    .where(
      and(
        eq(identityExternal.emissor, pessoa.emissor),
        eq(identityExternal.sujeito, pessoa.sujeito),
      ),
    )
    .limit(1);

  if (ligada[0]) {
    // Identity already linked to ANOTHER tenant. Reusing it here would let the same provider login enter
    // two tenants, leaving the choice of which identity counts to the first lookup.
    // ficaria com quem consultasse primeiro.
    if (options.tenantId && ligada[0].tenantId !== options.tenantId) {
      throw new InboundRefused(
        'outro_tenant',
        'Esta conta do provedor já pertence a outra empresa no Pipe.',
      );
    }
    await exigirPoliticaCompativel(databaseOwner, ligada[0].tenantId, options.origem);
    return openSession(databaseApp, ligada[0].tenantId, ligada[0].usuarioId, pessoa, options, context);
  }

  /*
   * Before rejecting for any reason, apply a guard on EVERY new identity path: without provider confirmation that the person owns the email, nothing below may match that identity to an account, link an invited user, or open a new account with that address.
   */
  if (!pessoa.emailVerificado) {
    throw new InboundRefused(
      'email_nao_verificado',
      'O provedor não confirmou este e-mail. Peça a quem administra para ligar a conta.',
    );
  }

  // On first entry, the domain selects the tenant for Google or confirms it for SSO.
  if (ehDomainPublic(pessoa.email)) {
    /*
     * A personal email does not identify a company. In self-service it need not: the new account belongs to that person, and the company name is filled in later in "minha conta".
     */
    if (options.createAccount && !options.tenantId) {
      return openAccountNew(databaseApp, pessoa, options, context);
    }
    throw new InboundRefused(
      'dominio_publico',
      'E-mail pessoal não identifica empresa. Entre pelo convite que você recebeu.',
    );
  }

  const domain = domainOfEmail(pessoa.email);
  const dono = await databaseOwner
    .select({ tenantId: domainTenant.tenantId })
    .from(domainTenant)
    .where(and(eq(domainTenant.domain, domain), sql`${domainTenant.verificadoEm} is not null`))
    .limit(1);

  const tenantId = dono[0]?.tenantId;
  if (!tenantId || (options.tenantId && tenantId !== options.tenantId)) {
    /*
     * Nobody has claimed this domain. In self-service this is the normal first-person entry for that company, not a rejection.
     */
    if (!tenantId && options.createAccount && !options.tenantId) {
      return openAccountNew(databaseApp, pessoa, options, context);
    }
    throw new InboundRefused(
      'dominio_desconhecido',
      `Nenhuma conta do Pipe usa o domínio "${domain}".`,
    );
  }

  await exigirPoliticaCompativel(databaseOwner, tenantId, options.origem);

  return comTenant(databaseApp, tenantId, async (tx) => {
    const convidado = await tx
      .select({ id: user.id, ativo: user.ativo })
      .from(user)
      .where(eq(user.email, pessoa.email))
      .limit(1);

    const encontrado = convidado[0];
    if (!encontrado) {
      throw new InboundRefused(
        'sem_convite',
        'Você ainda não foi convidado para esta conta. Peça a quem administra.',
      );
    }
    if (!encontrado.ativo) {
      throw new InboundRefused('usuario_inativo', 'Este acesso foi desativado.');
    }

    await tx.insert(identityExternal).values({
      tenantId,
      usuarioId: encontrado.id,
      emissor: pessoa.emissor,
      sujeito: pessoa.sujeito,
      emailNoProvedor: pessoa.email,
      ultimoAcessoEm: new Date(),
    });

    return writeSession(tx, tenantId, encontrado.id, options.origem, context);
  });
}


/**
 * At login, self-service creates the tenant and administrator; this function links the provider identity and opens the session.
 *
 * The identity is stored here rather than in provisioning because provisioning is provider-agnostic; the command-line tenant creation path uses the same provisioning.
 */
async function openAccountNew(
  bancoApp: DatabasePipe,
  pessoa: PessoaExterna,
  opcoes: OptionsOfInbound,
  contexto: { ip?: string; agente?: string },
): Promise<InboundCompleted> {
  const account = await opcoes.createAccount!(pessoa);
  return comTenant(bancoApp, account.tenantId, async (tx) => {
    await tx.insert(identityExternal).values({
      tenantId: account.tenantId,
      usuarioId: account.usuarioId,
      emissor: pessoa.emissor,
      sujeito: pessoa.sujeito,
      emailNoProvedor: pessoa.email,
      ultimoAcessoEm: new Date(),
    });
    return writeSession(tx, account.tenantId, account.usuarioId, opcoes.origem, contexto);
  });
}

export function loginWithGoogle(
  bancoDono: DatabasePipe,
  bancoApp: DatabasePipe,
  pessoa: PessoaExterna,
  contexto: { ip?: string; agente?: string } = {},
  createAccount?: (pessoa: PessoaExterna) => Promise<AccountNew>,
): Promise<InboundCompleted> {
  return loginWithIdentity(
    bancoDono,
    bancoApp,
    pessoa,
    { origem: 'google', ...(createAccount ? { createAccount } : {}) },
    contexto,
  );
}

/** Login through the tenant IdP; the tenant comes from the connection that started the flow. */
export function loginWithSso(
  bancoDono: DatabasePipe,
  bancoApp: DatabasePipe,
  pessoa: PessoaExterna,
  tenantId: string,
  contexto: { ip?: string; agente?: string } = {},
): Promise<InboundCompleted> {
  return loginWithIdentity(bancoDono, bancoApp, pessoa, { origem: 'sso', tenantId }, contexto);
}

/**
 * Open a session in an account where the person ALREADY has a user, for the account switcher in the upper-left corner.
 *
 * This is not a login shortcut. The caller must first prove that the target account user is the same person already signed in, using the same email verified in the owner database. This function enforces the remaining checks - active user and target-account SSO policy - because it issues the token, and every token-issuing path must use the same guards.
 *
 * The old session stays open: people often switch back, and ending a tab during a ticket would be worse than keeping two sessions alive for the same duration.
 */
export async function openSessionAt(
  bancoDono: DatabasePipe,
  bancoApp: DatabasePipe,
  tenantId: string,
  userId: string,
  origem: 'google' | 'sso',
  contexto: { ip?: string; agente?: string } = {},
): Promise<InboundCompleted> {
  await exigirPoliticaCompativel(bancoDono, tenantId, origem);
  return comTenant(bancoApp, tenantId, async (tx) => {
    const atual = await tx
      .select({ ativo: user.ativo })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!atual[0]?.ativo) {
      throw new InboundRefused('usuario_inativo', 'Este acesso foi desativado.');
    }
    return writeSession(tx, tenantId, userId, origem, contexto);
  });
}

/**
 * Enforce tenant policy ON THE SERVER along the session-issuing path.
 *
 * Hiding the Google button is insufficient: with `obrigatorio`, this path rejects even an already linked Google account. This is where "mandatory SSO" becomes an actual check rather than settings copy; see `referencias-blip/pesquisa/sso-multi-tenant.md` section 6.
 *
 * Any new session-issuing path, including password, password recovery, or invitation link, must pass through this function or it creates a back door.
 */
export async function exigirPoliticaCompativel(
  bancoDono: DatabasePipe,
  tenantId: string,
  origem: string,
): Promise<void> {
  if (origem === 'sso') return;

  const linhas = await bancoDono
    .select({ politica: conexaoSso.politica })
    .from(conexaoSso)
    .where(eq(conexaoSso.tenantId, tenantId))
    .limit(1);

  if (linhas[0]?.politica === 'obrigatorio') {
    throw new InboundRefused(
      'sso_obrigatorio',
      'Esta empresa entra pelo provedor de identidade dela. Use o botão de SSO.',
    );
  }
}

async function openSession(
  bancoApp: DatabasePipe,
  tenantId: string,
  usuarioId: string,
  pessoa: PessoaExterna,
  opcoes: OptionsOfInbound,
  contexto: { ip?: string; agente?: string },
): Promise<InboundCompleted> {
  return comTenant(bancoApp, tenantId, async (tx) => {
    const atual = await tx
      .select({ ativo: user.ativo })
      .from(user)
      .where(eq(user.id, usuarioId))
      .limit(1);
    if (!atual[0]?.ativo) {
      throw new InboundRefused('usuario_inativo', 'Este acesso foi desativado.');
    }

    // Run sequentially, never in `Promise.all`: parallel queries inside the transaction drop
    // the session's `pipe.tenant_id`; see the README.
    //
    // An email change at the IdP updates only this display field: the account
    // remains the `(emissor, sujeito)` pair. Changing address does not change the
    // account, so inheriting a former employee's address does not inherit access.
    await tx
      .update(identityExternal)
      .set({ ultimoAcessoEm: new Date(), emailNoProvedor: pessoa.email })
      .where(
        and(
          eq(identityExternal.emissor, pessoa.emissor),
          eq(identityExternal.sujeito, pessoa.sujeito),
        ),
      );

    return writeSession(tx, tenantId, usuarioId, opcoes.origem, contexto);
  });
}

async function writeSession(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  origem: string,
  contexto: { ip?: string; agente?: string },
): Promise<InboundCompleted> {
  const novo = createToken();
  await tx.insert(session).values({
    tenantId,
    usuarioId,
    tokenHash: novo.hash,
    expiraEm: novo.expiraEm,
    origem,
    ip: contexto.ip ?? null,
    agente: contexto.agente ?? null,
  });
  await tx.update(user).set({ lastAccessAt: new Date() }).where(eq(user.id, usuarioId));

  return { tenantId, userId: usuarioId, token: novo.token, expiraEm: novo.expiraEm };
}

/**
 * Resolve the session cookie.
 *
 * Use the owner role because tenant discovery must happen before setting tenant context. Look up by HASH through a unique index and return `null` for every non-live session: nonexistent, expired, and ended tokens intentionally get the same result.
 */
export async function resolveSession(
  bancoDono: DatabasePipe,
  hash: string,
  agora = new Date(),
): Promise<SessionActive | null> {
  const linhas = await bancoDono
    .select({
      id: session.id,
      tenantId: session.tenantId,
      usuarioId: session.usuarioId,
      expiraEm: session.expiraEm,
      origem: session.origem,
      encerradaEm: session.encerradaEm,
    })
    .from(session)
    .where(eq(session.tokenHash, hash))
    .limit(1);

  const linha = linhas[0];
  if (!linha) return null;
  if (!estaValida({ expiraEm: linha.expiraEm, encerradaEm: linha.encerradaEm }, agora)) return null;

  return {
    id: linha.id,
    tenantId: linha.tenantId,
    userId: linha.usuarioId,
    expiraEm: linha.expiraEm,
    origem: linha.origem,
  };
}


export async function sair(bancoDono: DatabasePipe, hash: string): Promise<void> {
  await bancoDono
    .update(session)
    .set({ encerradaEm: new Date() })
    .where(and(eq(session.tokenHash, hash), isNull(session.encerradaEm)));
}
