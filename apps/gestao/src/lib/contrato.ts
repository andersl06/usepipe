import { and, asc, count, eq, gt, isNull, ne } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import { convite, fluxo, papel, tenant, usuario, usuarioPapel } from '@pipe/db/schema';
import { atorDaGestao, consultar, tenantId } from './banco';

/**
 * O que o Painel do contrato (`/contrato`) lê e grava.
 *
 * Nada aqui sabe que o Next existe — sem `revalidatePath`, sem JSX —, como em
 * `lib/configuracoes.ts`: recebe parâmetro, devolve dado. É o que faz virar
 * endpoint da `apps/api` por movimentação e não por reescrita (README, "Quem
 * fala com o banco").
 *
 * A régua da tela é `docs/pesquisa/blip-painel-do-contrato.md`.
 */

export interface ResumoDoContrato {
  id: string;
  nome: string;
  slug: string;
  logoUrl: string | null;
  criadoEm: Date | null;
  /** O fuso da conta: é nele que a data de criação é escrita, não no do servidor. */
  fuso: string;
  /** Os "Chatbots" do cartão deles. Aqui é fluxo e roteador, fora os arquivados. */
  fluxos: number;
  /** Os "Membros". Só conta quem ainda tem acesso. */
  membros: number;
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
export async function carregarResumoDoContrato(): Promise<ResumoDoContrato> {
  const tid = await tenantId();
  return consultar(async (tx) => {
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
    const [fluxos] = await tx
      .select({ n: count() })
      .from(fluxo)
      .where(ne(fluxo.estado, 'arquivado'));
    const [membros] = await tx.select({ n: count() }).from(usuario).where(eq(usuario.ativo, true));

    return {
      id: linha?.id ?? tid,
      nome: linha?.nome ?? '',
      slug: linha?.slug ?? '',
      logoUrl: linha?.logoUrl ?? null,
      criadoEm: linha?.criadoEm ?? null,
      fuso: linha?.fuso ?? 'America/Sao_Paulo',
      fluxos: fluxos?.n ?? 0,
      membros: membros?.n ?? 0,
    };
  });
}

/**
 * Um dos três papéis de CONTA (`papel.escopo = 'conta'`, migração 0021). O
 * `nome` é o `roleId` da origem — `admin`, `member`, `guest` — e é por ele que a
 * tela acha o rótulo, a descrição e o ícone (`PAPEIS_DA_ORIGEM`).
 */
export interface PapelDaConta {
  id: string;
  nome: string;
}

export interface MembroDoContrato {
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
  papelId: string | null;
  papelNome: string | null;
}

/**
 * Os três papéis de conta — os únicos que Membros e Convidar oferecem. Gestor,
 * supervisor, atendente e avaliador são de atendimento e ficam fora, como na
 * origem, onde eles são dados por contato.
 */
export async function carregarPapeisDaConta(): Promise<PapelDaConta[]> {
  return consultar((tx) =>
    tx
      .select({ id: papel.id, nome: papel.nome })
      .from(papel)
      .where(eq(papel.escopo, 'conta'))
      .orderBy(asc(papel.nome)),
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
export async function carregarMembros(): Promise<MembroDoContrato[]> {
  return consultar(async (tx) => {
    const linhas = await tx
      .select({
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        avatarUrl: usuario.avatarUrl,
        papelId: papel.id,
        papelNome: papel.nome,
      })
      .from(usuario)
      /* Só o papel de CONTA: é UM por pessoa (índice parcial da 0021), então o
         join não multiplica a linha. Os de atendimento não são assunto desta tela. */
      .leftJoin(
        usuarioPapel,
        and(eq(usuarioPapel.usuarioId, usuario.id), eq(usuarioPapel.escopo, 'conta')),
      )
      .leftJoin(papel, eq(papel.id, usuarioPapel.papelId))
      .where(eq(usuario.ativo, true))
      .orderBy(asc(usuario.nome));

    /* Defesa barata contra linha repetida, que viraria chave duplicada na lista. */
    const porPessoa = new Map<string, MembroDoContrato>();
    for (const linha of linhas) {
      if (porPessoa.has(linha.id)) continue;
      porPessoa.set(linha.id, { ...linha, tipo: 'usuario' });
    }

    const pendentes = await tx
      .select({
        id: convite.id,
        email: convite.email,
        papelId: papel.id,
        papelNome: papel.nome,
      })
      .from(convite)
      .innerJoin(papel, eq(papel.id, convite.papelId))
      .where(and(isNull(convite.aceitoEm), gt(convite.expiraEm, new Date())))
      .orderBy(asc(convite.email));

    return [
      ...porPessoa.values(),
      ...pendentes.map((c) => ({
        ...c,
        tipo: 'convite' as const,
        nome: c.email.slice(0, c.email.indexOf('@')),
        avatarUrl: null,
      })),
    ];
  });
}

export type Gravacao = { ok: true } | { ok: false; erro: string };

const OK: Gravacao = { ok: true };

/**
 * Troca o papel de CONTA de um membro.
 *
 * UM por pessoa, como na origem (`roleId` é um campo só): o de conta antigo sai
 * antes do novo entrar, na mesma transação. Os papéis de atendimento (gestor,
 * atendente…) NÃO são tocados — trocar "Admin" por "Pode visualizar" não tira
 * ninguém do atendimento. A auditoria guarda o antes e o depois.
 */
export async function definirPapelDoMembro(
  usuarioIdAlvo: string,
  papelId: string,
): Promise<Gravacao> {
  const tid = await tenantId();
  const ator = await atorDaGestao();

  return consultar(async (tx) => {
    const [alvo] = await tx
      .select({ id: usuario.id })
      .from(usuario)
      .where(eq(usuario.id, usuarioIdAlvo))
      .limit(1);
    if (!alvo) return { ok: false, erro: 'Esta pessoa não faz parte deste contrato.' };

    const [novo] = await tx
      .select({ id: papel.id, nome: papel.nome })
      .from(papel)
      .where(and(eq(papel.id, papelId), eq(papel.escopo, 'conta')))
      .limit(1);
    if (!novo) return { ok: false, erro: 'Este papel não existe neste contrato.' };

    const daConta = and(eq(usuarioPapel.usuarioId, usuarioIdAlvo), eq(usuarioPapel.escopo, 'conta'));
    const antigos = await tx
      .select({ nome: papel.nome })
      .from(usuarioPapel)
      .innerJoin(papel, eq(papel.id, usuarioPapel.papelId))
      .where(daConta);

    await tx.delete(usuarioPapel).where(daConta);
    await tx
      .insert(usuarioPapel)
      .values({ tenantId: tid, usuarioId: usuarioIdAlvo, papelId: novo.id, escopo: 'conta' });

    await registrarAuditoria(tx, tid, {
      ator,
      acao: 'alterou',
      objetoTipo: 'usuario_papel',
      objetoId: usuarioIdAlvo,
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
export async function removerMembro(usuarioIdAlvo: string): Promise<Gravacao> {
  const tid = await tenantId();
  const ator = await atorDaGestao();

  return consultar(async (tx) => {
    const [alvo] = await tx
      .select({ id: usuario.id, nome: usuario.nome, ativo: usuario.ativo })
      .from(usuario)
      .where(eq(usuario.id, usuarioIdAlvo))
      .limit(1);
    if (!alvo) return { ok: false, erro: 'Esta pessoa não faz parte deste contrato.' };
    if (!alvo.ativo) return OK;

    await tx.update(usuario).set({ ativo: false }).where(eq(usuario.id, usuarioIdAlvo));

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
export async function definirPapelDoConvite(conviteId: string, papelId: string): Promise<Gravacao> {
  const tid = await tenantId();
  const ator = await atorDaGestao();

  return consultar(async (tx) => {
    const [alvo] = await tx
      .select({ id: convite.id, email: convite.email, papelId: convite.papelId })
      .from(convite)
      .where(and(eq(convite.id, conviteId), isNull(convite.aceitoEm)))
      .limit(1);
    if (!alvo) return { ok: false, erro: 'Este convite não está mais aberto.' };

    const [novo] = await tx
      .select({ id: papel.id, nome: papel.nome })
      .from(papel)
      .where(and(eq(papel.id, papelId), eq(papel.escopo, 'conta')))
      .limit(1);
    if (!novo) return { ok: false, erro: 'Este papel não existe neste contrato.' };

    await tx
      .update(convite)
      .set({ papelId: novo.id, atualizadoEm: new Date() })
      .where(eq(convite.id, conviteId));

    await registrarAuditoria(tx, tid, {
      ator,
      acao: 'alterou',
      objetoTipo: 'convite',
      objetoId: conviteId,
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
export async function cancelarConvite(conviteId: string): Promise<Gravacao> {
  const tid = await tenantId();
  const ator = await atorDaGestao();

  return consultar(async (tx) => {
    const [alvo] = await tx
      .select({ id: convite.id, expiraEm: convite.expiraEm })
      .from(convite)
      .where(and(eq(convite.id, conviteId), isNull(convite.aceitoEm)))
      .limit(1);
    if (!alvo) return { ok: false, erro: 'Este convite não está mais aberto.' };

    const agora = new Date();
    await tx
      .update(convite)
      .set({ expiraEm: agora, atualizadoEm: agora })
      .where(eq(convite.id, conviteId));

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
