import { sql } from 'drizzle-orm';
import { domainOfEmail, ehDomainPublic } from '@pipe/authentication';
import { databaseOwner, noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { provisionCustomer } from '../provision.js';

/**
 * Ported from chatwoot/chatwoot (MIT), `app/builders/account_builder.rb`, and its `account_signup_enabled?` flag in `lib/global_config_service.rb`. `docs/specs/2026-09-07-implantacao.md` §6.1 chooses assisted sales: tenant creation uses the `provisionar` command, not a route. The Chatwoot flag keeps public signup disabled by default (`ENABLE_ACCOUNT_SIGNUP` defaults to `false` and the route returns 404, as `check_signup_enabled` does there); enabling it requires an owner decision. Before enabling it, Pipe still needs hCaptcha (`validate_captcha`), email confirmation before a session for this signup path, and per-IP rate limiting (Rack::Attack in Chatwoot). The gap recorded in `o-que-falta.md` item 7 has partly changed: Pipe now has an email sender for invitations (`apps/api/src/dominio/email.ts`), but this signup path does not confirm the address. An account created here remains inert: its admin can enter via Google only after Pipe verifies the domain or sends an invitation. Tenant, catalog, roles, and admin creation stay in `provisionarCliente`; this file only validates and calls it.
 */

/** `GlobalConfigService.account_signup_enabled?`: any value other than `false` enables signup. */
export function registrationOfAccountEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = (env['ENABLE_ACCOUNT_SIGNUP'] ?? '').trim() || 'false';
  return value !== 'false';
}

const EMAIL_ACEITAVEL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface RequestOfAccount {
  nameOfAccount?: string | undefined;
  nameOfUser?: string | undefined;
  email?: string | undefined;
}

export interface AccountCreated {
  tenantId: string;
  adminId: string;
  slug: string;
  email: string;
}

/** Derive the workspace slug from the name, as Blip suggests in `/tenant-valid-id`. */
export function slugOfAccount(nome: string, email: string): string {
  const base = (nome || domainOfEmail(email).split('.')[0] || 'conta')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.slice(0, 48).replace(/-+$/, '') || 'conta';
}

/**
 * An account created AT SIGN-IN without an invitation or verified domain follows the source platform's self-service path: someone with no account receives one immediately, and supplies company details later in "minha conta". Unlike `construirConta`, a public email domain is allowed because personal trial accounts are common, and an email already used by another account is allowed because one person may manage several accounts. Since migration 0017, provider identity is unique per tenant, not globally. Provider-verified email remains mandatory and is checked earlier by `entrarComIdentidade` on every sign-in path. Add a suffix on slug collision: different people can have the same company name, and a later user's login must not fail for that reason.
 */
export async function buildAccountOfLogin(pessoa: {
  email: string;
  name?: string | undefined;
}): Promise<{ tenantId: string; userId: string; slug: string }> {
  const email = pessoa.email.trim().toLowerCase();
  const publico = ehDomainPublic(email);

  // Use the company name for a corporate email and the person's name for a public email;
  // both are provisional and "minha conta" can replace them.
  const nome = publico
    ? pessoa.name?.trim() || email.slice(0, email.indexOf('@'))
    : domainOfEmail(email).split('.')[0] || email.slice(0, email.indexOf('@'));

  const cliente = await provisionCustomer({
    name: nome,
    slug: await slugLivre(enderecoOfAccount(email)),
    plan: 'essencial',
    admin: email,
    // A personal email does not claim a domain; neither does a corporate email here:
    // a domain grants entry to everyone with that address, so it must be requested
    // later through DNS verification.
    withoutDomain: true,
  });

  const nomeDaPessoa = pessoa.name?.trim();
  if (nomeDaPessoa) {
    await noTenant(cliente.tenantId, (tx) =>
      tx.execute(
        sql`update usuario set nome = ${nomeDaPessoa}, atualizado_em = now()
             where id = ${cliente.adminId}::uuid`,
      ),
    );
  }

  return { tenantId: cliente.tenantId, userId: cliente.adminId, slug: cliente.slug };
}

/**
 * The account address follows the source platform: the email LOCAL PART plus a short suffix, for example `anderson-linhares-oxo7k`. There it becomes the account portal subdomain. It uses the creator's email rather than company name because the company name has not yet been entered when the address is needed. The random suffix prevents people such as `joao.silva` at different companies from colliding or receiving sequential `-2`, `-3` suffixes that reveal account counts. Five base-36 characters provide about 60 million combinations per name.
 */
export function enderecoOfAccount(email: string, aleatorio = Math.random): string {
  const local = email.slice(0, email.indexOf('@') > 0 ? email.indexOf('@') : undefined);
  const base = local
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  const sufixo = Math.floor(aleatorio() * 36 ** 5)
    .toString(36)
    .padStart(5, '0');
  return `${base || 'conta'}-${sufixo}`;
}

/** `nome`, `nome-2`, `nome-3`… Return the first unused value. */
async function slugLivre(base: string): Promise<string> {
  for (let tentativa = 1; tentativa <= 50; tentativa++) {
    const slug = tentativa === 1 ? base : `${base}-${tentativa}`;
    const { rows } = await databaseOwner().execute<{ existe: boolean }>(
      sql`select exists (select 1 from tenant where slug = ${slug}) as existe`,
    );
    if (!rows[0]?.existe) return slug;
  }
  // Fifty accounts with the same name suggest another issue; the time suffix
  // ensures sign-in remains available while that issue is investigated.
  return `${base}-${Date.now().toString(36)}`;
}

export async function buildAccount(pedido: RequestOfAccount): Promise<AccountCreated> {
  const email = (pedido.email ?? '').trim().toLowerCase();

  // `validate_email` — o `SignUpEmailValidationService`, com as frases do pt_BR dele.
  if (!EMAIL_ACEITAVEL.test(email)) {
    throw PipeError.request('email_invalid', 'Você digitou um email inválido');
  }
  if (ehDomainPublic(email)) {
    throw PipeError.request(
      'domain_blocked',
      'Este domínio não é permitido. Se você acredita que isso é um erro, por favor contate o suporte.',
    );
  }

  // `validate_user`: check whether the email is already a user in any client. Use the owner role
  // because this is a global question, and return only yes or no.
  const { rows } = await databaseOwner().execute<{ existe: boolean }>(
    sql`select exists (select 1 from usuario where lower(email) = ${email}) as existe`,
  );
  if (rows[0]?.existe) {
    throw PipeError.conflito('user_exists', `Você já se cadastrou para uma conta com ${email}`);
  }

  // `create_account` e `create_and_link_user`, pelo provisionamento de sempre.
  const nome = pedido.nameOfAccount?.trim() || pedido.nameOfUser?.trim() || domainOfEmail(email);
  const cliente = await provisionCustomer({
    name: nome,
    slug: slugOfAccount(nome, email),
    plan: 'essencial',
    admin: email,
  });

  // `name: user_full_name`: provisioning uses the email's local part.
  const nameOfUser = pedido.nameOfUser?.trim();
  if (nameOfUser) {
    await noTenant(cliente.tenantId, (tx) =>
      tx.execute(sql`update usuario set nome = ${nameOfUser} where id = ${cliente.adminId}::uuid`),
    );
  }

  return { tenantId: cliente.tenantId, adminId: cliente.adminId, slug: cliente.slug, email };
}
