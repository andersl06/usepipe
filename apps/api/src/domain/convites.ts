import { sql } from 'drizzle-orm';
import { InboundRefused, createToken, hashDoToken } from '@pipe/authentication';
import type { PessoaDoGoogle } from '@pipe/authentication';
import type { TransactionPipe } from '@pipe/db';
import { databaseOwner, noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { enviarEmailSemDerrubar } from './email.js';

/**
 * Invitation is the ONLY entry path for someone without a verified domain. `packages/autenticacao/src/entrada.ts` rejects people who were not invited: discovering a domain must not imply joining its client. This file records who invited whom. Three safeguards also used for sessions and API keys apply: store the hash, never the token, so reading `convite` cannot redeem links; expire links in seven days so forgotten inbox links do not become permanent credentials; and enforce single use with `select ... for update` on acceptance, not a read followed by an unprotected write that allows two concurrent uses.
 */

/** Seven days is the invitation lifetime, not the session lifetime; an unused recipient requests another. */
export const DEADLINE_INVITATION_MS = 7 * 24 * 60 * 60 * 1000;

const EMAIL_ACEITAVEL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface InvitationCreated {
  id: string;
  email: string;
  role: string;
  /** The token exists only in this response; the database stores only its hash afterward. */
  token: string;
  url: string;
  expiresAt: Date;
}

/** Fields exposed by `GET /v1/convites/:token` without a session. */
export interface InvitationVisible {
  email: string;
  role: string;
  tenant: { name: string; slug: string };
  expiresAt: Date;
}

export interface InboundByInvitation {
  tenantId: string;
  usuarioId: string;
  token: string;
  expiresAt: Date;
}

function normalizarEmail(cru: string | undefined): string {
  const email = (cru ?? '').trim().toLowerCase();
  if (!EMAIL_ACEITAVEL.test(email)) {
    throw PipeError.request('email_invalid', 'Informe um e-mail válido para convidar.');
  }
  return email;
}

/** Provisional name until first sign-in provides the person's Google name. */
function nomeProvisorio(email: string): string {
  return email.slice(0, email.indexOf('@'));
}

export function urlOfInvitation(token: string): string {
  const base = (process.env['PIPE_URL_APP'] ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/invite/${token}`;
}

/** Screen label for each account role (`referencias-blip/pesquisa/blip-painel-do-contrato.md`). */
const LABEL_OF_ROLE: Readonly<Record<string, string>> = {
  admin: 'Admin',
  member: 'Pode editar',
  guest: 'Pode visualizar',
};

/**
 * Invitation email contains the link, inviter's destination tenant, role, and expiry. Use plain text intentionally: it survives any email client and is what the test reads.
 */
export function emailOfInvitation(convite: InvitationCreated, tenantNome: string): {
  para: string[];
  assunto: string;
  texto: string;
} {
  const role = LABEL_OF_ROLE[convite.role] ?? convite.role;
  const vence = convite.expiresAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return {
    para: [convite.email],
    assunto: `Convite para entrar em ${tenantNome} no Pipe`,
    texto:
      `Você foi convidado(a) para entrar em ${tenantNome} no Pipe com o acesso "${role}".\n\n` +
      `Para aceitar, abra o link:\n${convite.url}\n\n` +
      `O convite vale até ${vence}. Depois disso, peça um novo a quem convidou.\n` +
      'Se você não esperava este convite, ignore esta mensagem.',
  };
}

/**
 * Email the invitation AFTER commit without failing the caller. Continue returning the link so the inviter can use it if email delivery fails.
 */
async function avisarConvidado(invitation: InvitationCreated, tenantNome: string): Promise<void> {
  await enviarEmailSemDerrubar(emailOfInvitation(invitation, tenantNome), `convite ${invitation.id}`);
}

/** Current tenant name, used in the email to show which client the person joins. */
async function nomeDoTenant(tx: TransactionPipe): Promise<string> {
  const { rows } = await tx.execute<{ name: string }>(sql`select nome as name from tenant limit 1`);
  return rows[0]?.name ?? 'Pipe';
}

/**
 * Shared operation for `criarConvite` and `reenviarConvite` in the caller's SAME transaction: issue a new token, invalidate any open invitation to that email, and insert the row. Keeping this in one helper prevents the two paths from disagreeing on "resend": today it literally creates a new invitation, not a separate table or counter.
 */
async function issueInvitation(
  tx: TransactionPipe,
  tenantId: string,
  data: { email: string; role: string; createdBy?: string | null },
): Promise<InvitationCreated> {
  const email = data.email;
  const nameOfRole = data.role;
  const novo = createToken(DEADLINE_INVITATION_MS);

  const { rows: papeis } = await tx.execute<{ id: string; scope: string }>(
    sql`select id, escopo as scope from papel where nome = ${nameOfRole} limit 1`,
  );
  const roleId = papeis[0]?.id;
  if (!roleId) {
    throw PipeError.request('role_invalid', `Não existe o papel "${nameOfRole}" nesta conta.`, {
      papel: nameOfRole,
    });
  }
  if (papeis[0]?.scope !== 'conta') {
    throw PipeError.request(
      'role_of_attendance',
      `"${nameOfRole}" é papel de atendimento, dado no atendimento de cada contato. ` +
        'O convite dá o papel no contrato: admin, member ou guest.',
      { papel: nameOfRole },
    );
  }

  const { rows: jaDentro } = await tx.execute<{ id: string }>(
    sql`select id from usuario where email = ${email} limit 1`,
  );
  if (jaDentro[0]) {
    throw PipeError.conflito('already_member', `${email} já tem acesso a esta conta.`);
  }

  // Convidar (ou reenviar) de novo INVALIDA o convite anterior. Sem isto, cada
  // otherwise resending leaves another live link, and revoking access would require
  // finding every one of them.
  await tx.execute(sql`
    update convite set expira_em = now(), atualizado_em = now()
     where email = ${email} and aceito_em is null and expira_em > now()
  `);

  const { rows } = await tx.execute<{ id: string }>(sql`
    insert into convite (tenant_id, email, papel_id, token_hash, expira_em, criado_por)
    values (${tenantId}::uuid, ${email}, ${roleId}::uuid, ${novo.hash}, ${novo.expiraEm},
            ${data.createdBy ?? null})
    returning id
  `);

  return {
    id: rows[0]!.id,
    email,
    role: nameOfRole,
    token: novo.token,
    url: urlOfInvitation(novo.token),
    expiresAt: novo.expiraEm,
  };
}

/**
 * Create an invitation. Look up the role by NAME (`admin`, `member`, `guest`), which is what the inviter knows, with `pipe.tenant_id` fixed so a role from another client cannot be selected. Accept only ACCOUNT roles (migration 0021), as in the source: invitation grants a contract role; supervisor and agent roles are assigned later per contact. The database also rejects the wrong scope through the composite FK on `convite.escopo`; checking here provides a useful error instead of an FK failure.
 */
export async function createInvitation(
  tenantId: string,
  dados: { email?: string; role?: string; criadoPor?: string },
): Promise<InvitationCreated> {
  const email = normalizarEmail(dados.email);
  const nomeDoPapel = (dados.role ?? '').trim();
  if (!nomeDoPapel) {
    throw PipeError.request('role_missing', 'Informe o papel de quem está sendo convidado.');
  }

  const { convite, tenantNome } = await noTenant(tenantId, async (tx) => ({
    convite: await issueInvitation(tx, tenantId, { email, role: nomeDoPapel, createdBy: dados.criadoPor }),
    tenantNome: await nomeDoTenant(tx),
  }));
  // Send email outside the transaction: delivery must not delay commit or roll it back on failure.
  await avisarConvidado(convite, tenantNome);
  return convite;
}

/**
 * Resend an open invitation to the same email and role with a new link that INVALIDATES the previous one (`emitirConvite`). Email the new link via `dominio/email.ts` and keep it in the response so the inviter can share it if email delivery fails.
 */
export async function resendInvitation(
  tenantId: string,
  invitationId: string,
  createdBy?: string,
): Promise<InvitationCreated> {
  const { convite, tenantNome } = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ email: string; role: string }>(sql`
      select c.email, p.nome as role
        from convite c
        join papel p on p.id = c.papel_id
       where c.id = ${invitationId}::uuid and c.aceito_em is null and c.expira_em > now()
       limit 1
    `);
    const alvo = rows[0];
    if (!alvo) throw PipeError.naoEncontrado('Convite');
    return {
      convite: await issueInvitation(tx, tenantId, { email: alvo.email, role: alvo.role, createdBy }),
      tenantNome: await nomeDoTenant(tx),
    };
  });
  await avisarConvidado(convite, tenantNome);
  return convite;
}

type LineInvitation = {
  id: string;
  tenant_id: string;
  email: string;
  roleId: string;
  role: string;
  tenant_nome: string;
  slug: string;
  expira_em: Date;
  aceito_em: Date | null;
};

/**
 * Find an invitation by token hash. Use the owner role, as for session resolution, because the tenant must be discovered BEFORE it can be set.
 */
async function acharPeloToken(tokenCru: string): Promise<LineInvitation> {
  const { rows } = await databaseOwner().execute<LineInvitation>(sql`
    select c.id, c.tenant_id, c.email, c.papel_id as "roleId", c.expira_em, c.aceito_em,
           p.nome as role, t.nome as tenant_nome, t.slug
      from convite c
      join papel p on p.id = c.papel_id
      join tenant t on t.id = c.tenant_id
     where c.token_hash = ${hashDoToken(tokenCru)}
     limit 1
  `);

  const linha = rows[0];
  // An unknown token returns only 404; describing a guessed token as "expired"
  // confirmaria que o palpite era um convite de verdade.
  if (!linha) throw PipeError.naoEncontrado('Convite');

  // From here the requester HAS a valid token and should learn why it
  // no longer works, avoiding an opaque "link does nothing" support case.
  if (linha.aceito_em) {
    throw new PipeError(410, 'invitation_used', 'Este convite já foi usado. Peça outro.');
  }
  if (new Date(linha.expira_em).getTime() <= Date.now()) {
    throw new PipeError(410, 'invitation_expired', 'Este convite venceu. Peça outro.');
  }
  return linha;
}

export async function readInvitation(tokenCru: string): Promise<InvitationVisible> {
  const linha = await acharPeloToken(tokenCru);
  return {
    email: linha.email,
    role: linha.role,
    tenant: { name: linha.tenant_nome, slug: linha.slug },
    expiresAt: new Date(linha.expira_em),
  };
}

export interface InvitationAccepted {
  tenantId: string;
  userId: string;
  email: string;
  role: string;
  tenant: { name: string; slug: string };
  /** Present only when the person already accepted while authenticated through Google. */
  session?: InboundByInvitation;
}

/**
 * Accept an invitation by creating the tenant user, granting the role, and consuming the token. Optional `pessoa` separates two paths. Without `pessoa` (`POST /v1/convites/:token/aceitar`), create the user now; they sign in through Google later if their domain is verified, following the third question in `entrada.ts`. With `pessoa` (Google callback carrying `?convite=`), link the external account and open a session here; this is the path offered to someone without a verified domain. `for update` enforces single use: two concurrent clicks must not both read "not accepted" and proceed.
 */
export async function acceptInvitation(
  tokenCru: string,
  pessoa?: PessoaDoGoogle,
  context: { ip?: string; agente?: string } = {},
): Promise<InvitationAccepted> {
  const achado = await acharPeloToken(tokenCru);

  if (pessoa && pessoa.email.toLowerCase() !== achado.email) {
    // An invitation targets ONE email. Signing in with another Google account must not let
    // whoever received a forwarded link enter this client.
    throw PipeError.request(
      'invitation_of_other_email',
      `Este convite é para ${achado.email}. Entre com essa conta.`,
    );
  }

  return noTenant(achado.tenant_id, async (tx) => {
    const { rows: travados } = await tx.execute<{ aceito_em: Date | null; expira_em: Date }>(
      sql`select aceito_em, expira_em from convite where id = ${achado.id}::uuid for update`,
    );
    const atual = travados[0];
    if (!atual) throw PipeError.naoEncontrado('Convite');
    if (atual.aceito_em) {
      throw new PipeError(410, 'invitation_used', 'Este convite já foi usado. Peça outro.');
    }
    if (new Date(atual.expira_em).getTime() <= Date.now()) {
      throw new PipeError(410, 'invitation_expired', 'Este convite venceu. Peça outro.');
    }

    // Run in series, never `Promise.all`: parallel queries within the transaction disrupt
    // `pipe.tenant_id` and may run without a tenant; see README.
    const userId = await ensureUser(tx, achado.tenant_id, {
      email: achado.email,
      name: pessoa?.nome ?? nomeProvisorio(achado.email),
      avatarUrl: pessoa?.avatarUrl ?? null,
    });

    // One account role per person (migration 0021 partial index). A returning
    // inactive user invited again replaces the old account role with the
    // invitation role while keeping attendance roles.
    await tx.execute(sql`
      delete from usuario_papel
       where usuario_id = ${userId}::uuid and escopo = 'conta'
         and papel_id <> ${achado.roleId}::uuid
    `);
    await tx.execute(sql`
      insert into usuario_papel (tenant_id, usuario_id, papel_id, escopo)
      values (${achado.tenant_id}::uuid, ${userId}::uuid, ${achado.roleId}::uuid, 'conta')
      on conflict do nothing
    `);
    await tx.execute(sql`
      update convite set aceito_em = now(), usuario_id = ${userId}::uuid,
                         atualizado_em = now()
       where id = ${achado.id}::uuid
    `);

    const comum = {
      tenantId: achado.tenant_id,
      userId,
      email: achado.email,
      role: achado.role,
      tenant: { name: achado.tenant_nome, slug: achado.slug },
    };
    if (!pessoa) return comum;

    const session = await connectAndLogin(tx, achado.tenant_id, userId, pessoa, context);
    return { ...comum, session };
  });
}

/**
 * Use `on conflict` because the invited email may belong to an inactive user. A returning person is the same user, and a second row would violate `(tenant_id, email)` anyway.
 */
async function ensureUser(
  tx: TransactionPipe,
  tenantId: string,
  dados: { email: string; name: string; avatarUrl: string | null },
): Promise<string> {
  const { rows } = await tx.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email, avatar_url)
    values (${tenantId}::uuid, ${dados.name}, ${dados.email}, ${dados.avatarUrl})
    on conflict (tenant_id, email) do update
       set ativo = true, atualizado_em = now()
    returning id
  `);
  return rows[0]!.id;
}

/** Link the invited user's Google account and open a session. */
async function connectAndLogin(
  tx: TransactionPipe,
  tenantId: string,
  userId: string,
  pessoa: PessoaDoGoogle,
  contexto: { ip?: string; agente?: string },
): Promise<InboundByInvitation> {
  // `identidade_externa` is unique per tenant on `(tenant_id, emissor, sujeito)`.
  // If that identity already belongs to someone else in the tenant, the invitation must not
  // silently reassign it; fail clearly with the reason.
  const { rows: jaLigada } = await tx.execute<{ n: string }>(sql`
    select count(*)::text as n from identidade_externa
     where emissor = ${pessoa.emissor} and sujeito = ${pessoa.sujeito}
       and usuario_id <> ${userId}::uuid
  `);
  if (jaLigada[0]?.n !== '0') {
    throw PipeError.conflito(
      'account_already_connected',
      'Esta conta do Google já pertence a outro acesso do Pipe.',
    );
  }

  await tx.execute(sql`
    insert into identidade_externa
      (tenant_id, usuario_id, emissor, sujeito, email_no_provedor, ultimo_acesso_em)
    values (${tenantId}::uuid, ${userId}::uuid, ${pessoa.emissor}, ${pessoa.sujeito},
            ${pessoa.email}, now())
    on conflict (tenant_id, emissor, sujeito) do nothing
  `);

  // SSO research §6: enforce policy ON THE SERVER on every path
  // that issues a session, including invitation links. Otherwise a tenant
  // requiring SSO could still admit Google sign-in through an invitation
  // link: a classic back door, like a password-reset bypass.
  const { rows: politica } = await tx.execute<{ policy: string }>(
    sql`select politica as policy from conexao_sso where tenant_id = ${tenantId}::uuid limit 1`,
  );
  if (politica[0]?.policy === 'obrigatorio') {
    throw new InboundRefused(
      'sso_obrigatorio',
      'Esta empresa entra pelo provedor de identidade dela. Use o link de SSO.',
    );
  }

  const novo = createToken();
  await tx.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem, ip, agente)
    values (${tenantId}::uuid, ${userId}::uuid, ${novo.hash}, ${novo.expiraEm}, 'google',
            ${contexto.ip ?? null}, ${contexto.agente ?? null})
  `);
  await tx.execute(sql`update usuario set ultimo_acesso_em = now() where id = ${userId}::uuid`);

  return { tenantId, usuarioId: userId, token: novo.token, expiresAt: novo.expiraEm };
}
