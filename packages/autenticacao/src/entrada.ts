import { and, eq, isNull, sql } from 'drizzle-orm';
import { comTenant } from '@pipe/db';
import { dominioTenant, identidadeExterna, sessao, usuario } from '@pipe/db/schema';
import type { BancoPipe, TransacaoPipe } from '@pipe/db';
import { ehDominioPublico, dominioDoEmail } from './google.js';
import { criarToken, estaValida } from './sessao.js';
import type { PessoaDoGoogle } from './google.js';
import type { SessaoAtiva } from './sessao.js';

/**
 * O que acontece entre "o Google disse quem é" e "a pessoa está dentro".
 *
 * A ordem das perguntas é a parte que importa, e ela é sempre a mesma:
 *
 * 1. **Esta conta externa já está ligada a alguém?** Se sim, é ela; acabou. Essa
 *    consulta é por `(emissor, sujeito)`, nunca por e-mail.
 * 2. **Se não, a que tenant o domínio do e-mail pertence?** Só domínio
 *    VERIFICADO conta, e domínio público nunca.
 * 3. **Existe usuário com este e-mail nesse tenant?** Se sim, liga a conta
 *    externa a ele — é a pessoa que já foi convidada e está entrando pela
 *    primeira vez pelo Google.
 * 4. **Senão, recusa.** Criar usuário do nada é o que transforma "descobri um
 *    domínio" em "entrei no cliente". Entrada de gente nova é por convite.
 */

export class EntradaRecusada extends Error {
  constructor(
    readonly codigo:
      | 'dominio_publico'
      | 'dominio_desconhecido'
      | 'sem_convite'
      | 'usuario_inativo',
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

/**
 * `bancoDono` roda sem RLS de propósito, e só nas duas consultas que precisam
 * acontecer ANTES de existir tenant: achar a identidade externa e resolver o
 * domínio. É o mesmo caminho da resolução de chave de API, e pela mesma razão —
 * não dá para fixar `pipe.tenant_id` antes de saber qual é.
 *
 * Tudo o que vem depois passa por `comTenant`.
 */
export async function entrarComGoogle(
  bancoDono: BancoPipe,
  bancoApp: BancoPipe,
  pessoa: PessoaDoGoogle,
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
    return abrirSessao(bancoApp, ligada[0].tenantId, ligada[0].usuarioId, pessoa, contexto);
  }

  // Primeira entrada: o domínio decide de quem é a pessoa.
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
  if (!tenantId) {
    throw new EntradaRecusada(
      'dominio_desconhecido',
      `Nenhuma conta do Pipe usa o domínio "${dominio}".`,
    );
  }

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

    return gravarSessao(tx, tenantId, encontrado.id, contexto);
  });
}

async function abrirSessao(
  bancoApp: BancoPipe,
  tenantId: string,
  usuarioId: string,
  pessoa: PessoaDoGoogle,
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
    await tx
      .update(identidadeExterna)
      .set({ ultimoAcessoEm: new Date(), emailNoProvedor: pessoa.email })
      .where(
        and(
          eq(identidadeExterna.emissor, pessoa.emissor),
          eq(identidadeExterna.sujeito, pessoa.sujeito),
        ),
      );

    return gravarSessao(tx, tenantId, usuarioId, contexto);
  });
}

async function gravarSessao(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  contexto: { ip?: string; agente?: string },
): Promise<EntradaConcluida> {
  const novo = criarToken();
  await tx.insert(sessao).values({
    tenantId,
    usuarioId,
    tokenHash: novo.hash,
    expiraEm: novo.expiraEm,
    origem: 'google',
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
