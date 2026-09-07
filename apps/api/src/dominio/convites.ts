import { sql } from 'drizzle-orm';
import { criarToken, hashDoToken } from '@pipe/autenticacao';
import type { PessoaDoGoogle } from '@pipe/autenticacao';
import type { TransacaoPipe } from '@pipe/db';
import { bancoDono, noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';

/**
 * Convite: a **única** porta de entrada para quem não tem domínio verificado.
 *
 * A quarta pergunta de `packages/autenticacao/src/entrada.ts` recusa quem não foi
 * convidado, e isso é de propósito: criar usuário do nada transforma "descobri um
 * domínio" em "entrei no cliente". Este arquivo é o outro lado dessa recusa — quem
 * põe gente dentro, com quem convidou registrado.
 *
 * Três regras moldam tudo aqui, e as três já valem para a sessão e para a chave de API:
 *
 * 1. **O banco guarda o hash, nunca o token.** Quem lê a tabela `convite` não
 *    consegue aceitar convite de ninguém.
 * 2. **Prazo curto.** Sete dias. Link de convite que não vence é credencial
 *    permanente esquecida na caixa de entrada de alguém.
 * 3. **Uso único**, garantido por `select ... for update` na hora de aceitar — não
 *    por "leu, conferiu, depois gravou", que é onde dois cliques viram dois usuários.
 */

/** Sete dias. É prazo de convite, não de sessão: quem não usa, pede outro. */
export const PRAZO_CONVITE_MS = 7 * 24 * 60 * 60 * 1000;

const EMAIL_ACEITAVEL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface ConviteCriado {
  id: string;
  email: string;
  papel: string;
  /** Só existe nesta resposta. Depois daqui, no banco só há o hash. */
  token: string;
  url: string;
  expiraEm: Date;
}

/** O que `GET /v1/convites/:token` mostra, sem exigir sessão. */
export interface ConviteVisivel {
  email: string;
  papel: string;
  tenant: { nome: string; slug: string };
  expiraEm: Date;
}

export interface EntradaPorConvite {
  tenantId: string;
  usuarioId: string;
  token: string;
  expiraEm: Date;
}

function normalizarEmail(cru: string | undefined): string {
  const email = (cru ?? '').trim().toLowerCase();
  if (!EMAIL_ACEITAVEL.test(email)) {
    throw ErroPipe.requisicao('email_invalido', 'Informe um e-mail válido para convidar.');
  }
  return email;
}

/** O nome que a pessoa carrega até entrar pela primeira vez e o Google dizer o dela. */
function nomeProvisorio(email: string): string {
  return email.slice(0, email.indexOf('@'));
}

export function urlDoConvite(token: string): string {
  const base = (process.env['PIPE_URL_APP'] ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/convite/${token}`;
}

/**
 * Cria o convite. O papel vem pelo NOME (`administrador`, `atendente`), que é o que
 * quem convida conhece — e a busca acontece com `pipe.tenant_id` fixado, então é
 * impossível convidar alguém para um papel de outro cliente.
 */
export async function criarConvite(
  tenantId: string,
  dados: { email?: string; papel?: string; criadoPor?: string },
): Promise<ConviteCriado> {
  const email = normalizarEmail(dados.email);
  const nomeDoPapel = (dados.papel ?? '').trim();
  if (!nomeDoPapel) {
    throw ErroPipe.requisicao('papel_ausente', 'Informe o papel de quem está sendo convidado.');
  }

  const novo = criarToken(PRAZO_CONVITE_MS);

  return noTenant(tenantId, async (tx) => {
    const { rows: papeis } = await tx.execute<{ id: string }>(
      sql`select id from papel where nome = ${nomeDoPapel} limit 1`,
    );
    const papelId = papeis[0]?.id;
    if (!papelId) {
      throw ErroPipe.requisicao(
        'papel_invalido',
        `Não existe o papel "${nomeDoPapel}" nesta conta.`,
        { papel: nomeDoPapel },
      );
    }

    const { rows: jaDentro } = await tx.execute<{ id: string }>(
      sql`select id from usuario where email = ${email} limit 1`,
    );
    if (jaDentro[0]) {
      throw ErroPipe.conflito('ja_e_membro', `${email} já tem acesso a esta conta.`);
    }

    // Convidar de novo INVALIDA o convite anterior. Sem isto, cada reenvio deixa
    // mais um link vivo, e cancelar o acesso passaria a exigir caçar todos eles.
    await tx.execute(sql`
      update convite set expira_em = now(), atualizado_em = now()
       where email = ${email} and aceito_em is null and expira_em > now()
    `);

    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into convite (tenant_id, email, papel_id, token_hash, expira_em, criado_por)
      values (${tenantId}::uuid, ${email}, ${papelId}::uuid, ${novo.hash}, ${novo.expiraEm},
              ${dados.criadoPor ?? null})
      returning id
    `);

    return {
      id: rows[0]!.id,
      email,
      papel: nomeDoPapel,
      token: novo.token,
      url: urlDoConvite(novo.token),
      expiraEm: novo.expiraEm,
    };
  });
}

type LinhaConvite = {
  id: string;
  tenant_id: string;
  email: string;
  papel_id: string;
  papel: string;
  tenant_nome: string;
  slug: string;
  expira_em: Date;
  aceito_em: Date | null;
};

/**
 * Acha o convite pelo hash do token.
 *
 * Roda com o papel dono pela mesma razão da resolução de sessão: descobrir o tenant
 * é justamente o que precisa acontecer **antes** de fixar o tenant.
 */
async function acharPeloToken(tokenCru: string): Promise<LinhaConvite> {
  const { rows } = await bancoDono().execute<LinhaConvite>(sql`
    select c.id, c.tenant_id, c.email, c.papel_id, c.expira_em, c.aceito_em,
           p.nome as papel, t.nome as tenant_nome, t.slug
      from convite c
      join papel p on p.id = c.papel_id
      join tenant t on t.id = c.tenant_id
     where c.token_hash = ${hashDoToken(tokenCru)}
     limit 1
  `);

  const linha = rows[0];
  // Token que não existe é 404 e nada mais: responder "expirado" a um palpite
  // confirmaria que o palpite era um convite de verdade.
  if (!linha) throw ErroPipe.naoEncontrado('Convite');

  // Daqui para baixo quem pergunta JÁ tem um token válido, e merece saber por que
  // ele não funciona mais — senão o suporte recebe "o link não faz nada".
  if (linha.aceito_em) {
    throw new ErroPipe(410, 'convite_usado', 'Este convite já foi usado. Peça outro.');
  }
  if (new Date(linha.expira_em).getTime() <= Date.now()) {
    throw new ErroPipe(410, 'convite_expirado', 'Este convite venceu. Peça outro.');
  }
  return linha;
}

export async function lerConvite(tokenCru: string): Promise<ConviteVisivel> {
  const linha = await acharPeloToken(tokenCru);
  return {
    email: linha.email,
    papel: linha.papel,
    tenant: { nome: linha.tenant_nome, slug: linha.slug },
    expiraEm: new Date(linha.expira_em),
  };
}

export interface ConviteAceito {
  tenantId: string;
  usuarioId: string;
  email: string;
  papel: string;
  tenant: { nome: string; slug: string };
  /** Só vem quando a pessoa aceitou já autenticada pelo Google. */
  sessao?: EntradaPorConvite;
}

/**
 * Aceita o convite: cria o usuário no tenant, dá o papel e queima o token.
 *
 * `pessoa` é opcional, e é ela que separa as duas portas:
 *
 * - **Sem `pessoa`** (`POST /v1/convites/:token/aceitar`): o usuário passa a existir
 *   e a pessoa entra depois pelo Google. Isso fecha o ciclo quando o domínio dela já
 *   está verificado — é a terceira pergunta de `entrada.ts` que liga a conta.
 * - **Com `pessoa`** (a volta do Google carregando `?convite=`): a conta externa é
 *   ligada aqui e a sessão sai daqui. É o caminho de quem **não** tem domínio
 *   verificado, e por isso é o que o link do convite deve oferecer.
 *
 * O `for update` é o que faz o uso único valer: dois cliques no mesmo link chegam
 * juntos, e sem o bloqueio os dois leem "não aceito" e os dois seguem em frente.
 */
export async function aceitarConvite(
  tokenCru: string,
  pessoa?: PessoaDoGoogle,
  contexto: { ip?: string; agente?: string } = {},
): Promise<ConviteAceito> {
  const achado = await acharPeloToken(tokenCru);

  if (pessoa && pessoa.email.toLowerCase() !== achado.email) {
    // O convite é para UM endereço. Entrar com outra conta do Google e cair dentro
    // do cliente seria o link virando porta para quem quer que o receba encaminhado.
    throw ErroPipe.requisicao(
      'convite_de_outro_email',
      `Este convite é para ${achado.email}. Entre com essa conta.`,
    );
  }

  return noTenant(achado.tenant_id, async (tx) => {
    const { rows: travados } = await tx.execute<{ aceito_em: Date | null; expira_em: Date }>(
      sql`select aceito_em, expira_em from convite where id = ${achado.id}::uuid for update`,
    );
    const atual = travados[0];
    if (!atual) throw ErroPipe.naoEncontrado('Convite');
    if (atual.aceito_em) {
      throw new ErroPipe(410, 'convite_usado', 'Este convite já foi usado. Peça outro.');
    }
    if (new Date(atual.expira_em).getTime() <= Date.now()) {
      throw new ErroPipe(410, 'convite_expirado', 'Este convite venceu. Peça outro.');
    }

    // Em série, nunca em `Promise.all`: paralelo dentro da transação derruba o
    // `pipe.tenant_id` e a consulta passa a rodar sem tenant — ver o README.
    const usuarioId = await garantirUsuario(tx, achado.tenant_id, {
      email: achado.email,
      nome: pessoa?.nome ?? nomeProvisorio(achado.email),
      avatarUrl: pessoa?.avatarUrl ?? null,
    });

    await tx.execute(sql`
      insert into usuario_papel (tenant_id, usuario_id, papel_id)
      values (${achado.tenant_id}::uuid, ${usuarioId}::uuid, ${achado.papel_id}::uuid)
      on conflict do nothing
    `);
    await tx.execute(sql`
      update convite set aceito_em = now(), usuario_id = ${usuarioId}::uuid,
                         atualizado_em = now()
       where id = ${achado.id}::uuid
    `);

    const comum = {
      tenantId: achado.tenant_id,
      usuarioId,
      email: achado.email,
      papel: achado.papel,
      tenant: { nome: achado.tenant_nome, slug: achado.slug },
    };
    if (!pessoa) return comum;

    const sessao = await ligarEEntrar(tx, achado.tenant_id, usuarioId, pessoa, contexto);
    return { ...comum, sessao };
  });
}

/**
 * O usuário do convite. `on conflict` porque o e-mail pode já existir desativado —
 * quem saiu e voltou é a mesma pessoa, e uma segunda linha esbarraria no único
 * `(tenant_id, email)` de qualquer jeito.
 */
async function garantirUsuario(
  tx: TransacaoPipe,
  tenantId: string,
  dados: { email: string; nome: string; avatarUrl: string | null },
): Promise<string> {
  const { rows } = await tx.execute<{ id: string }>(sql`
    insert into usuario (tenant_id, nome, email, avatar_url)
    values (${tenantId}::uuid, ${dados.nome}, ${dados.email}, ${dados.avatarUrl})
    on conflict (tenant_id, email) do update
       set ativo = true, atualizado_em = now()
    returning id
  `);
  return rows[0]!.id;
}

/** Liga a conta do Google ao usuário do convite e abre a sessão. */
async function ligarEEntrar(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  pessoa: PessoaDoGoogle,
  contexto: { ip?: string; agente?: string },
): Promise<EntradaPorConvite> {
  // O único de `identidade_externa` é GLOBAL em `(emissor, sujeito)`: uma conta do
  // Google pertence a UM usuário. Se ela já é de outra pessoa, o convite não pode
  // levá-la em silêncio — falha alto, com o motivo.
  const { rows: jaLigada } = await tx.execute<{ n: string }>(sql`
    select count(*)::text as n from identidade_externa
     where emissor = ${pessoa.emissor} and sujeito = ${pessoa.sujeito}
       and usuario_id <> ${usuarioId}::uuid
  `);
  if (jaLigada[0]?.n !== '0') {
    throw ErroPipe.conflito(
      'conta_ja_ligada',
      'Esta conta do Google já pertence a outro acesso do Pipe.',
    );
  }

  await tx.execute(sql`
    insert into identidade_externa
      (tenant_id, usuario_id, emissor, sujeito, email_no_provedor, ultimo_acesso_em)
    values (${tenantId}::uuid, ${usuarioId}::uuid, ${pessoa.emissor}, ${pessoa.sujeito},
            ${pessoa.email}, now())
    on conflict (emissor, sujeito) do nothing
  `);

  const novo = criarToken();
  await tx.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem, ip, agente)
    values (${tenantId}::uuid, ${usuarioId}::uuid, ${novo.hash}, ${novo.expiraEm}, 'google',
            ${contexto.ip ?? null}, ${contexto.agente ?? null})
  `);
  await tx.execute(sql`update usuario set ultimo_acesso_em = now() where id = ${usuarioId}::uuid`);

  return { tenantId, usuarioId, token: novo.token, expiraEm: novo.expiraEm };
}
