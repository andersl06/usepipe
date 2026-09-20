import { sql } from 'drizzle-orm';
import { EntradaRecusada, criarToken, hashDoToken } from '@pipe/autenticacao';
import type { PessoaDoGoogle } from '@pipe/autenticacao';
import type { TransacaoPipe } from '@pipe/db';
import { bancoDono, noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { enviarEmailSemDerrubar } from './email.js';

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

/** O rótulo da tela para cada papel de conta (`docs/pesquisa/blip-painel-do-contrato.md`). */
const ROTULO_DO_PAPEL: Readonly<Record<string, string>> = {
  admin: 'Admin',
  member: 'Pode editar',
  guest: 'Pode visualizar',
};

/**
 * O e-mail do convite: o link, quem convidou para onde, com que papel e até
 * quando. Texto puro de propósito — é o que sobrevive a qualquer cliente de
 * e-mail e o que o teste lê.
 */
export function emailDoConvite(convite: ConviteCriado, tenantNome: string): {
  para: string[];
  assunto: string;
  texto: string;
} {
  const papel = ROTULO_DO_PAPEL[convite.papel] ?? convite.papel;
  const vence = convite.expiraEm.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return {
    para: [convite.email],
    assunto: `Convite para entrar em ${tenantNome} no Pipe`,
    texto:
      `Você foi convidado(a) para entrar em ${tenantNome} no Pipe com o acesso "${papel}".\n\n` +
      `Para aceitar, abra o link:\n${convite.url}\n\n` +
      `O convite vale até ${vence}. Depois disso, peça um novo a quem convidou.\n` +
      'Se você não esperava este convite, ignore esta mensagem.',
  };
}

/**
 * Manda o convite por e-mail DEPOIS do commit, e nunca derruba quem chamou: a
 * resposta segue devolvendo o link, como sempre fez — é o plano B de quem
 * convidou quando o e-mail não chega.
 */
async function avisarConvidado(convite: ConviteCriado, tenantNome: string): Promise<void> {
  await enviarEmailSemDerrubar(emailDoConvite(convite, tenantNome), `convite ${convite.id}`);
}

/** O nome do tenant em vigor, para o e-mail dizer onde a pessoa está entrando. */
async function nomeDoTenant(tx: TransacaoPipe): Promise<string> {
  const { rows } = await tx.execute<{ nome: string }>(sql`select nome from tenant limit 1`);
  return rows[0]?.nome ?? 'Pipe';
}

/**
 * O que `criarConvite` e `reenviarConvite` fazem em comum, dentro da MESMA
 * transação de quem chamou: emite um token novo, invalida qualquer convite
 * aberto para o e-mail e insere a linha. Extraído para as duas nunca
 * divergirem no que conta como "reenviar" — hoje é literalmente convidar de
 * novo, e é por isso que reenviar não é uma tabela nem um contador à parte.
 */
async function emitirConvite(
  tx: TransacaoPipe,
  tenantId: string,
  dados: { email: string; papel: string; criadoPor?: string | null },
): Promise<ConviteCriado> {
  const email = dados.email;
  const nomeDoPapel = dados.papel;
  const novo = criarToken(PRAZO_CONVITE_MS);

  const { rows: papeis } = await tx.execute<{ id: string; escopo: string }>(
    sql`select id, escopo from papel where nome = ${nomeDoPapel} limit 1`,
  );
  const papelId = papeis[0]?.id;
  if (!papelId) {
    throw ErroPipe.requisicao('papel_invalido', `Não existe o papel "${nomeDoPapel}" nesta conta.`, {
      papel: nomeDoPapel,
    });
  }
  if (papeis[0]?.escopo !== 'conta') {
    throw ErroPipe.requisicao(
      'papel_de_atendimento',
      `"${nomeDoPapel}" é papel de atendimento, dado no atendimento de cada contato. ` +
        'O convite dá o papel no contrato: admin, member ou guest.',
      { papel: nomeDoPapel },
    );
  }

  const { rows: jaDentro } = await tx.execute<{ id: string }>(
    sql`select id from usuario where email = ${email} limit 1`,
  );
  if (jaDentro[0]) {
    throw ErroPipe.conflito('ja_e_membro', `${email} já tem acesso a esta conta.`);
  }

  // Convidar (ou reenviar) de novo INVALIDA o convite anterior. Sem isto, cada
  // reenvio deixa mais um link vivo, e cancelar o acesso passaria a exigir
  // caçar todos eles.
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
}

/**
 * Cria o convite. O papel vem pelo NOME (`admin`, `member`, `guest`), que é o que
 * quem convida conhece — e a busca acontece com `pipe.tenant_id` fixado, então é
 * impossível convidar alguém para um papel de outro cliente.
 *
 * **Só papel de CONTA** (migração 0021), como na origem: o convite dá o papel no
 * contrato, e supervisor, atendente e os demais são dados no atendimento, por
 * contato. O banco também recusa (FK composta em `convite.escopo`); a conferência
 * aqui existe para a resposta dizer o porquê em vez de estourar a FK.
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

  const { convite, tenantNome } = await noTenant(tenantId, async (tx) => ({
    convite: await emitirConvite(tx, tenantId, { email, papel: nomeDoPapel, criadoPor: dados.criadoPor }),
    tenantNome: await nomeDoTenant(tx),
  }));
  // Fora da transação: e-mail não pode prender o commit, nem a falha dele desfazê-lo.
  await avisarConvidado(convite, tenantNome);
  return convite;
}

/**
 * Reenvia um convite em aberto: o mesmo e-mail e o mesmo papel, com um link novo
 * — que MATA o link antigo, como todo reenvio (`emitirConvite`). O link novo vai
 * por e-mail (`dominio/email.ts`) e continua na resposta, para quem convidou
 * colar de novo se o e-mail não chegar.
 */
export async function reenviarConvite(
  tenantId: string,
  conviteId: string,
  criadoPor?: string,
): Promise<ConviteCriado> {
  const { convite, tenantNome } = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ email: string; papel: string }>(sql`
      select c.email, p.nome as papel
        from convite c
        join papel p on p.id = c.papel_id
       where c.id = ${conviteId}::uuid and c.aceito_em is null and c.expira_em > now()
       limit 1
    `);
    const alvo = rows[0];
    if (!alvo) throw ErroPipe.naoEncontrado('Convite');
    return {
      convite: await emitirConvite(tx, tenantId, { email: alvo.email, papel: alvo.papel, criadoPor }),
      tenantNome: await nomeDoTenant(tx),
    };
  });
  await avisarConvidado(convite, tenantNome);
  return convite;
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

    // UM papel de conta por pessoa (índice parcial da 0021). Quem volta
    // desativado e é convidado de novo troca o papel de conta antigo pelo do
    // convite; os papéis de atendimento ficam.
    await tx.execute(sql`
      delete from usuario_papel
       where usuario_id = ${usuarioId}::uuid and escopo = 'conta'
         and papel_id <> ${achado.papel_id}::uuid
    `);
    await tx.execute(sql`
      insert into usuario_papel (tenant_id, usuario_id, papel_id, escopo)
      values (${achado.tenant_id}::uuid, ${usuarioId}::uuid, ${achado.papel_id}::uuid, 'conta')
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
  // O único de `identidade_externa` é por tenant em `(tenant_id, emissor, sujeito)`.
  // Se ela já é de outra pessoa no tenant, o convite não pode
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
    on conflict (tenant_id, emissor, sujeito) do nothing
  `);

  // §6 da pesquisa de SSO: a política é conferida NO SERVIDOR em todo caminho
  // que emite sessão, e o convite por link é um deles. Sem esta linha, um tenant
  // que exige SSO continua entrando pelo Google se alguém tiver um convite na
  // mão — é a porta dos fundos clássica, irmã do "esqueci minha senha".
  const { rows: politica } = await tx.execute<{ politica: string }>(
    sql`select politica from conexao_sso where tenant_id = ${tenantId}::uuid limit 1`,
  );
  if (politica[0]?.politica === 'obrigatorio') {
    throw new EntradaRecusada(
      'sso_obrigatorio',
      'Esta empresa entra pelo provedor de identidade dela. Use o link de SSO.',
    );
  }

  const novo = criarToken();
  await tx.execute(sql`
    insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem, ip, agente)
    values (${tenantId}::uuid, ${usuarioId}::uuid, ${novo.hash}, ${novo.expiraEm}, 'google',
            ${contexto.ip ?? null}, ${contexto.agente ?? null})
  `);
  await tx.execute(sql`update usuario set ultimo_acesso_em = now() where id = ${usuarioId}::uuid`);

  return { tenantId, usuarioId, token: novo.token, expiraEm: novo.expiraEm };
}
