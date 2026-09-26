import { and, asc, count, eq, gt, isNull, ne } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import { invitation, flow, role, tenant, user, userRole } from '@pipe/db/schema';
import type { TransactionPipe, Ator } from '@pipe/db';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como na Gestão. */
const consultar = <T>(tx: TransactionPipe, fn: (tx: TransactionPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/**
 * O que o Painel do contrato (`/contrato`) lê e grava.
 *
 * Nada aqui sabe que o Next existe — sem `revalidatePath`, sem JSX —, como em
 * `lib/configuracoes.ts`: recebe parâmetro, devolve dado. É o que faz virar
 * endpoint da `apps/api` por movimentação e não por reescrita (README, "Quem
 * fala com o banco").
 *
 * A régua da tela é `referencias-blip/pesquisa/blip-painel-do-contrato.md`.
 */

export interface SummaryOfContract {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  criadoEm: Date | null;
  /** O fuso da conta: é nele que a data de criação é escrita, não no do servidor. */
  fuso: string;
  /** Os "Chatbots" do cartão deles. Aqui é fluxo e roteador, fora os arquivados. */
  flows: number;
  /** Os "Membros". Só conta quem ainda tem acesso. */
  members: number;
}

/**
 * Always show the contract summary: source `tenant-summary` is readable by all three roles. Pipe calculates both counts in the database for every viewer. In the source `tenant.applications` stays `[]`, so 'Chatbots' is absent in practice, and `members` loads only for `admin` with the subscription.
 */
export async function loadSummaryOfContract(
  tx: TransactionPipe,
  tid: string,
): Promise<SummaryOfContract> {
  return consultar(tx, async (tx) => {
    const [linha] = await tx
      .select({
        id: tenant.id,
        name: tenant.nome,
        slug: tenant.slug,
        logoUrl: tenant.logoUrl,
        criadoEm: tenant.criadoEm,
        fuso: tenant.fuso,
      })
      .from(tenant)
      .where(eq(tenant.id, tid))
      .limit(1);

    /*
     * Run one query at a time: a transaction has one connection, and concurrent queries can interfere, as noted in `lib/portal.ts`.
     */
    const [flows] = await tx
      .select({ n: count() })
      .from(flow)
      .where(ne(flow.estado, 'arquivado'));
    const [members] = await tx.select({ n: count() }).from(user).where(eq(user.ativo, true));

    return {
      id: linha?.id ?? tid,
      name: linha?.name ?? '',
      slug: linha?.slug ?? '',
      logoUrl: linha?.logoUrl ?? null,
      criadoEm: linha?.criadoEm ?? null,
      fuso: linha?.fuso ?? 'America/Sao_Paulo',
      flows: flows?.n ?? 0,
      members: members?.n ?? 0,
    };
  });
}

/**
 * Um dos três papéis de CONTA (`papel.escopo = 'conta'`, migração 0021). O
 * `nome` é o `roleId` da origem — `admin`, `member`, `guest` — e é por ele que a
 * tela acha o rótulo, a descrição e o ícone (`PAPEIS_DA_ORIGEM`).
 */
export interface RoleOfAccount {
  id: string;
  name: string;
}

export interface MemberOfContract {
  id: string;
  /**
   * De qual tabela veio a linha. Na origem há uma só (`tenant-user`), e o
   * `userStatus` distingue `Accepted` de `PendingUser`; aqui quem já entrou é
   * `usuario` e quem foi chamado e ainda não veio é `convite` — é a mesma
   * distinção, com o dado guardado em dois lugares.
   */
  tipo: 'usuario' | 'convite';
  name: string;
  email: string;
  avatarUrl: string | null;
  roleId: string | null;
  roleName: string | null;
}

/**
 * Offer only the three account roles in Members and Invite. Manager, supervisor, agent and evaluator are attendance roles assigned per contact in the source.
 */
export async function loadPapeisOfAccount(tx: TransactionPipe): Promise<RoleOfAccount[]> {
  return consultar(tx, (tx) =>
    tx
      .select({ id: role.id, name: role.nome })
      .from(role)
      .where(eq(role.scope, 'conta'))
      .orderBy(asc(role.nome)),
  );
}

/**
 * List people with account access and pending invitees together. Only active users count: `removerMembro` deactivates instead of deleting, preserving names in conversations, evaluations and audit logs. Source invitees are `tenant-user` rows with `userStatus: 'PendingUser'`, shown with '(Pendente)'; expired invites grant no access and accepted ones are already users, so exclude both. An invitee has no name before first sign-in; display the email prefix, matching source fallback `decodeURIComponent(userIdentity.split('@')[0])`.
 */
export async function loadMembers(tx: TransactionPipe): Promise<MemberOfContract[]> {
  return consultar(tx, async (tx) => {
    const linhas = await tx
      .select({
        id: user.id,
        name: user.nome,
        email: user.email,
        avatarUrl: user.avatarUrl,
        roleId: role.id,
        roleName: role.nome,
      })
      .from(user)
      /*
       * Join the single ACCOUNT role per user (migration 0021 partial index), so the row is not multiplied; attendance roles belong to another screen.
       */
      .leftJoin(
        userRole,
        and(eq(userRole.userId, user.id), eq(userRole.escopo, 'conta')),
      )
      .leftJoin(role, eq(role.id, userRole.papelId))
      .where(eq(user.ativo, true))
      .orderBy(asc(user.nome));

    /* Defesa barata contra linha repetida, que viraria chave duplicada na lista. */
    const byPerson = new Map<string, MemberOfContract>();
    for (const linha of linhas) {
      if (byPerson.has(linha.id)) continue;
      byPerson.set(linha.id, { ...linha, tipo: 'usuario' });
    }

    const pendentes = await tx
      .select({
        id: invitation.id,
        email: invitation.email,
        roleId: role.id,
        roleName: role.nome,
      })
      .from(invitation)
      .innerJoin(role, eq(role.id, invitation.papelId))
      .where(and(isNull(invitation.aceitoEm), gt(invitation.expiraEm, new Date())))
      .orderBy(asc(invitation.email));

    return [
      ...byPerson.values(),
      ...pendentes.map((c) => ({
        ...c,
        tipo: 'convite' as const,
        name: c.email.slice(0, c.email.indexOf('@')),
        avatarUrl: null,
      })),
    ];
  });
}

export type Recording = { ok: true } | { ok: false; error: string };

const OK: Recording = { ok: true };

/** The account role that the source calls `admin`; see `PAPEIS_DA_ORIGEM`. */
const ROLE_ADMIN = 'admin';

const MESSAGE_LAST_ADMIN =
  'Este é o último administrador do contrato. Dê o papel de Admin a outra pessoa antes.';

/**
 * Count active ACCOUNT administrators only. A deactivated admin no longer has access, so must not satisfy the last-admin guard.
 */
async function contarAdministradoresAtivos(tx: TransactionPipe): Promise<number> {
  return consultar(tx, async (tx) => {
    const [linha] = await tx
      .select({ n: count() })
      .from(userRole)
      .innerJoin(role, and(eq(role.id, userRole.papelId), eq(role.nome, ROLE_ADMIN)))
      .innerJoin(user, and(eq(user.id, userRole.userId), eq(user.ativo, true)))
      .where(eq(userRole.escopo, 'conta'));
    return linha?.n ?? 0;
  });
}

/**
 * Replace one member's ACCOUNT role in a single transaction: remove the old role before adding the new, matching the source's single `roleId`. Leave attendance roles untouched, so changing account Admin to view-only does not remove attendance access. Audit both values.
 */
export async function defineRoleOfMember(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  userIdTarget: string,
  roleId: string,
): Promise<Recording> {
  return consultar(tx, async (tx) => {
    const [alvo] = await tx
      .select({ id: user.id, ativo: user.ativo })
      .from(user)
      .where(eq(user.id, userIdTarget))
      .limit(1);
    if (!alvo) return { ok: false, error: 'Esta pessoa não faz parte deste contrato.' };

    const [novo] = await tx
      .select({ id: role.id, nome: role.nome })
      .from(role)
      .where(and(eq(role.id, roleId), eq(role.scope, 'conta')))
      .limit(1);
    if (!novo) return { ok: false, error: 'Este papel não existe neste contrato.' };

    const ofAccount = and(
      eq(userRole.userId, userIdTarget),
      eq(userRole.escopo, 'conta'),
    );
    const antigos = await tx
      .select({ nome: role.nome })
      .from(userRole)
      .innerJoin(role, eq(role.id, userRole.papelId))
      .where(ofAccount);

    // Demoting the LAST active admin would remove the only account able to
    // grant that role again, leaving the contract unmanaged.
    const eraAdmin = alvo.ativo && antigos.some((p) => p.nome === ROLE_ADMIN);
    if (eraAdmin && novo.nome !== ROLE_ADMIN && (await contarAdministradoresAtivos(tx)) <= 1) {
      return { ok: false, error: MESSAGE_LAST_ADMIN };
    }

    await tx.delete(userRole).where(ofAccount);
    await tx
      .insert(userRole)
      .values({ tenantId: tid, userId: userIdTarget, papelId: novo.id, escopo: 'conta' });

    await registrarAuditoria(tx, tid, {
      ator,
      acao: 'alterou',
      objetoTipo: 'usuario_papel',
      objetoId: userIdTarget,
      antes: { papeis: antigos.map((p) => p.nome) },
      depois: { papeis: [novo.nome] },
    });
    return OK;
  });
}

/**
 * Remove a contract member by DEACTIVATING, never deleting. `usuario` is referenced by conversations, evaluations, leads and audit records; deleting it would erase attribution needed by contract audits. `ativo = false` already blocks sign-in (`packages/autenticacao/src/entrada.ts`). Keep the role so a reactivated member returns to their former responsibilities.
 */
export async function removeMember(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  usuarioIdAlvo: string,
): Promise<Recording> {
  return consultar(tx, async (tx) => {
    const [alvo] = await tx
      .select({ id: user.id, nome: user.nome, ativo: user.ativo })
      .from(user)
      .where(eq(user.id, usuarioIdAlvo))
      .limit(1);
    if (!alvo) return { ok: false, error: 'Esta pessoa não faz parte deste contrato.' };
    if (!alvo.ativo) return OK;

    const [roleAtual] = await tx
      .select({ nome: role.nome })
      .from(userRole)
      .innerJoin(role, eq(role.id, userRole.papelId))
      .where(and(eq(userRole.userId, usuarioIdAlvo), eq(userRole.escopo, 'conta')))
      .limit(1);
    // Apply the `definirPapelDoMembro` guard here too: removing the last active admin
    // would leave nobody able to assign the role again.
    if (roleAtual?.nome === ROLE_ADMIN && (await contarAdministradoresAtivos(tx)) <= 1) {
      return { ok: false, error: MESSAGE_LAST_ADMIN };
    }

    await tx.update(user).set({ ativo: false }).where(eq(user.id, usuarioIdAlvo));

    await registrarAuditoria(tx, tid, {
      ator,
      acao: 'alterou',
      objetoTipo: 'usuario',
      objetoId: usuarioIdAlvo,
      antes: { ativo: true },
      depois: { ativo: false },
    });
    return OK;
  });
}

/**
 * Change the role of an unused invite. Blip uses the same `definirPapelDoMembro` operation because invitees are already `tenant-user` rows and `set .../role` applies equally. Here they live in `convite`, so a separate function has the same effect: the new role applies at first sign-in.
 */
export async function defineRoleOfInvitation(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  invitationId: string,
  papelId: string,
): Promise<Recording> {
  return consultar(tx, async (tx) => {
    const [alvo] = await tx
      .select({ id: invitation.id, email: invitation.email, papelId: invitation.papelId })
      .from(invitation)
      .where(and(eq(invitation.id, invitationId), isNull(invitation.aceitoEm)))
      .limit(1);
    if (!alvo) return { ok: false, error: 'Este convite não está mais aberto.' };

    const [novo] = await tx
      .select({ id: role.id, nome: role.nome })
      .from(role)
      .where(and(eq(role.id, papelId), eq(role.scope, 'conta')))
      .limit(1);
    if (!novo) return { ok: false, error: 'Este papel não existe neste contrato.' };

    await tx
      .update(invitation)
      .set({ papelId: novo.id, atualizadoEm: new Date() })
      .where(eq(invitation.id, invitationId));

    await registrarAuditoria(tx, tid, {
      ator,
      acao: 'alterou',
      objetoTipo: 'convite',
      objetoId: invitationId,
      antes: { papelId: alvo.papelId },
      depois: { papelId: novo.id },
    });
    return OK;
  });
}

/**
 * Cancel an open invitation by expiring, not deleting it. Keep the row as evidence of who invited whom; expiry invalidates its link, as `criarConvite` does before issuing a replacement.
 */
export async function cancelarInvitation(
  tx: TransactionPipe,
  tid: string,
  ator: Ator,
  conviteId: string,
): Promise<Recording> {
  return consultar(tx, async (tx) => {
    const [alvo] = await tx
      .select({ id: invitation.id, expiraEm: invitation.expiraEm })
      .from(invitation)
      .where(and(eq(invitation.id, conviteId), isNull(invitation.aceitoEm)))
      .limit(1);
    if (!alvo) return { ok: false, error: 'Este convite não está mais aberto.' };

    const agora = new Date();
    await tx
      .update(invitation)
      .set({ expiraEm: agora, atualizadoEm: agora })
      .where(eq(invitation.id, conviteId));

    await registrarAuditoria(tx, tid, {
      ator,
      acao: 'alterou',
      objetoTipo: 'convite',
      objetoId: conviteId,
      antes: { expiraEm: alvo.expiraEm },
      depois: { expiraEm: agora },
    });
    return OK;
  });
}
