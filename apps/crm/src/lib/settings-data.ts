import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  cifrar,
  keyringOfAmbiente,
  diferenca,
  registrarAuditoria,
  type Ator,
  type TransactionPipe,
} from '@pipe/db';
import {
  keyApi,
  invitation,
  dictionaryField,
  domainTenant,
  role,
  rolePermission,
  permission,
  tenant,
  user,
  userRole,
  webhookSaida,
} from '@pipe/db/schema';
import { consultar, paraData, tenantId } from './database';
import {
  scopesValid,
  eventosValidos,
  fusoValido,
  normalizar,
  normalizarEmail,
  recusarCodigoDeCampo,
  recusarEmail,
  recusarNome,
  recusarUrl,
  tipoDeCampoValido,
  type CampoPersonalizado,
  type ApiKey,
  type InvitationPendente,
  type Espaco,
  type Member,
  type RoleDetailed,
  type Perfil,
  type CatalogoPermission,
  type Resultado,
  type RoleSummary,
  type WebhookDeSaida,
} from './settings-comum';

/**
 * The settings area's data layer. **Database only.**
 *
 * Nothing here knows Next exists: no `revalidatePath`, no JSX, no
 * `'use server'`. It's called by the server action in
 * `app/configuracoes/acoes.ts`, which revalidates the route afterward. The
 * reason is in the README, under "Who talks to the database — the boundary":
 * `apps/crm` is moving to Vite and `apps/api` becomes the only door to
 * Postgres, and then becoming an endpoint means MOVING this file, not
 * rewriting it.
 *
 * Two rules hold for every write here, without exception:
 *
 * 1. **Every write logs an audit entry, in the SAME transaction.** Settings is
 *    the area where "who changed what" matters most — especially member and
 *    role, which is changing who sees what. A log in a separate transaction
 *    lies when the change gets rolled back.
 * 2. **Sequential queries.** `Promise.all` inside the transaction drops
 *    `pipe.tenant_id` and the query ends up running with no tenant (README).
 */

/** Opens the transaction already with the tenant pinned, and hands back the id for the audit log too. */
async function escrever<T>(fn: (tx: TransactionPipe, tenant: string) => Promise<T>): Promise<T> {
  const id = await tenantId();
  return consultar((tx) => fn(tx, id));
}

const OK: Resultado = { ok: true };

/* ================================================================== perfil */

/**
 * Who's doing the changing.
 *
 * The CRM doesn't have its own session yet — `banco.ts` resolves the tenant
 * through an environment variable, and it's the same story here:
 * `PIPE_USUARIO_ID` when it exists, otherwise the tenant's first active user.
 * It's not the final design, and it's written to be swapped in one line when
 * `packages/autenticacao` reaches this screen: the rest of the file only knows
 * the `Ator` that comes out of here.
 */
export async function userCurrent(): Promise<Perfil> {
  const fixo = process.env['PIPE_USUARIO_ID'];
  return consultar(async (tx) => {
    const linhas = await tx
      .select({
        id: user.id,
        nome: user.nome,
        email: user.email,
        avatarUrl: user.avatarUrl,
        ultimoAccessIn: user.lastAccessAt,
      })
      .from(user)
      .where(fixo ? eq(user.id, fixo) : eq(user.ativo, true))
      .orderBy(asc(user.criadoEm))
      .limit(1);

    const pessoa = linhas[0];
    if (!pessoa) throw new Error('nenhum usuário neste tenant: rode a semente antes.');

    const papeis = await tx
      .select({ nome: role.nome })
      .from(userRole)
      .innerJoin(role, eq(role.id, userRole.papelId))
      .where(eq(userRole.userId, pessoa.id))
      .orderBy(asc(role.nome));

    return {
      ...pessoa,
      ultimoAccessIn: paraData(pessoa.ultimoAccessIn),
      papeis: papeis.map((p) => p.nome),
    };
  });
}

/** The actor for this screen's writes. Always a person: there's no cron and no key here. */
export async function atorAtual(): Promise<Ator> {
  const pessoa = await userCurrent();
  return { type: 'usuario', id: pessoa.id };
}

export async function salvarPerfil(
  ator: Ator,
  data: { nome: string; avatarUrl: string | null },
): Promise<Resultado> {
  const nome = normalizar(data.nome);
  const queixa =
    recusarNome(nome) ?? recusarUrl(normalizar(data.avatarUrl), { obrigatoria: false });
  if (queixa) return { ok: false, error: queixa };

  const avatarUrl = normalizar(data.avatarUrl);
  const id = ator.id;
  if (!id) return { ok: false, error: 'Não sei quem está salvando.' };

  return escrever(async (tx, tenant) => {
    const [antes] = await tx
      .select({ nome: user.nome, avatarUrl: user.avatarUrl })
      .from(user)
      .where(eq(user.id, id));
    if (!antes) return { ok: false, error: 'Este acesso não existe mais.' };

    const depois = { nome: nome!, avatarUrl };
    await tx.update(user).set({ ...depois, atualizadoEm: new Date() }).where(eq(user.id, id));
    await registrarAuditoria(tx, tenant, {
      ator,
      acao: 'alterou',
      objetoTipo: 'usuario',
      objetoId: id,
      ...diferenca(antes, depois),
    });
    return OK;
  });
}

/* ====================================================== workspace */

export async function lerEspaco(): Promise<Espaco> {
  return consultar(async (tx) => {
    const [linha] = await tx
      .select({
        id: tenant.id,
        nome: tenant.nome,
        slug: tenant.slug,
        fuso: tenant.fuso,
        idioma: tenant.idioma,
        logoUrl: tenant.logoUrl,
        plano: tenant.plano,
        deployment: tenant.deployment,
      })
      .from(tenant)
      .limit(1);
    if (!linha) throw new Error('o tenant desta instância sumiu.');

    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(user)
      .where(eq(user.ativo, true));

    const dominios = await tx
      .select({ dominio: domainTenant.domain, verificadoEm: domainTenant.verificadoEm })
      .from(domainTenant)
      .orderBy(asc(domainTenant.domain));

    return {
      ...linha,
      members: count?.n ?? 0,
      dominios: dominios.map((d) => ({ domain: d.dominio, verificado: d.verificadoEm !== null })),
    };
  });
}

export async function salvarEspaco(
  ator: Ator,
  data: { nome: string; logoUrl: string | null; fuso: string },
): Promise<Resultado> {
  const nome = normalizar(data.nome);
  const logoUrl = normalizar(data.logoUrl);
  const fuso = normalizar(data.fuso);

  const queixa = recusarNome(nome, 'O nome da empresa') ?? recusarUrl(logoUrl, { obrigatoria: false });
  if (queixa) return { ok: false, error: queixa };
  if (!fuso || !fusoValido(fuso)) return { ok: false, error: 'Este fuso horário não existe.' };

  return escrever(async (tx, tenantIdAtual) => {
    const [antes] = await tx
      .select({ nome: tenant.nome, logoUrl: tenant.logoUrl, fuso: tenant.fuso })
      .from(tenant)
      .where(eq(tenant.id, tenantIdAtual));
    if (!antes) return { ok: false, error: 'Este espaço não existe mais.' };

    const depois = { nome: nome!, logoUrl, fuso };
    await tx
      .update(tenant)
      .set({ ...depois, atualizadoEm: new Date() })
      .where(eq(tenant.id, tenantIdAtual));
    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: 'alterou',
      objetoTipo: 'tenant',
      objetoId: tenantIdAtual,
      ...diferenca(antes, depois),
    });
    return OK;
  });
}

/* ================================================================ membros */

export async function listMembers(): Promise<Member[]> {
  return consultar(async (tx) => {
    const linhas = await tx
      .select({
        id: user.id,
        nome: user.nome,
        email: user.email,
        ativo: user.ativo,
        ultimoAccessIn: user.lastAccessAt,
        roleId: role.id,
        role: role.nome,
      })
      .from(user)
      .leftJoin(userRole, eq(userRole.userId, user.id))
      .leftJoin(role, eq(role.id, userRole.papelId))
      .orderBy(asc(user.nome), asc(role.nome));

    // The `left join` returns one row per role, and the schema allows several. The screen
    // offers ONE role (see `definirPapel`), so here it's the first in alphabetical order —
    // and never two rows for the same person, which would become a duplicate key
    // repetida na tabela e uma pessoa contada duas vezes.
    const byPessoa = new Map<string, Member>();
    for (const l of linhas) {
      if (byPessoa.has(l.id)) continue;
      byPessoa.set(l.id, { ...l, ultimoAccessIn: paraData(l.ultimoAccessIn) });
    }
    return [...byPessoa.values()];
  });
}

export async function listarConvitesPendentes(): Promise<InvitationPendente[]> {
  return consultar(async (tx) => {
    const { rows } = await tx.execute<{
      id: string;
      email: string;
      role: string;
      expira_em: unknown;
      convidado_by: string | null;
    }>(sql`
      select c.id, c.email, p.nome as role, c.expira_em, u.nome as convidado_by
        from convite c
        join papel p on p.id = c.papel_id
        left join usuario u on u.id = c.criado_por
       where c.aceito_em is null and c.expira_em > now()
       order by c.criado_em desc
    `);
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      expiraEm: paraData(r.expira_em) ?? new Date(),
      convidadoBy: r.convidado_by,
    }));
  });
}

/** Sete dias, o mesmo prazo de `apps/api/src/dominio/convites.ts`. */
const PRAZO_INVITATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * O token de convite, no formato que `apps/api` já sabe aceitar: 32 bytes
 * aleatórios em base64url, e no banco só o `sha256` em hexa. Está reproduzido
 * aqui, e não importado de `@pipe/authentication`, porque o CRM não depende desse
 * pacote — são cinco linhas e uma dependência a menos no bundle do Next.
 */
function novoToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: createHash('sha256').update(token).digest('hex') };
}

/**
 * The link the screen shows once, and the only way for the invitee to sign in.
 *
 * `PIPE_URL_APP` is the SCREENS' base (Gestão, when the invite is accepted
 * there). The default used to be `http://localhost:3000`, which is the **api**
 * — and the api doesn't serve `/convite/:token`: the invitee hit a 404 and the
 * invite died without anyone knowing. When the variable isn't set, the honest
 * destination is THIS app, which has the route
 * (`app/convite/[token]/page.tsx`).
 */
export function invitationUrl(token: string): string {
  const base = (
    process.env['PIPE_URL_APP'] ??
    process.env['PIPE_URL_ESTE_APP'] ??
    'http://localhost:3300'
  ).replace(/\/$/, '');
  return `${base}/invite/${token}`;
}

/**
 * Invite.
 *
 * Inviting again INVALIDATES the previous invite — without this every resend
 * leaves one more live link, and revoking access would mean hunting down all
 * of them. It's the same rule as the API's `criarConvite`, and
 * `expira_em = now()` is what implements it.
 *
 * The token only exists in this response: the database stores the hash, and
 * the screen shows the link once. After this nobody recovers it, not even
 * whoever reads the table.
 */
export async function convidar(
  ator: Ator,
  data: { email: string; roleId: string },
): Promise<Resultado> {
  const email = normalizarEmail(data.email);
  const queixa = recusarEmail(email);
  if (queixa) return { ok: false, error: queixa };

  return escrever(async (tx, tenantIdAtual) => {
    const [alvo] = await tx
      .select({ id: role.id, nome: role.nome })
      .from(role)
      .where(eq(role.id, data.roleId));
    if (!alvo) return { ok: false, erro: 'Este papel não existe nesta conta.' };

    const [jaDentro] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email!));
    if (jaDentro) return { ok: false, erro: `${email} já tem acesso a esta conta.` };

    await tx.execute(sql`
      update convite set expira_em = now(), atualizado_em = now()
       where email = ${email} and aceito_em is null and expira_em > now()
    `);

    const novo = novoToken();
    const [criado] = await tx
      .insert(invitation)
      .values({
        tenantId: tenantIdAtual,
        email: email!,
        papelId: alvo.id,
        tokenHash: novo.hash,
        expiraEm: new Date(Date.now() + PRAZO_INVITATION_MS),
        invitationCreatedBy: ator.id ?? null,
      })
      .returning({ id: invitation.id });

    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: 'criou',
      objetoTipo: 'convite',
      objetoId: criado!.id,
      depois: { email, papel: alvo.nome },
    });

    return { ok: true, segredo: invitationUrl(novo.token) };
  });
}

export async function cancelarInvitation(ator: Ator, id: string): Promise<Resultado> {
  return escrever(async (tx, tenantIdAtual) => {
    const [antes] = await tx
      .select({ id: invitation.id, email: invitation.email, expiraEm: invitation.expiraEm })
      .from(invitation)
      .where(and(eq(invitation.id, id), isNull(invitation.aceitoEm)));
    if (!antes) return { ok: false, error: 'Este convite já foi usado ou não existe.' };

    await tx
      .update(invitation)
      .set({ expiraEm: new Date(), atualizadoEm: new Date() })
      .where(eq(invitation.id, id));
    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: 'excluiu',
      objetoTipo: 'convite',
      objetoId: id,
      antes: { email: antes.email },
    });
    return OK;
  });
}

/**
 * Change someone's role.
 *
 * Pipe allows several roles per user in the schema, but the screen offers ONE:
 * two roles add up permission silently, and "why does this person see this?"
 * becomes a question with no answer on screen. Whoever needs a sum creates a
 * role that describes it — which is the honest answer, and the one audit can
 * explain.
 */
export async function definirRole(
  ator: Ator,
  userIdAlvo: string,
  roleId: string,
): Promise<Resultado> {
  return escrever(async (tx, tenantIdAtual) => {
    const [alvo] = await tx
      .select({ id: user.id, nome: user.nome })
      .from(user)
      .where(eq(user.id, userIdAlvo));
    if (!alvo) return { ok: false, error: 'Esta pessoa não existe nesta conta.' };

    const [novo] = await tx
      .select({ id: role.id, nome: role.nome })
      .from(role)
      .where(eq(role.id, roleId));
    if (!novo) return { ok: false, error: 'Este papel não existe nesta conta.' };

    const antigos = await tx
      .select({ nome: role.nome })
      .from(userRole)
      .innerJoin(role, eq(role.id, userRole.papelId))
      .where(eq(userRole.userId, userIdAlvo));

    await tx.delete(userRole).where(eq(userRole.userId, userIdAlvo));
    await tx
      .insert(userRole)
      .values({ tenantId: tenantIdAtual, userId: userIdAlvo, papelId: novo.id });

    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: 'alterou',
      objetoTipo: 'usuario_papel',
      objetoId: userIdAlvo,
      antes: { papeis: antigos.map((p) => p.nome) },
      depois: { papeis: [novo.nome] },
    });
    return OK;
  });
}

/**
 * Deactivate instead of delete.
 *
 * `usuario` is referenced by conversation, evaluation, lead, and log — deleting
 * the row would erase the authorship of everything the person did. Deactivating
 * removes access and keeps the history, which is what a contract audit asks
 * for.
 */
export async function memberDefinirActive(
  ator: Ator,
  userIdAlvo: string,
  ativo: boolean,
): Promise<Resultado> {
  if (ator.id === userIdAlvo && !ativo) {
    return { ok: false, error: 'Você não pode desativar o próprio acesso.' };
  }

  return escrever(async (tx, tenantIdAtual) => {
    const [antes] = await tx
      .select({ ativo: user.ativo, nome: user.nome })
      .from(user)
      .where(eq(user.id, userIdAlvo));
    if (!antes) return { ok: false, error: 'Esta pessoa não existe nesta conta.' };
    if (antes.ativo === ativo) return OK;

    await tx
      .update(user)
      .set({ ativo, atualizadoEm: new Date() })
      .where(eq(user.id, userIdAlvo));
    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: ativo ? 'ativou' : 'desativou',
      objetoTipo: 'usuario',
      objetoId: userIdAlvo,
      antes: { ativo: antes.ativo },
      depois: { ativo },
    });
    return OK;
  });
}

/* ================================================== roles and permissions */

export async function listarPapeis(): Promise<RoleSummary[]> {
  return consultar(async (tx) => {
    const { rows } = await tx.execute<{
      id: string;
      nome: string;
      descricao: string | null;
      de_sistema: boolean;
      permissoes: number;
      membros: number;
    }>(sql`
      select p.id, p.nome, p.descricao, p.de_sistema,
             (select count(*)::int from papel_permissao pp where pp.papel_id = p.id) as permissoes,
             (select count(*)::int from usuario_papel up where up.papel_id = p.id) as membros
        from papel p
       order by p.nome
    `);
    return rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      description: r.descricao,
      deSistema: r.de_sistema,
      permissions: Number(r.permissoes),
      members: Number(r.membros),
    }));
  });
}

/** The catalog is global — product vocabulary, the same for every customer. */
export async function permissionsListarCatalogo(): Promise<CatalogoPermission[]> {
  return consultar(async (tx) =>
    tx
      .select({
        codigo: permission.codigo,
        description: permission.descricao,
        grupo: permission.grupo,
      })
      .from(permission)
      .orderBy(asc(permission.grupo), asc(permission.codigo)),
  );
}

export async function readRole(id: string): Promise<RoleDetailed | null> {
  return consultar(async (tx) => {
    const [linha] = await tx
      .select({
        id: role.id,
        nome: role.nome,
        description: role.description,
        deSistema: role.deSistema,
      })
      .from(role)
      .where(eq(role.id, id));
    if (!linha) return null;

    const concedidas = await tx
      .select({ codigo: rolePermission.permissionCode })
      .from(rolePermission)
      .where(eq(rolePermission.roleId, id));

    const members = await tx
      .select({ nome: user.nome })
      .from(userRole)
      .innerJoin(user, eq(user.id, userRole.userId))
      .where(eq(userRole.papelId, id))
      .orderBy(asc(user.nome));

    return {
      ...linha,
      permissions: concedidas.length,
      members: members.length,
      concedidas: concedidas.map((c) => c.codigo),
      membersNames: members.map((m) => m.nome),
    };
  });
}

export async function createRole(
  ator: Ator,
  data: { nome: string; description: string | null },
): Promise<Resultado> {
  const nome = normalizar(data.nome);
  const queixa = recusarNome(nome, 'O nome do papel');
  if (queixa) return { ok: false, error: queixa };

  return escrever(async (tx, tenantIdAtual) => {
    const [existe] = await tx.select({ id: role.id }).from(role).where(eq(role.nome, nome!));
    if (existe) return { ok: false, error: `Já existe um papel chamado "${nome}".` };

    const description = normalizar(data.description);
    const [criado] = await tx
      .insert(role)
      .values({ tenantId: tenantIdAtual, nome: nome!, description })
      .returning({ id: role.id });

    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: 'criou',
      objetoTipo: 'papel',
      objetoId: criado!.id,
      depois: { nome, description },
    });
    return OK;
  });
}

/**
 * Save a role's permissions.
 *
 * The log keeps what came IN and what went OUT, not the whole list on both
 * sides: whoever reads the audit log wants to know that `chave_api.gerenciar`
 * was granted, not to reread the forty that stayed the same.
 *
 * A system role isn't editable — it's from day one, and a customer who wants a
 * different admin creates their own.
 */
export async function roleSalvarPermissions(
  ator: Ator,
  roleId: string,
  codigos: string[],
): Promise<Resultado> {
  return escrever(async (tx, tenantIdAtual) => {
    const [alvo] = await tx
      .select({ id: role.id, nome: role.nome, deSistema: role.deSistema })
      .from(role)
      .where(eq(role.id, roleId));
    if (!alvo) return { ok: false, error: 'Este papel não existe nesta conta.' };
    if (alvo.deSistema) {
      return { ok: false, error: 'Papel de sistema não é editável. Crie um papel próprio.' };
    }

    const catalogo = await tx.select({ codigo: permission.codigo }).from(permission);
    const conhecidas = new Set(catalogo.map((c) => c.codigo));
    const pedidas = [...new Set(codigos)].filter((c) => conhecidas.has(c));

    const current = await tx
      .select({ codigo: rolePermission.permissionCode })
      .from(rolePermission)
      .where(eq(rolePermission.roleId, roleId));
    const tinha = new Set(current.map((a) => a.codigo));

    const entraram = pedidas.filter((c) => !tinha.has(c));
    const sairam = [...tinha].filter((c) => !pedidas.includes(c));
    if (entraram.length === 0 && sairam.length === 0) return OK;

    await tx.delete(rolePermission).where(eq(rolePermission.roleId, roleId));
    if (pedidas.length > 0) {
      await tx.insert(rolePermission).values(
        pedidas.map((codigo) => ({
          tenantId: tenantIdAtual,
          roleId,
          permissionCode: codigo,
        })),
      );
    }

    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: 'alterou',
      objetoTipo: 'papel_permissao',
      objetoId: roleId,
      antes: { removidas: sairam },
      depois: { concedidas: entraram },
    });
    return OK;
  });
}

export async function excluirRole(ator: Ator, roleId: string): Promise<Resultado> {
  return escrever(async (tx, tenantIdAtual) => {
    const [alvo] = await tx
      .select({ nome: role.nome, descricao: role.description, deSistema: role.deSistema })
      .from(role)
      .where(eq(role.id, roleId));
    if (!alvo) return { ok: false, error: 'Este papel não existe nesta conta.' };
    if (alvo.deSistema) return { ok: false, error: 'Papel de sistema não pode ser excluído.' };

    const [comGente] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(userRole)
      .where(eq(userRole.papelId, roleId));
    if ((comGente?.n ?? 0) > 0) {
      return {
        ok: false,
        error: 'Ainda há gente com este papel. Troque o papel dessas pessoas antes de excluir.',
      };
    }

    await tx.delete(role).where(eq(role.id, roleId));
    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: 'excluiu',
      objetoTipo: 'papel',
      objetoId: roleId,
      antes: { nome: alvo.nome, descricao: alvo.descricao },
    });
    return OK;
  });
}

/* =================================================== campos personalizados */

/** The dictionary object the custom-fields screen manages. */
const OBJETO_LEAD = 'lead';

export async function listarCamposPersonalizados(): Promise<CampoPersonalizado[]> {
  return consultar(async (tx) => {
    const campos = await tx
      .select({
        id: dictionaryField.id,
        codigo: dictionaryField.codigo,
        rotulo: dictionaryField.rotulo,
        tipo: dictionaryField.tipo,
        description: dictionaryField.descricao,
      })
      .from(dictionaryField)
      .where(eq(dictionaryField.objetoCodigo, OBJETO_LEAD))
      .orderBy(asc(dictionaryField.rotulo));

    if (campos.length === 0) return [];

    // A single scan, with `lead.customizados`'s GIN index doing the work.
    const { rows } = await tx.execute<{ key: string; n: number }>(sql`
      select chave, count(*)::int as n
        from lead, lateral jsonb_object_keys(customizados) as chave
       where excluido_em is null
       group by chave
    `);
    const usoByKey = new Map(rows.map((r) => [r.key, Number(r.n)]));

    return campos.map((c) => ({ ...c, preenchidos: usoByKey.get(c.codigo) ?? 0 }));
  });
}

export async function createFieldCustom(
  ator: Ator,
  data: { codigo: string; rotulo: string; tipo: string; description: string | null },
): Promise<Resultado> {
  const codigo = normalizar(data.codigo)?.toLowerCase() ?? null;
  const rotulo = normalizar(data.rotulo);
  const queixa = recusarCodigoDeCampo(codigo) ?? recusarNome(rotulo, 'O rótulo');
  if (queixa) return { ok: false, error: queixa };
  if (!tipoDeCampoValido(data.tipo)) return { ok: false, error: 'Escolha um tipo para o campo.' };

  return escrever(async (tx, tenantIdAtual) => {
    const [existe] = await tx
      .select({ id: dictionaryField.id })
      .from(dictionaryField)
      .where(
        and(eq(dictionaryField.objetoCodigo, OBJETO_LEAD), eq(dictionaryField.codigo, codigo!)),
      );
    if (existe) return { ok: false, error: `Já existe um campo com o código "${codigo}".` };

    const description = normalizar(data.description);
    const [criado] = await tx
      .insert(dictionaryField)
      .values({
        tenantId: tenantIdAtual,
        objetoCodigo: OBJETO_LEAD,
        codigo: codigo!,
        rotulo: rotulo!,
        tipo: data.tipo,
        descricao: description,
        consultavel: true,
        agregavel: data.tipo === 'numero',
      })
      .returning({ id: dictionaryField.id });

    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: 'criou',
      objetoTipo: 'dicionario_campo',
      objetoId: criado!.id,
      depois: { codigo, rotulo, tipo: data.tipo, description },
    });
    return OK;
  });
}

/**
 * Rename, never re-code.
 *
 * `codigo` is the key inside each lead's `jsonb`: changing it would silently
 * orphan the stored value across the entire database. Label and description
 * are what the screen shows, and what gets corrected when someone typed it
 * wrong.
 */
export async function renomearCampoPersonalizado(
  ator: Ator,
  id: string,
  data: { rotulo: string; description: string | null },
): Promise<Resultado> {
  const rotulo = normalizar(data.rotulo);
  const queixa = recusarNome(rotulo, 'O rótulo');
  if (queixa) return { ok: false, error: queixa };

  return escrever(async (tx, tenantIdAtual) => {
    const [antes] = await tx
      .select({ rotulo: dictionaryField.rotulo, descricao: dictionaryField.descricao })
      .from(dictionaryField)
      .where(eq(dictionaryField.id, id));
    if (!antes) return { ok: false, error: 'Este campo não existe mais.' };

    const depois = { rotulo: rotulo!, descricao: normalizar(data.description) };
    await tx.update(dictionaryField).set(depois).where(eq(dictionaryField.id, id));
    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: 'alterou',
      objetoTipo: 'dicionario_campo',
      objetoId: id,
      ...diferenca(antes, depois),
    });
    return OK;
  });
}

/**
 * Deleting the field removes the DEFINITION, not the value.
 *
 * Whatever is stored in `lead.customizados` stays there, and the log keeps the
 * code — without this, deleting the definition would turn customer data into
 * nameless junk. Re-registering the same code makes the value reappear.
 */
export async function excluirCampoPersonalizado(ator: Ator, id: string): Promise<Resultado> {
  return escrever(async (tx, tenantIdAtual) => {
    const [antes] = await tx
      .select({
        codigo: dictionaryField.codigo,
        rotulo: dictionaryField.rotulo,
        tipo: dictionaryField.tipo,
      })
      .from(dictionaryField)
      .where(eq(dictionaryField.id, id));
    if (!antes) return { ok: false, error: 'Este campo não existe mais.' };

    await tx.delete(dictionaryField).where(eq(dictionaryField.id, id));
    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: 'excluiu',
      objetoTipo: 'dicionario_campo',
      objetoId: id,
      antes,
    });
    return OK;
  });
}

/* ============================================================ chave de API */

export async function listarChaves(): Promise<ApiKey[]> {
  return consultar(async (tx) => {
    const linhas = await tx
      .select({
        id: keyApi.id,
        nome: keyApi.nome,
        prefix: keyApi.prefix,
        scopes: keyApi.scopes,
        criadoEm: keyApi.criadoEm,
        expiraEm: keyApi.expiraEm,
        ultimoUsoEm: keyApi.ultimoUsoEm,
        revogadaEm: keyApi.revogadaEm,
      })
      .from(keyApi)
      .orderBy(asc(keyApi.nome));

    return linhas.map((l) => ({
      ...l,
      criadoEm: paraData(l.criadoEm),
      expiraEm: paraData(l.expiraEm),
      ultimoUsoEm: paraData(l.ultimoUsoEm),
      revogadaEm: paraData(l.revogadaEm),
    }));
  });
}

/**
 * Issue a key.
 *
 * The token is `pipe_<prefix>_<secret>`, the format `apps/api` authenticates. The
 * database keeps the prefix in the clear — it's how the API finds the row, and
 * it's what the screen shows the person to recognize the key by — and the
 * `sha256` of the secret. **The full token only exists in this response.**
 * Whoever loses it asks for another: showing it again would require storing
 * it, and then the table would become the credential.
 */
export async function createKey(
  ator: Ator,
  data: { nome: string; scopes: string[] },
): Promise<Resultado> {
  const nome = normalizar(data.nome);
  const queixa = recusarNome(nome, 'O nome da chave');
  if (queixa) return { ok: false, error: queixa };

  const scopes = scopesValid(data.scopes);
  if (scopes.length === 0) return { ok: false, error: 'Escolha ao menos um escopo.' };

  const prefix = randomBytes(6).toString('hex');
  const secret = randomBytes(24).toString('base64url');

  return escrever(async (tx, tenantIdAtual) => {
    const [criada] = await tx
      .insert(keyApi)
      .values({
        tenantId: tenantIdAtual,
        nome: nome!,
        prefix,
        hash: createHash('sha256').update(secret).digest('hex'),
        scopes,
        createdBy: ator.id ?? null,
      })
      .returning({ id: keyApi.id });

    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: 'criou',
      objetoTipo: 'chave_api',
      objetoId: criada!.id,
      depois: { nome, prefix, scopes },
    });

    return { ok: true, segredo: `pipe_${prefix}_${secret}` };
  });
}

export async function revogarKey(ator: Ator, id: string): Promise<Resultado> {
  return escrever(async (tx, tenantIdAtual) => {
    const [antes] = await tx
      .select({ nome: keyApi.nome, revogadaEm: keyApi.revogadaEm })
      .from(keyApi)
      .where(eq(keyApi.id, id));
    if (!antes) return { ok: false, error: 'Esta chave não existe mais.' };
    if (antes.revogadaEm) return OK;

    await tx
      .update(keyApi)
      .set({ revogadaEm: new Date(), atualizadoEm: new Date() })
      .where(eq(keyApi.id, id));
    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: 'desativou',
      objetoTipo: 'chave_api',
      objetoId: id,
      antes: { nome: antes.nome, revogada: false },
      depois: { revogada: true },
    });
    return OK;
  });
}

/* ============================================================== webhooks */

export async function listarWebhooks(): Promise<WebhookDeSaida[]> {
  return consultar(async (tx) => {
    const { rows } = await tx.execute<{
      id: string;
      url: string;
      eventos: string[];
      ativo: boolean;
      criado_em: unknown;
      pendentes: number;
      falhas: number;
    }>(sql`
      select w.id, w.url, w.eventos, w.ativo, w.criado_em,
             (select count(*)::int from entrega_webhook e
               where e.webhook_id = w.id and e.estado = 'pendente') as pendentes,
             (select count(*)::int from entrega_webhook e
               where e.webhook_id = w.id and e.estado = 'falhou') as falhas
        from webhook_saida w
       order by w.criado_em desc
    `);
    return rows.map((r) => ({
      id: r.id,
      url: r.url,
      eventos: r.eventos ?? [],
      ativo: r.ativo,
      criadoEm: paraData(r.criado_em),
      entregas: { pendentes: Number(r.pendentes), falhas: Number(r.falhas) },
    }));
  });
}

/**
 * Create a webhook.
 *
 * The HMAC secret is generated here and **encrypted at rest** with
 * `@pipe/db`'s keyring — the same protection as the channel secret. It shows up
 * once, for whoever will check the signature on the other side; after that not
 * even the screen recovers it. `estaCifrado` already guarantees nobody saves
 * plaintext by mistake.
 */
export async function createWebhook(
  ator: Ator,
  data: { url: string; eventos: string[] },
): Promise<Resultado> {
  const url = normalizar(data.url);
  const queixa = recusarUrl(url, { exigirHttps: true });
  if (queixa) return { ok: false, error: queixa };

  const eventos = eventosValidos(data.eventos);
  if (eventos.length === 0) return { ok: false, error: 'Escolha ao menos um evento.' };

  const secret = randomBytes(32).toString('base64url');
  let cifrado: string;
  try {
    cifrado = cifrar(secret, keyringOfAmbiente());
  } catch {
    return {
      ok: false,
      error: 'O chaveiro de segredos não está configurado (PIPE_CHAVES_SEGREDO).',
    };
  }

  return escrever(async (tx, tenantIdAtual) => {
    const [criado] = await tx
      .insert(webhookSaida)
      .values({ tenantId: tenantIdAtual, url: url!, eventos, secret: cifrado })
      .returning({ id: webhookSaida.id });

    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: 'criou',
      objetoTipo: 'webhook_saida',
      objetoId: criado!.id,
      depois: { url, eventos },
    });

    return { ok: true, secret };
  });
}

export async function definirAtivoDoWebhook(
  ator: Ator,
  id: string,
  ativo: boolean,
): Promise<Resultado> {
  return escrever(async (tx, tenantIdAtual) => {
    const [antes] = await tx
      .select({ url: webhookSaida.url, ativo: webhookSaida.ativo })
      .from(webhookSaida)
      .where(eq(webhookSaida.id, id));
    if (!antes) return { ok: false, error: 'Este webhook não existe mais.' };
    if (antes.ativo === ativo) return OK;

    await tx
      .update(webhookSaida)
      .set({ ativo, atualizadoEm: new Date() })
      .where(eq(webhookSaida.id, id));
    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: ativo ? 'ativou' : 'desativou',
      objetoTipo: 'webhook_saida',
      objetoId: id,
      antes: { url: antes.url, ativo: antes.ativo },
      depois: { ativo },
    });
    return OK;
  });
}

export async function excluirWebhook(ator: Ator, id: string): Promise<Resultado> {
  return escrever(async (tx, tenantIdAtual) => {
    const [antes] = await tx
      .select({ url: webhookSaida.url, eventos: webhookSaida.eventos })
      .from(webhookSaida)
      .where(eq(webhookSaida.id, id));
    if (!antes) return { ok: false, error: 'Este webhook não existe mais.' };

    await tx.delete(webhookSaida).where(eq(webhookSaida.id, id));
    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: 'excluiu',
      objetoTipo: 'webhook_saida',
      objetoId: id,
      antes: { url: antes.url, eventos: antes.eventos },
    });
    return OK;
  });
}
