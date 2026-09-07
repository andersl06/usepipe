import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  cifrar,
  chaveiroDoAmbiente,
  diferenca,
  registrarAuditoria,
  type Ator,
  type TransacaoPipe,
} from '@pipe/db';
import {
  chaveApi,
  convite,
  dicionarioCampo,
  dominioTenant,
  papel,
  papelPermissao,
  permissao,
  tenant,
  usuario,
  usuarioPapel,
  webhookSaida,
} from '@pipe/db/schema';
import { consultar, paraData, tenantId } from './banco';
import {
  escoposValidos,
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
  type ChaveDeApi,
  type ConvitePendente,
  type Espaco,
  type Membro,
  type PapelDetalhado,
  type Perfil,
  type PermissaoDoCatalogo,
  type Resultado,
  type ResumoDePapel,
  type WebhookDeSaida,
} from './configuracoes-comum';

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
async function escrever<T>(fn: (tx: TransacaoPipe, tenant: string) => Promise<T>): Promise<T> {
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
export async function usuarioAtual(): Promise<Perfil> {
  const fixo = process.env['PIPE_USUARIO_ID'];
  return consultar(async (tx) => {
    const linhas = await tx
      .select({
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        avatarUrl: usuario.avatarUrl,
        ultimoAcessoEm: usuario.ultimoAcessoEm,
      })
      .from(usuario)
      .where(fixo ? eq(usuario.id, fixo) : eq(usuario.ativo, true))
      .orderBy(asc(usuario.criadoEm))
      .limit(1);

    const pessoa = linhas[0];
    if (!pessoa) throw new Error('nenhum usuário neste tenant: rode a semente antes.');

    const papeis = await tx
      .select({ nome: papel.nome })
      .from(usuarioPapel)
      .innerJoin(papel, eq(papel.id, usuarioPapel.papelId))
      .where(eq(usuarioPapel.usuarioId, pessoa.id))
      .orderBy(asc(papel.nome));

    return {
      ...pessoa,
      ultimoAcessoEm: paraData(pessoa.ultimoAcessoEm),
      papeis: papeis.map((p) => p.nome),
    };
  });
}

/** O ator das escritas desta tela. Sempre uma pessoa: aqui não há cron nem chave. */
export async function atorAtual(): Promise<Ator> {
  const pessoa = await usuarioAtual();
  return { tipo: 'usuario', id: pessoa.id };
}

export async function salvarPerfil(
  ator: Ator,
  dados: { nome: string; avatarUrl: string | null },
): Promise<Resultado> {
  const nome = normalizar(dados.nome);
  const queixa =
    recusarNome(nome) ?? recusarUrl(normalizar(dados.avatarUrl), { obrigatoria: false });
  if (queixa) return { ok: false, erro: queixa };

  const avatarUrl = normalizar(dados.avatarUrl);
  const id = ator.id;
  if (!id) return { ok: false, erro: 'Não sei quem está salvando.' };

  return escrever(async (tx, tenant) => {
    const [antes] = await tx
      .select({ nome: usuario.nome, avatarUrl: usuario.avatarUrl })
      .from(usuario)
      .where(eq(usuario.id, id));
    if (!antes) return { ok: false, erro: 'Este acesso não existe mais.' };

    const depois = { nome: nome!, avatarUrl };
    await tx.update(usuario).set({ ...depois, atualizadoEm: new Date() }).where(eq(usuario.id, id));
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
        implantacao: tenant.implantacao,
      })
      .from(tenant)
      .limit(1);
    if (!linha) throw new Error('o tenant desta instância sumiu.');

    const [contagem] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(usuario)
      .where(eq(usuario.ativo, true));

    const dominios = await tx
      .select({ dominio: dominioTenant.dominio, verificadoEm: dominioTenant.verificadoEm })
      .from(dominioTenant)
      .orderBy(asc(dominioTenant.dominio));

    return {
      ...linha,
      membros: contagem?.n ?? 0,
      dominios: dominios.map((d) => ({ dominio: d.dominio, verificado: d.verificadoEm !== null })),
    };
  });
}

export async function salvarEspaco(
  ator: Ator,
  dados: { nome: string; logoUrl: string | null; fuso: string },
): Promise<Resultado> {
  const nome = normalizar(dados.nome);
  const logoUrl = normalizar(dados.logoUrl);
  const fuso = normalizar(dados.fuso);

  const queixa = recusarNome(nome, 'O nome da empresa') ?? recusarUrl(logoUrl, { obrigatoria: false });
  if (queixa) return { ok: false, erro: queixa };
  if (!fuso || !fusoValido(fuso)) return { ok: false, erro: 'Este fuso horário não existe.' };

  return escrever(async (tx, tenantIdAtual) => {
    const [antes] = await tx
      .select({ nome: tenant.nome, logoUrl: tenant.logoUrl, fuso: tenant.fuso })
      .from(tenant)
      .where(eq(tenant.id, tenantIdAtual));
    if (!antes) return { ok: false, erro: 'Este espaço não existe mais.' };

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

export async function listarMembros(): Promise<Membro[]> {
  return consultar(async (tx) => {
    const linhas = await tx
      .select({
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        ativo: usuario.ativo,
        ultimoAcessoEm: usuario.ultimoAcessoEm,
        papelId: papel.id,
        papel: papel.nome,
      })
      .from(usuario)
      .leftJoin(usuarioPapel, eq(usuarioPapel.usuarioId, usuario.id))
      .leftJoin(papel, eq(papel.id, usuarioPapel.papelId))
      .orderBy(asc(usuario.nome), asc(papel.nome));

    // O `left join` devolve uma linha por papel, e o schema permite vários. A tela
    // oferece UM papel (ver `definirPapel`), então aqui fica o primeiro em ordem
    // alfabética — e nunca duas linhas para a mesma pessoa, que viraria chave
    // repetida na tabela e uma pessoa contada duas vezes.
    const porPessoa = new Map<string, Membro>();
    for (const l of linhas) {
      if (porPessoa.has(l.id)) continue;
      porPessoa.set(l.id, { ...l, ultimoAcessoEm: paraData(l.ultimoAcessoEm) });
    }
    return [...porPessoa.values()];
  });
}

export async function listarConvitesPendentes(): Promise<ConvitePendente[]> {
  return consultar(async (tx) => {
    const { rows } = await tx.execute<{
      id: string;
      email: string;
      papel: string;
      expira_em: unknown;
      convidado_por: string | null;
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
      papel: r.papel,
      expiraEm: paraData(r.expira_em) ?? new Date(),
      convidadoPor: r.convidado_por,
    }));
  });
}

/** Sete dias, o mesmo prazo de `apps/api/src/dominio/convites.ts`. */
const PRAZO_CONVITE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * O token de convite, no formato que `apps/api` já sabe aceitar: 32 bytes
 * aleatórios em base64url, e no banco só o `sha256` em hexa. Está reproduzido
 * aqui, e não importado de `@pipe/autenticacao`, porque o CRM não depende desse
 * pacote — são cinco linhas e uma dependência a menos no bundle do Next.
 */
function novoToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: createHash('sha256').update(token).digest('hex') };
}

export function urlDoConvite(token: string): string {
  const base = (process.env['PIPE_URL_APP'] ?? 'http://localhost:3000').replace(/\/$/, '');
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
  dados: { email: string; papelId: string },
): Promise<Resultado> {
  const email = normalizarEmail(dados.email);
  const queixa = recusarEmail(email);
  if (queixa) return { ok: false, erro: queixa };

  return escrever(async (tx, tenantIdAtual) => {
    const [alvo] = await tx
      .select({ id: papel.id, nome: papel.nome })
      .from(papel)
      .where(eq(papel.id, dados.papelId));
    if (!alvo) return { ok: false, erro: 'Este papel não existe nesta conta.' };

    const [jaDentro] = await tx
      .select({ id: usuario.id })
      .from(usuario)
      .where(eq(usuario.email, email!));
    if (jaDentro) return { ok: false, erro: `${email} já tem acesso a esta conta.` };

    await tx.execute(sql`
      update convite set expira_em = now(), atualizado_em = now()
       where email = ${email} and aceito_em is null and expira_em > now()
    `);

    const novo = novoToken();
    const [criado] = await tx
      .insert(convite)
      .values({
        tenantId: tenantIdAtual,
        email: email!,
        papelId: alvo.id,
        tokenHash: novo.hash,
        expiraEm: new Date(Date.now() + PRAZO_CONVITE_MS),
        criadoPor: ator.id ?? null,
      })
      .returning({ id: convite.id });

    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: 'criou',
      objetoTipo: 'convite',
      objetoId: criado!.id,
      depois: { email, papel: alvo.nome },
    });

    return { ok: true, segredo: urlDoConvite(novo.token) };
  });
}

export async function cancelarConvite(ator: Ator, id: string): Promise<Resultado> {
  return escrever(async (tx, tenantIdAtual) => {
    const [antes] = await tx
      .select({ id: convite.id, email: convite.email, expiraEm: convite.expiraEm })
      .from(convite)
      .where(and(eq(convite.id, id), isNull(convite.aceitoEm)));
    if (!antes) return { ok: false, erro: 'Este convite já foi usado ou não existe.' };

    await tx
      .update(convite)
      .set({ expiraEm: new Date(), atualizadoEm: new Date() })
      .where(eq(convite.id, id));
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
export async function definirPapel(
  ator: Ator,
  usuarioIdAlvo: string,
  papelId: string,
): Promise<Resultado> {
  return escrever(async (tx, tenantIdAtual) => {
    const [alvo] = await tx
      .select({ id: usuario.id, nome: usuario.nome })
      .from(usuario)
      .where(eq(usuario.id, usuarioIdAlvo));
    if (!alvo) return { ok: false, erro: 'Esta pessoa não existe nesta conta.' };

    const [novo] = await tx
      .select({ id: papel.id, nome: papel.nome })
      .from(papel)
      .where(eq(papel.id, papelId));
    if (!novo) return { ok: false, erro: 'Este papel não existe nesta conta.' };

    const antigos = await tx
      .select({ nome: papel.nome })
      .from(usuarioPapel)
      .innerJoin(papel, eq(papel.id, usuarioPapel.papelId))
      .where(eq(usuarioPapel.usuarioId, usuarioIdAlvo));

    await tx.delete(usuarioPapel).where(eq(usuarioPapel.usuarioId, usuarioIdAlvo));
    await tx
      .insert(usuarioPapel)
      .values({ tenantId: tenantIdAtual, usuarioId: usuarioIdAlvo, papelId: novo.id });

    await registrarAuditoria(tx, tenantIdAtual, {
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
 * Desativar em vez de excluir.
 *
 * `usuario` é referenciado por conversa, avaliação, lead e log — apagar a linha
 * apagaria a autoria de tudo o que a pessoa fez. Desativar tira o acesso e mantém
 * a história, que é o que uma auditoria de contrato pede.
 */
export async function definirAtivoDoMembro(
  ator: Ator,
  usuarioIdAlvo: string,
  ativo: boolean,
): Promise<Resultado> {
  if (ator.id === usuarioIdAlvo && !ativo) {
    return { ok: false, erro: 'Você não pode desativar o próprio acesso.' };
  }

  return escrever(async (tx, tenantIdAtual) => {
    const [antes] = await tx
      .select({ ativo: usuario.ativo, nome: usuario.nome })
      .from(usuario)
      .where(eq(usuario.id, usuarioIdAlvo));
    if (!antes) return { ok: false, erro: 'Esta pessoa não existe nesta conta.' };
    if (antes.ativo === ativo) return OK;

    await tx
      .update(usuario)
      .set({ ativo, atualizadoEm: new Date() })
      .where(eq(usuario.id, usuarioIdAlvo));
    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: ativo ? 'ativou' : 'desativou',
      objetoTipo: 'usuario',
      objetoId: usuarioIdAlvo,
      antes: { ativo: antes.ativo },
      depois: { ativo },
    });
    return OK;
  });
}

/* ================================================== papéis e permissões */

export async function listarPapeis(): Promise<ResumoDePapel[]> {
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
      descricao: r.descricao,
      deSistema: r.de_sistema,
      permissoes: Number(r.permissoes),
      membros: Number(r.membros),
    }));
  });
}

/** O catálogo é global — vocabulário do produto, igual para todo cliente. */
export async function listarCatalogoDePermissoes(): Promise<PermissaoDoCatalogo[]> {
  return consultar(async (tx) =>
    tx
      .select({
        codigo: permissao.codigo,
        descricao: permissao.descricao,
        grupo: permissao.grupo,
      })
      .from(permissao)
      .orderBy(asc(permissao.grupo), asc(permissao.codigo)),
  );
}

export async function lerPapel(id: string): Promise<PapelDetalhado | null> {
  return consultar(async (tx) => {
    const [linha] = await tx
      .select({
        id: papel.id,
        nome: papel.nome,
        descricao: papel.descricao,
        deSistema: papel.deSistema,
      })
      .from(papel)
      .where(eq(papel.id, id));
    if (!linha) return null;

    const concedidas = await tx
      .select({ codigo: papelPermissao.permissaoCodigo })
      .from(papelPermissao)
      .where(eq(papelPermissao.papelId, id));

    const membros = await tx
      .select({ nome: usuario.nome })
      .from(usuarioPapel)
      .innerJoin(usuario, eq(usuario.id, usuarioPapel.usuarioId))
      .where(eq(usuarioPapel.papelId, id))
      .orderBy(asc(usuario.nome));

    return {
      ...linha,
      permissoes: concedidas.length,
      membros: membros.length,
      concedidas: concedidas.map((c) => c.codigo),
      nomesDosMembros: membros.map((m) => m.nome),
    };
  });
}

export async function criarPapel(
  ator: Ator,
  dados: { nome: string; descricao: string | null },
): Promise<Resultado> {
  const nome = normalizar(dados.nome);
  const queixa = recusarNome(nome, 'O nome do papel');
  if (queixa) return { ok: false, erro: queixa };

  return escrever(async (tx, tenantIdAtual) => {
    const [existe] = await tx.select({ id: papel.id }).from(papel).where(eq(papel.nome, nome!));
    if (existe) return { ok: false, erro: `Já existe um papel chamado "${nome}".` };

    const descricao = normalizar(dados.descricao);
    const [criado] = await tx
      .insert(papel)
      .values({ tenantId: tenantIdAtual, nome: nome!, descricao })
      .returning({ id: papel.id });

    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: 'criou',
      objetoTipo: 'papel',
      objetoId: criado!.id,
      depois: { nome, descricao },
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
export async function salvarPermissoesDoPapel(
  ator: Ator,
  papelId: string,
  codigos: string[],
): Promise<Resultado> {
  return escrever(async (tx, tenantIdAtual) => {
    const [alvo] = await tx
      .select({ id: papel.id, nome: papel.nome, deSistema: papel.deSistema })
      .from(papel)
      .where(eq(papel.id, papelId));
    if (!alvo) return { ok: false, erro: 'Este papel não existe nesta conta.' };
    if (alvo.deSistema) {
      return { ok: false, erro: 'Papel de sistema não é editável. Crie um papel próprio.' };
    }

    const catalogo = await tx.select({ codigo: permissao.codigo }).from(permissao);
    const conhecidas = new Set(catalogo.map((c) => c.codigo));
    const pedidas = [...new Set(codigos)].filter((c) => conhecidas.has(c));

    const atuais = await tx
      .select({ codigo: papelPermissao.permissaoCodigo })
      .from(papelPermissao)
      .where(eq(papelPermissao.papelId, papelId));
    const tinha = new Set(atuais.map((a) => a.codigo));

    const entraram = pedidas.filter((c) => !tinha.has(c));
    const sairam = [...tinha].filter((c) => !pedidas.includes(c));
    if (entraram.length === 0 && sairam.length === 0) return OK;

    await tx.delete(papelPermissao).where(eq(papelPermissao.papelId, papelId));
    if (pedidas.length > 0) {
      await tx.insert(papelPermissao).values(
        pedidas.map((codigo) => ({
          tenantId: tenantIdAtual,
          papelId,
          permissaoCodigo: codigo,
        })),
      );
    }

    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: 'alterou',
      objetoTipo: 'papel_permissao',
      objetoId: papelId,
      antes: { removidas: sairam },
      depois: { concedidas: entraram },
    });
    return OK;
  });
}

export async function excluirPapel(ator: Ator, papelId: string): Promise<Resultado> {
  return escrever(async (tx, tenantIdAtual) => {
    const [alvo] = await tx
      .select({ nome: papel.nome, descricao: papel.descricao, deSistema: papel.deSistema })
      .from(papel)
      .where(eq(papel.id, papelId));
    if (!alvo) return { ok: false, erro: 'Este papel não existe nesta conta.' };
    if (alvo.deSistema) return { ok: false, erro: 'Papel de sistema não pode ser excluído.' };

    const [comGente] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(usuarioPapel)
      .where(eq(usuarioPapel.papelId, papelId));
    if ((comGente?.n ?? 0) > 0) {
      return {
        ok: false,
        erro: 'Ainda há gente com este papel. Troque o papel dessas pessoas antes de excluir.',
      };
    }

    await tx.delete(papel).where(eq(papel.id, papelId));
    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: 'excluiu',
      objetoTipo: 'papel',
      objetoId: papelId,
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
        id: dicionarioCampo.id,
        codigo: dicionarioCampo.codigo,
        rotulo: dicionarioCampo.rotulo,
        tipo: dicionarioCampo.tipo,
        descricao: dicionarioCampo.descricao,
      })
      .from(dicionarioCampo)
      .where(eq(dicionarioCampo.objetoCodigo, OBJETO_LEAD))
      .orderBy(asc(dicionarioCampo.rotulo));

    if (campos.length === 0) return [];

    // Uma varredura só, com o índice GIN de `lead.customizados` fazendo o trabalho.
    const { rows } = await tx.execute<{ chave: string; n: number }>(sql`
      select chave, count(*)::int as n
        from lead, lateral jsonb_object_keys(customizados) as chave
       where excluido_em is null
       group by chave
    `);
    const usoPorChave = new Map(rows.map((r) => [r.chave, Number(r.n)]));

    return campos.map((c) => ({ ...c, preenchidos: usoPorChave.get(c.codigo) ?? 0 }));
  });
}

export async function criarCampoPersonalizado(
  ator: Ator,
  dados: { codigo: string; rotulo: string; tipo: string; descricao: string | null },
): Promise<Resultado> {
  const codigo = normalizar(dados.codigo)?.toLowerCase() ?? null;
  const rotulo = normalizar(dados.rotulo);
  const queixa = recusarCodigoDeCampo(codigo) ?? recusarNome(rotulo, 'O rótulo');
  if (queixa) return { ok: false, erro: queixa };
  if (!tipoDeCampoValido(dados.tipo)) return { ok: false, erro: 'Escolha um tipo para o campo.' };

  return escrever(async (tx, tenantIdAtual) => {
    const [existe] = await tx
      .select({ id: dicionarioCampo.id })
      .from(dicionarioCampo)
      .where(
        and(eq(dicionarioCampo.objetoCodigo, OBJETO_LEAD), eq(dicionarioCampo.codigo, codigo!)),
      );
    if (existe) return { ok: false, erro: `Já existe um campo com o código "${codigo}".` };

    const descricao = normalizar(dados.descricao);
    const [criado] = await tx
      .insert(dicionarioCampo)
      .values({
        tenantId: tenantIdAtual,
        objetoCodigo: OBJETO_LEAD,
        codigo: codigo!,
        rotulo: rotulo!,
        tipo: dados.tipo,
        descricao,
        consultavel: true,
        agregavel: dados.tipo === 'numero',
      })
      .returning({ id: dicionarioCampo.id });

    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: 'criou',
      objetoTipo: 'dicionario_campo',
      objetoId: criado!.id,
      depois: { codigo, rotulo, tipo: dados.tipo, descricao },
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
  dados: { rotulo: string; descricao: string | null },
): Promise<Resultado> {
  const rotulo = normalizar(dados.rotulo);
  const queixa = recusarNome(rotulo, 'O rótulo');
  if (queixa) return { ok: false, erro: queixa };

  return escrever(async (tx, tenantIdAtual) => {
    const [antes] = await tx
      .select({ rotulo: dicionarioCampo.rotulo, descricao: dicionarioCampo.descricao })
      .from(dicionarioCampo)
      .where(eq(dicionarioCampo.id, id));
    if (!antes) return { ok: false, erro: 'Este campo não existe mais.' };

    const depois = { rotulo: rotulo!, descricao: normalizar(dados.descricao) };
    await tx.update(dicionarioCampo).set(depois).where(eq(dicionarioCampo.id, id));
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
        codigo: dicionarioCampo.codigo,
        rotulo: dicionarioCampo.rotulo,
        tipo: dicionarioCampo.tipo,
      })
      .from(dicionarioCampo)
      .where(eq(dicionarioCampo.id, id));
    if (!antes) return { ok: false, erro: 'Este campo não existe mais.' };

    await tx.delete(dicionarioCampo).where(eq(dicionarioCampo.id, id));
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

export async function listarChaves(): Promise<ChaveDeApi[]> {
  return consultar(async (tx) => {
    const linhas = await tx
      .select({
        id: chaveApi.id,
        nome: chaveApi.nome,
        prefixo: chaveApi.prefixo,
        escopos: chaveApi.escopos,
        criadoEm: chaveApi.criadoEm,
        expiraEm: chaveApi.expiraEm,
        ultimoUsoEm: chaveApi.ultimoUsoEm,
        revogadaEm: chaveApi.revogadaEm,
      })
      .from(chaveApi)
      .orderBy(asc(chaveApi.nome));

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
export async function criarChave(
  ator: Ator,
  dados: { nome: string; escopos: string[] },
): Promise<Resultado> {
  const nome = normalizar(dados.nome);
  const queixa = recusarNome(nome, 'O nome da chave');
  if (queixa) return { ok: false, erro: queixa };

  const escopos = escoposValidos(dados.escopos);
  if (escopos.length === 0) return { ok: false, erro: 'Escolha ao menos um escopo.' };

  const prefixo = randomBytes(6).toString('hex');
  const segredo = randomBytes(24).toString('base64url');

  return escrever(async (tx, tenantIdAtual) => {
    const [criada] = await tx
      .insert(chaveApi)
      .values({
        tenantId: tenantIdAtual,
        nome: nome!,
        prefixo,
        hash: createHash('sha256').update(segredo).digest('hex'),
        escopos,
        criadaPor: ator.id ?? null,
      })
      .returning({ id: chaveApi.id });

    await registrarAuditoria(tx, tenantIdAtual, {
      ator,
      acao: 'criou',
      objetoTipo: 'chave_api',
      objetoId: criada!.id,
      depois: { nome, prefixo, escopos },
    });

    return { ok: true, segredo: `pipe_${prefixo}_${segredo}` };
  });
}

export async function revogarChave(ator: Ator, id: string): Promise<Resultado> {
  return escrever(async (tx, tenantIdAtual) => {
    const [antes] = await tx
      .select({ nome: chaveApi.nome, revogadaEm: chaveApi.revogadaEm })
      .from(chaveApi)
      .where(eq(chaveApi.id, id));
    if (!antes) return { ok: false, erro: 'Esta chave não existe mais.' };
    if (antes.revogadaEm) return OK;

    await tx
      .update(chaveApi)
      .set({ revogadaEm: new Date(), atualizadoEm: new Date() })
      .where(eq(chaveApi.id, id));
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
export async function criarWebhook(
  ator: Ator,
  dados: { url: string; eventos: string[] },
): Promise<Resultado> {
  const url = normalizar(dados.url);
  const queixa = recusarUrl(url, { exigirHttps: true });
  if (queixa) return { ok: false, erro: queixa };

  const eventos = eventosValidos(dados.eventos);
  if (eventos.length === 0) return { ok: false, erro: 'Escolha ao menos um evento.' };

  const segredo = randomBytes(32).toString('base64url');
  let cifrado: string;
  try {
    cifrado = cifrar(segredo, chaveiroDoAmbiente());
  } catch {
    return {
      ok: false,
      erro: 'O chaveiro de segredos não está configurado (PIPE_CHAVES_SEGREDO).',
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

    return { ok: true, segredo };
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
    if (!antes) return { ok: false, erro: 'Este webhook não existe mais.' };
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
    if (!antes) return { ok: false, erro: 'Este webhook não existe mais.' };

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
