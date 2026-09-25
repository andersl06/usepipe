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
  nome: string;
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
 * O cartão de resumo, sempre visível — `tenant-summary` tem read para os três
 * papéis deles.
 *
 * Duas diferenças anotadas em relação à origem, e as duas são a nosso favor: lá
 * `tenant.applications` é inicializado como `[]` e nunca preenchido, então a
 * linha "Chatbots" não aparece na prática; e `members` só é carregado para
 * `admin`, porque a lista vem junto da assinatura. Aqui os dois números saem de
 * um `count` do banco e valem para quem abrir a tela.
 */
export async function loadSummaryOfContract(
  tx: TransactionPipe,
  tid: string,
): Promise<SummaryOfContract> {
  return consultar(tx, async (tx) => {
    const [linha] = await tx
      .select({
        id: tenant.id,
        nome: tenant.nome,
        slug: tenant.slug,
        logoUrl: tenant.logoUrl,
        criadoEm: tenant.criadoEm,
        fuso: tenant.fuso,
      })
      .from(tenant)
      .where(eq(tenant.id, tid))
      .limit(1);

    /* Uma consulta de cada vez: a transação vive numa conexão só, e duas
       concorrentes nela se atropelam (a mesma nota de `lib/portal.ts`). */
    const [flows] = await tx
      .select({ n: count() })
      .from(flow)
      .where(ne(flow.estado, 'arquivado'));
    const [members] = await tx.select({ n: count() }).from(user).where(eq(user.ativo, true));

    return {
      id: linha?.id ?? tid,
      nome: linha?.nome ?? '',
      slug: linha?.slug ?? '',
      logoUrl: linha?.logoUrl ?? null,
      criadoEm: linha?.criadoEm ?? null,
      fuso: linha?.fuso ?? 'America/Sao_Paulo',
      fluxos: flows?.n ?? 0,
      membros: members?.n ?? 0,
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
  nome: string;
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
  nome: string;
  email: string;
  avatarUrl: string | null;
  roleId: string | null;
  roleName: string | null;
}

/**
 * Os três papéis de conta — os únicos que Membros e Convidar oferecem. Gestor,
 * supervisor, atendente e avaliador são de atendimento e ficam fora, como na
 * origem, onde eles são dados por contato.
 */
export async function loadPapeisOfAccount(tx: TransactionPipe): Promise<RoleOfAccount[]> {
  return consultar(tx, (tx) =>
    tx
      .select({ id: role.id, nome: role.nome })
      .from(role)
      .where(eq(role.scope, 'conta'))
      .orderBy(asc(role.nome)),
  );
}

/**
 * Quem tem acesso à conta — e quem foi convidado e ainda não entrou.
 *
 * Só quem está ativo: "remover" aqui é desativar (ver `removerMembro`), e quem
 * saiu não é membro. O nome continua na conversa, na avaliação e no log — é
 * justamente por isso que a linha do usuário não é apagada.
 *
 * Os convites em aberto entram na MESMA lista, como na origem: lá o convidado
 * já é uma linha de `tenant-user` com `userStatus: "PendingUser"`, e a tela o
 * mostra junto dos outros com "(Pendente)" no nome. Convite vencido ou já
 * aceito não aparece — o primeiro não dá acesso a ninguém e o segundo já virou
 * usuário, e apareceria duas vezes.
 *
 * Convidado não tem nome: só sabemos o e-mail até a primeira entrada. Fica o
 * trecho antes do `@`, que é o mesmo apanhado da origem quando a busca da conta
 * falha (`decodeURIComponent(userIdentity.split("@")[0])`).
 */
export async function loadMembers(tx: TransactionPipe): Promise<MemberOfContract[]> {
  return consultar(tx, async (tx) => {
    const linhas = await tx
      .select({
        id: user.id,
        nome: user.nome,
        email: user.email,
        avatarUrl: user.avatarUrl,
        papelId: role.id,
        papelNome: role.nome,
      })
      .from(user)
      /* Só o papel de CONTA: é UM por pessoa (índice parcial da 0021), então o
         join não multiplica a linha. Os de atendimento não são assunto desta tela. */
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
        papelId: role.id,
        papelNome: role.nome,
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
        nome: c.email.slice(0, c.email.indexOf('@')),
        avatarUrl: null,
      })),
    ];
  });
}

export type Recording = { ok: true } | { ok: false; error: string };

const OK: Recording = { ok: true };

/** O nome do papel de conta que a origem chama de `admin` — ver `PAPEIS_DA_ORIGEM`. */
const ROLE_ADMIN = 'admin';

const MESSAGE_LAST_ADMIN =
  'Este é o último administrador do contrato. Dê o papel de Admin a outra pessoa antes.';

/**
 * Quantos administradores de CONTA ainda estão ativos.
 *
 * Conta só quem tem acesso (`usuario.ativo`): um admin desativado não segura
 * ninguém, e é justamente o "ativo = false" que a exclusão já faz.
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
 * Troca o papel de CONTA de um membro.
 *
 * UM por pessoa, como na origem (`roleId` é um campo só): o de conta antigo sai
 * antes do novo entrar, na mesma transação. Os papéis de atendimento (gestor,
 * atendente…) NÃO são tocados — trocar "Admin" por "Pode visualizar" não tira
 * ninguém do atendimento. A auditoria guarda o antes e o depois.
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

    // Rebaixar o ÚLTIMO admin ativo tiraria a única conta que pode devolver o
    // papel a alguém — o contrato ficaria sem quem administra.
    const eraAdmin = alvo.ativo && antigos.some((p) => p.nome === ROLE_ADMIN);
    if (eraAdmin && novo.nome !== ROLE_ADMIN && (await contarAdministradoresAtivos(tx)) <= 1) {
      return { ok: false, error: MESSAGE_LAST_ADMIN };
    }

    await tx.delete(userRole).where(ofAccount);
    await tx
      .insert(userRole)
      .values({ tenantId: tid, usuarioId: userIdTarget, papelId: novo.id, escopo: 'conta' });

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
 * Tira alguém do contrato.
 *
 * **Desativa, não apaga.** `usuario` é referenciado por conversa, avaliação,
 * lead e log de auditoria: apagar a linha apagaria a autoria de tudo o que a
 * pessoa fez — que é exatamente o que uma auditoria de contrato vai procurar.
 * `ativo = false` já barra a entrada (`packages/autenticacao/src/entrada.ts`),
 * que é o efeito que a tela promete.
 *
 * O papel FICA. Reativar alguém sem papel nenhum daria acesso a uma tela vazia,
 * e quem volta costuma voltar para a mesma função.
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
    // Mesma trava de `definirPapelDoMembro`: remover o último admin ativo
    // deixaria o contrato sem ninguém que possa dar o papel a outra pessoa.
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
 * Troca o papel de um convite que ainda não foi usado.
 *
 * Na origem isto é a MESMA chamada de `definirPapelDoMembro` — lá o convidado
 * já é uma linha de `tenant-user` e `set .../role` vale para ele igual. Aqui a
 * linha vive em `convite`, então é uma função à parte; o efeito é o mesmo, e o
 * papel novo é o que vai valer quando a pessoa entrar.
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
 * Cancela um convite em aberto.
 *
 * **Vence, não apaga.** A linha do convite é a prova de quem chamou quem, e é o
 * que uma auditoria procura quando alguém de fora aparece dentro. Vencer o
 * prazo já mata o link — é a mesma jogada de `criarConvite`, que vence o
 * anterior antes de emitir outro.
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
