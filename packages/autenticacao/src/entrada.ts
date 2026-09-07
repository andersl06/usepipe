import { and, eq, isNull, sql } from 'drizzle-orm';
import { comTenant } from '@pipe/db';
import { conexaoSso, dominioTenant, identidadeExterna, sessao, usuario } from '@pipe/db/schema';
import type { BancoPipe, TransacaoPipe } from '@pipe/db';
import { ehDominioPublico, dominioDoEmail } from './google.js';
import { criarToken, estaValida } from './sessao.js';
import type { PessoaExterna } from './google.js';
import type { SessaoAtiva } from './sessao.js';

/**
 * O que acontece entre "o provedor disse quem é" e "a pessoa está dentro".
 *
 * O caminho é o MESMO para o Google e para o IdP do cliente, e isso é a decisão
 * central deste arquivo: uma porta só, com uma lista de perguntas só, porque toda
 * segunda porta de entrada é a que alguém esquece de trancar. A única diferença é
 * de onde vem o tenant — do domínio do e-mail (Google) ou da conexão que iniciou
 * o fluxo (SSO).
 *
 * A ordem das perguntas é o que importa, e ela é sempre a mesma:
 *
 * 1. **Esta conta externa já está ligada a alguém?** Se sim, é ela; acabou. Essa
 *    consulta é por `(emissor, sujeito)`, nunca por e-mail.
 * 2. **A política do tenant permite entrar por aqui?** Com `obrigatorio`, só SSO
 *    — mesmo para quem já tem a conta do Google ligada.
 * 3. **Se a conta não está ligada, a que tenant o domínio do e-mail pertence?**
 *    Só domínio VERIFICADO conta, domínio público nunca, e no SSO ele ainda
 *    precisa ser do tenant que iniciou o fluxo.
 * 4. **O provedor confirmou este e-mail?** Sem isso não se casa identidade nova
 *    com usuário existente: quem conseguir um IdP a emitir o e-mail da vítima
 *    entraria como ela, com os papéis dela.
 * 5. **Existe usuário com este e-mail nesse tenant?** Se sim, liga a conta
 *    externa a ele — é a pessoa que já foi convidada e está entrando pela
 *    primeira vez pelo provedor.
 * 6. **Senão, recusa.** Criar usuário do nada é o que transforma "descobri um
 *    domínio" em "entrei no cliente". Entrada de gente nova é por convite.
 */

export class EntradaRecusada extends Error {
  constructor(
    readonly codigo:
      | 'dominio_publico'
      | 'dominio_desconhecido'
      | 'sem_convite'
      | 'usuario_inativo'
      | 'email_nao_verificado'
      | 'sso_obrigatorio'
      | 'outro_tenant',
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'EntradaRecusada';
  }
}

export interface EntradaConcluida {
  tenantId: string;
  usuarioId: string;
  /** Vai para o cookie. */
  token: string;
  expiraEm: Date;
}

export interface OpcoesDeEntrada {
  /** Vai para `sessao.origem`. A revogação em massa por política depende dele. */
  origem: 'google' | 'sso';
  /**
   * O tenant já resolvido, quando o fluxo começou numa conexão de SSO.
   *
   * Com ele, a descoberta por domínio deixa de escolher o tenant e passa a
   * CONFERIR: o domínio continua tendo de estar verificado, e verificado para
   * este tenant. Sem essa conferência, o IdP de um cliente autenticaria gente de
   * outro só por mandar o e-mail certo.
   */
  tenantId?: string | undefined;
}

/**
 * `bancoDono` roda sem RLS de propósito, e só nas consultas que precisam
 * acontecer ANTES de existir tenant: achar a identidade externa, resolver o
 * domínio e ler a política do tenant. É o mesmo caminho da resolução de chave de
 * API, e pela mesma razão — não dá para fixar `pipe.tenant_id` antes de saber
 * qual é.
 *
 * Tudo o que vem depois passa por `comTenant`.
 */
export async function entrarComIdentidade(
  bancoDono: BancoPipe,
  bancoApp: BancoPipe,
  pessoa: PessoaExterna,
  opcoes: OpcoesDeEntrada,
  contexto: { ip?: string; agente?: string } = {},
): Promise<EntradaConcluida> {
  const ligada = await bancoDono
    .select({ tenantId: identidadeExterna.tenantId, usuarioId: identidadeExterna.usuarioId })
    .from(identidadeExterna)
    .where(
      and(
        eq(identidadeExterna.emissor, pessoa.emissor),
        eq(identidadeExterna.sujeito, pessoa.sujeito),
      ),
    )
    .limit(1);

  if (ligada[0]) {
    // Conta já ligada a OUTRO cliente. Reaproveitá-la aqui seria a mesma pessoa
    // entrando em dois tenants com o mesmo login, e a escolha de qual vale
    // ficaria com quem consultasse primeiro.
    if (opcoes.tenantId && ligada[0].tenantId !== opcoes.tenantId) {
      throw new EntradaRecusada(
        'outro_tenant',
        'Esta conta do provedor já pertence a outra empresa no Pipe.',
      );
    }
    await exigirPoliticaCompativel(bancoDono, ligada[0].tenantId, opcoes.origem);
    return abrirSessao(bancoApp, ligada[0].tenantId, ligada[0].usuarioId, pessoa, opcoes, contexto);
  }

  // Primeira entrada: o domínio decide (Google) ou confirma (SSO) de quem é a pessoa.
  if (ehDominioPublico(pessoa.email)) {
    throw new EntradaRecusada(
      'dominio_publico',
      'E-mail pessoal não identifica empresa. Entre pelo convite que você recebeu.',
    );
  }

  const dominio = dominioDoEmail(pessoa.email);
  const dono = await bancoDono
    .select({ tenantId: dominioTenant.tenantId })
    .from(dominioTenant)
    .where(and(eq(dominioTenant.dominio, dominio), sql`${dominioTenant.verificadoEm} is not null`))
    .limit(1);

  const tenantId = dono[0]?.tenantId;
  if (!tenantId || (opcoes.tenantId && tenantId !== opcoes.tenantId)) {
    throw new EntradaRecusada(
      'dominio_desconhecido',
      `Nenhuma conta do Pipe usa o domínio "${dominio}".`,
    );
  }

  // Casar identidade NOVA com usuário existente é o ponto onde o e-mail voltaria
  // a ser chave de conta. Só passa com o provedor afirmando que o domínio do
  // endereço foi verificado — `email_verified`, ou `xms_edov` no Entra.
  if (!pessoa.emailVerificado) {
    throw new EntradaRecusada(
      'email_nao_verificado',
      'O provedor não confirmou este e-mail. Peça a quem administra para ligar a conta.',
    );
  }

  await exigirPoliticaCompativel(bancoDono, tenantId, opcoes.origem);

  return comTenant(bancoApp, tenantId, async (tx) => {
    const convidado = await tx
      .select({ id: usuario.id, ativo: usuario.ativo })
      .from(usuario)
      .where(eq(usuario.email, pessoa.email))
      .limit(1);

    const encontrado = convidado[0];
    if (!encontrado) {
      throw new EntradaRecusada(
        'sem_convite',
        'Você ainda não foi convidado para esta conta. Peça a quem administra.',
      );
    }
    if (!encontrado.ativo) {
      throw new EntradaRecusada('usuario_inativo', 'Este acesso foi desativado.');
    }

    await tx.insert(identidadeExterna).values({
      tenantId,
      usuarioId: encontrado.id,
      emissor: pessoa.emissor,
      sujeito: pessoa.sujeito,
      emailNoProvedor: pessoa.email,
      ultimoAcessoEm: new Date(),
    });

    return gravarSessao(tx, tenantId, encontrado.id, opcoes.origem, contexto);
  });
}

/** O login com Google. É `entrarComIdentidade` com o tenant vindo do domínio. */
export function entrarComGoogle(
  bancoDono: BancoPipe,
  bancoApp: BancoPipe,
  pessoa: PessoaExterna,
  contexto: { ip?: string; agente?: string } = {},
): Promise<EntradaConcluida> {
  return entrarComIdentidade(bancoDono, bancoApp, pessoa, { origem: 'google' }, contexto);
}

/** O login pelo IdP do cliente. O tenant vem da conexão que iniciou o fluxo. */
export function entrarComSso(
  bancoDono: BancoPipe,
  bancoApp: BancoPipe,
  pessoa: PessoaExterna,
  tenantId: string,
  contexto: { ip?: string; agente?: string } = {},
): Promise<EntradaConcluida> {
  return entrarComIdentidade(bancoDono, bancoApp, pessoa, { origem: 'sso', tenantId }, contexto);
}

/**
 * A política do tenant, conferida NO SERVIDOR, no caminho que emite a sessão.
 *
 * Não é a tela que esconde o botão do Google: com `obrigatorio`, este caminho
 * recusa mesmo quem já tem a conta ligada e mesmo que tudo o mais esteja certo.
 * É aqui que "SSO obrigatório" para de ser um texto na tela de configuração —
 * ver `docs/pesquisa/sso-multi-tenant.md` §6.
 *
 * Todo caminho novo que abrir sessão (senha, recuperação de senha, convite por
 * link) tem de passar por esta função. É a porta dos fundos clássica.
 */
export async function exigirPoliticaCompativel(
  bancoDono: BancoPipe,
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
    throw new EntradaRecusada(
      'sso_obrigatorio',
      'Esta empresa entra pelo provedor de identidade dela. Use o botão de SSO.',
    );
  }
}

async function abrirSessao(
  bancoApp: BancoPipe,
  tenantId: string,
  usuarioId: string,
  pessoa: PessoaExterna,
  opcoes: OpcoesDeEntrada,
  contexto: { ip?: string; agente?: string },
): Promise<EntradaConcluida> {
  return comTenant(bancoApp, tenantId, async (tx) => {
    const atual = await tx
      .select({ ativo: usuario.ativo })
      .from(usuario)
      .where(eq(usuario.id, usuarioId))
      .limit(1);
    if (!atual[0]?.ativo) {
      throw new EntradaRecusada('usuario_inativo', 'Este acesso foi desativado.');
    }

    // Em série, nunca em `Promise.all`: dentro da transação o paralelo derruba o
    // `pipe.tenant_id` da sessão — ver o README.
    //
    // O e-mail que mudou no IdP atualiza só este campo de exibição: a conta
    // continua sendo o par (emissor, sujeito). Trocar de endereço não troca de
    // conta, e é por isso que herdar o endereço de quem saiu não herda o acesso.
    await tx
      .update(identidadeExterna)
      .set({ ultimoAcessoEm: new Date(), emailNoProvedor: pessoa.email })
      .where(
        and(
          eq(identidadeExterna.emissor, pessoa.emissor),
          eq(identidadeExterna.sujeito, pessoa.sujeito),
        ),
      );

    return gravarSessao(tx, tenantId, usuarioId, opcoes.origem, contexto);
  });
}

async function gravarSessao(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  origem: string,
  contexto: { ip?: string; agente?: string },
): Promise<EntradaConcluida> {
  const novo = criarToken();
  await tx.insert(sessao).values({
    tenantId,
    usuarioId,
    tokenHash: novo.hash,
    expiraEm: novo.expiraEm,
    origem,
    ip: contexto.ip ?? null,
    agente: contexto.agente ?? null,
  });
  await tx.update(usuario).set({ ultimoAcessoEm: new Date() }).where(eq(usuario.id, usuarioId));

  return { tenantId, usuarioId, token: novo.token, expiraEm: novo.expiraEm };
}

/**
 * Resolve a sessão do cookie.
 *
 * Roda com o papel dono porque descobrir o tenant é justamente o que precisa
 * acontecer antes de fixar o tenant. A consulta é pelo HASH, com índice único, e
 * devolve `null` para qualquer coisa que não seja uma sessão viva — token
 * inexistente, expirado e encerrado dão a mesma resposta, de propósito.
 */
export async function resolverSessao(
  bancoDono: BancoPipe,
  hash: string,
  agora = new Date(),
): Promise<SessaoAtiva | null> {
  const linhas = await bancoDono
    .select({
      id: sessao.id,
      tenantId: sessao.tenantId,
      usuarioId: sessao.usuarioId,
      expiraEm: sessao.expiraEm,
      origem: sessao.origem,
      encerradaEm: sessao.encerradaEm,
    })
    .from(sessao)
    .where(eq(sessao.tokenHash, hash))
    .limit(1);

  const linha = linhas[0];
  if (!linha) return null;
  if (!estaValida({ expiraEm: linha.expiraEm, encerradaEm: linha.encerradaEm }, agora)) return null;

  return {
    id: linha.id,
    tenantId: linha.tenantId,
    usuarioId: linha.usuarioId,
    expiraEm: linha.expiraEm,
    origem: linha.origem,
  };
}

/** Encerra a sessão. Idempotente: sair duas vezes não é erro. */
export async function sair(bancoDono: BancoPipe, hash: string): Promise<void> {
  await bancoDono
    .update(sessao)
    .set({ encerradaEm: new Date() })
    .where(and(eq(sessao.tokenHash, hash), isNull(sessao.encerradaEm)));
}
