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
 * A camada de dados da área de configurações. **Só banco.**
 *
 * Nada aqui sabe que existe Next: não há `revalidatePath`, não há JSX, não há
 * `'use server'`. Quem chama é a server action em `app/configuracoes/acoes.ts`,
 * e é ela que revalida a rota depois. O motivo está no README, em "Quem fala com
 * o banco — a fronteira": `apps/crm` vai para o Vite e a `apps/api` passa a ser a
 * única porta do Postgres, e então virar endpoint precisa ser MOVER este arquivo,
 * não reescrevê-lo.
 *
 * Duas regras valem em todas as escritas daqui, sem exceção:
 *
 * 1. **Toda escrita registra auditoria, na MESMA transação.** Configuração é a
 *    área em que "quem mudou o quê" mais importa — sobretudo membro e papel, que
 *    é mudar quem enxerga o quê. Log em transação separada mente quando a
 *    mudança é desfeita.
 * 2. **Consulta em série.** `Promise.all` dentro da transação derruba o
 *    `pipe.tenant_id` e a consulta passa a rodar sem tenant (README).
 */

/** Abre a transação já com o tenant fixado, e entrega o id junto para a auditoria. */
async function escrever<T>(fn: (tx: TransactionPipe, tenant: string) => Promise<T>): Promise<T> {
  const id = await tenantId();
  return consultar((tx) => fn(tx, id));
}

const OK: Resultado = { ok: true };

/* ================================================================== perfil */

/**
 * Quem está mexendo.
 *
 * O CRM ainda não tem sessão própria — `banco.ts` resolve o tenant por variável
 * de ambiente, e aqui é a mesma história: `PIPE_USUARIO_ID` quando existe, senão
 * o primeiro usuário ativo do tenant. Não é o desenho final, e está escrito para
 * ser trocado numa linha quando `packages/autenticacao` chegar nesta tela: o
 * resto do arquivo só conhece o `Ator` que sai daqui.
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
        ultimoAcessoEm: user.lastAccessAt,
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
      ultimoAcessoEm: paraData(pessoa.ultimoAcessoEm),
      papeis: papeis.map((p) => p.nome),
    };
  });
}

/** O ator das escritas desta tela. Sempre uma pessoa: aqui não há cron nem chave. */
export async function atorAtual(): Promise<Ator> {
  const pessoa = await userCurrent();
  return { tipo: 'usuario', id: pessoa.id };
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

/* ====================================================== espaço de trabalho */

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
        implantacao: tenant.deployment,
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
      membros: count?.n ?? 0,
      dominios: dominios.map((d) => ({ dominio: d.dominio, verificado: d.verificadoEm !== null })),
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
        ultimoAcessoEm: user.lastAccessAt,
        papelId: role.id,
        papel: role.nome,
      })
      .from(user)
      .leftJoin(userRole, eq(userRole.userId, user.id))
      .leftJoin(role, eq(role.id, userRole.papelId))
      .orderBy(asc(user.nome), asc(role.nome));

    // O `left join` devolve uma linha por papel, e o schema permite vários. A tela
    // oferece UM papel (ver `definirPapel`), então aqui fica o primeiro em ordem
    // alfabética — e nunca duas linhas para a mesma pessoa, que viraria chave
    // repetida na tabela e uma pessoa contada duas vezes.
    const byPessoa = new Map<string, Member>();
    for (const l of linhas) {
      if (byPessoa.has(l.id)) continue;
      byPessoa.set(l.id, { ...l, ultimoAccessIn: paraData(l.ultimoAcessoEm) });
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
      convidadoBy: string | null;
    }>(sql`
      select c.id, c.email, p.nome as papel, c.expira_em, u.nome as convidado_por
        from convite c
        join papel p on p.id = c.papel_id
        left join usuario u on u.id = c.criado_por
       where c.aceito_em is null and c.expira_em > now()
       order by c.criado_em desc
    `);
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      papel: r.role,
      expiraEm: paraData(r.expira_em) ?? new Date(),
      convidadoPor: r.convidadoBy,
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
 * O link que a tela mostra uma vez, e a única forma de o convidado entrar.
 *
 * `PIPE_URL_APP` é a base das TELAS (a Gestão, quando o convite é aceito lá).
 * O padrão era `http://localhost:3000`, que é a **api** — e a api não serve
 * `/convite/:token`: o convidado tomava 404 e o convite morria sem que ninguém
 * soubesse. Quando a variável não está posta, o destino honesto é ESTE
 * aplicativo, que tem a rota (`app/convite/[token]/page.tsx`).
 */
export function invitationUrl(token: string): string {
  const base = (
    process.env['PIPE_URL_APP'] ??
    process.env['PIPE_URL_ESTE_APP'] ??
    'http://localhost:3300'
  ).replace(/\/$/, '');
  return `${base}/convite/${token}`;
}

/**
 * Convidar.
 *
 * Convidar de novo INVALIDA o convite anterior — sem isso cada reenvio deixa mais
 * um link vivo e cancelar o acesso viraria caçar todos eles. É a mesma regra do
 * `criarConvite` da API, e o `expira_em = now()` é o que a implementa.
 *
 * O token só existe nesta resposta: o banco guarda o hash, e a tela mostra o link
 * uma vez. Depois daqui ninguém o recupera, nem quem lê a tabela.
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
        criadoPor: ator.id ?? null,
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
 * Trocar o papel de alguém.
 *
 * O Pipe permite vários papéis por usuário no schema, mas a tela oferece UM: dois
 * papéis somam permissão em silêncio, e "por que essa pessoa vê isso?" vira uma
 * pergunta sem resposta na tela. Quem precisar de soma cria um papel que a
 * descreva — que é a resposta honesta e é a que a auditoria consegue explicar.
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
      .values({ tenantId: tenantIdAtual, usuarioId: userIdAlvo, papelId: novo.id });

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
 * Desativar em vez de excluir.
 *
 * `usuario` é referenciado por conversa, avaliação, lead e log — apagar a linha
 * apagaria a autoria de tudo o que a pessoa fez. Desativar tira o acesso e mantém
 * a história, que é o que uma auditoria de contrato pede.
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

/* ================================================== papéis e permissões */

export async function listarPapeis(): Promise<RoleSummary[]> {
  return consultar(async (tx) => {
    const { rows } = await tx.execute<{
      id: string;
      nome: string;
      description: string | null;
      de_sistema: boolean;
      permissions: number;
      members: number;
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
      descricao: r.description,
      deSistema: r.de_sistema,
      permissoes: Number(r.permissions),
      membros: Number(r.members),
    }));
  });
}

/** O catálogo é global — vocabulário do produto, igual para todo cliente. */
export async function permissionsListarCatalogo(): Promise<CatalogoPermission[]> {
  return consultar(async (tx) =>
    tx
      .select({
        codigo: permission.codigo,
        descricao: permission.descricao,
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
        descricao: role.description,
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
      permissoes: concedidas.length,
      membros: members.length,
      concedidas: concedidas.map((c) => c.codigo),
      nomesDosMembros: members.map((m) => m.nome),
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
 * Gravar as permissões de um papel.
 *
 * O log guarda o que ENTROU e o que SAIU, não a lista inteira dos dois lados:
 * quem lê a auditoria quer saber que `chave_api.gerenciar` foi concedida, não
 * reler as quarenta que continuaram iguais.
 *
 * Papel de sistema não é editável — é o do dia 1, e o cliente que quiser um
 * administrador diferente cria o dele.
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
          permissaoCodigo: codigo,
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

/** O objeto do dicionário que a tela de campos personalizados administra. */
const OBJETO_LEAD = 'lead';

export async function listarCamposPersonalizados(): Promise<CampoPersonalizado[]> {
  return consultar(async (tx) => {
    const campos = await tx
      .select({
        id: dictionaryField.id,
        codigo: dictionaryField.codigo,
        rotulo: dictionaryField.rotulo,
        tipo: dictionaryField.tipo,
        descricao: dictionaryField.descricao,
      })
      .from(dictionaryField)
      .where(eq(dictionaryField.objetoCodigo, OBJETO_LEAD))
      .orderBy(asc(dictionaryField.rotulo));

    if (campos.length === 0) return [];

    // Uma varredura só, com o índice GIN de `lead.customizados` fazendo o trabalho.
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
        description,
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
 * Renomear, nunca recodificar.
 *
 * O `codigo` é a chave dentro do `jsonb` de cada lead: mudá-lo deixaria o valor
 * gravado órfão em toda a base, em silêncio. Rótulo e descrição são o que a tela
 * mostra, e é o que se corrige quando alguém digitou errado.
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
 * Excluir o campo tira a DEFINIÇÃO, não o valor.
 *
 * O que estiver gravado em `lead.customizados` continua lá, e o log guarda o
 * código — sem isso, apagar a definição transformaria dado de cliente em lixo
 * sem nome. Recadastrar o mesmo código faz o valor voltar a aparecer.
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
        prefixo: keyApi.prefix,
        escopos: keyApi.scopes,
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
 * Emitir chave.
 *
 * O token é `pipe_<prefixo>_<segredo>`, o formato que `apps/api` autentica. O
 * banco fica com o prefixo em claro — é por ele que a API acha a linha, e é o que
 * a tela mostra para a pessoa reconhecer a chave — e com o `sha256` do segredo.
 * **O token completo só existe nesta resposta.** Quem perder pede outra: mostrar
 * de novo exigiria guardá-lo, e aí a tabela viraria a credencial.
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
        criadaPor: ator.id ?? null,
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
 * Criar webhook.
 *
 * O segredo do HMAC é gerado aqui e **cifrado em repouso** com o chaveiro de
 * `@pipe/db` — a mesma proteção do segredo de canal. Ele aparece uma vez, para
 * quem vai conferir a assinatura do outro lado; depois disso nem a tela o
 * recupera. `estaCifrado` já garante que ninguém grave texto claro por engano.
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
      .values({ tenantId: tenantIdAtual, url: url!, eventos, segredo: cifrado })
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
