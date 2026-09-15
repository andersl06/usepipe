import { sql } from 'drizzle-orm';
import { dominioDoEmail, ehDominioPublico } from '@pipe/autenticacao';
import { bancoDono, noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { provisionarCliente } from '../provisionar.js';

/**
 * Portado de chatwoot/chatwoot (MIT), app/builders/account_builder.rb, e a
 * leitura da flag de `account_signup_enabled?` em lib/global_config_service.rb.
 *
 * ## A decisão que esta flag carrega
 *
 * `docs/specs/2026-09-07-implantacao.md` §6.1 decide que a venda é ASSISTIDA:
 * quem cria tenant é o comando `provisionar`, e "provisionar é comando, não rota".
 * A flag do Chatwoot resolve o impasse sem contrariar a spec: `ENABLE_ACCOUNT_SIGNUP`
 * nasce `false`, e com ela desligada a rota pública responde 404 — exatamente o
 * que o Chatwoot faz (`check_signup_enabled`). Ligar é decisão do dono.
 *
 * Quem ligar precisa saber o que falta, porque o Chatwoot tem e o Pipe não:
 * - **captcha** (`validate_captcha`, hCaptcha);
 * - **confirmação do e-mail** antes de haver sessão — o Pipe não manda e-mail
 *   (`o-que-falta.md` item 7). Aqui a conta nasce INERTE: o administrador só
 *   entra pelo Google com aquele e-mail, e só depois de alguém do Pipe verificar
 *   o domínio ou mandar um convite;
 * - **limite de tentativa** por IP, que o Chatwoot faz fora deste arquivo (Rack::Attack).
 *
 * O que NÃO é duplicado: criar tenant, catálogo, papéis e administrador é o
 * `provisionarCliente`, o mesmo do comando. Este arquivo só valida e chama.
 */

/** `GlobalConfigService.account_signup_enabled?`: qualquer valor que não seja `false` liga. */
export function cadastroDeContaHabilitado(env: NodeJS.ProcessEnv = process.env): boolean {
  const valor = (env['ENABLE_ACCOUNT_SIGNUP'] ?? '').trim() || 'false';
  return valor !== 'false';
}

const EMAIL_ACEITAVEL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface PedidoDeConta {
  nomeDaConta?: string | undefined;
  nomeDoUsuario?: string | undefined;
  email?: string | undefined;
}

export interface ContaCriada {
  tenantId: string;
  adminId: string;
  slug: string;
  email: string;
}

/** O slug do espaço a partir do nome (a sugestão que a Blip faz em `/tenant-valid-id`). */
export function slugDaConta(nome: string, email: string): string {
  const base = (nome || dominioDoEmail(email).split('.')[0] || 'conta')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.slice(0, 48).replace(/-+$/, '') || 'conta';
}

/**
 * A conta que nasce NO LOGIN, sem convite e sem domínio verificado.
 *
 * É o autosserviço da plataforma de origem: quem entra e não pertence a conta
 * nenhuma ganha uma na hora, e os dados da empresa vêm depois, em "minha
 * conta". Por isso aqui não há as validações de `construirConta`:
 *
 * - **domínio público passa.** Lá a conta pessoal é o caso comum de quem está
 *   experimentando, e o nome da empresa é assunto do formulário seguinte.
 * - **e-mail que já é usuário passa.** A mesma pessoa administra várias contas,
 *   e a partir da migração 0017 a identidade do provedor é única por tenant,
 *   não no sistema inteiro.
 *
 * O que NÃO se dispensa é o provedor ter confirmado o e-mail — isso é conferido
 * antes, em `entrarComIdentidade`, e vale para todo caminho de entrada.
 *
 * O slug ganha sufixo quando bate com um que já existe: são contas de gente
 * diferente com o mesmo nome de empresa, e derrubar o login de quem chegou
 * depois seria o pior jeito de contar isso.
 */
export async function construirContaDoLogin(pessoa: {
  email: string;
  nome?: string | undefined;
}): Promise<{ tenantId: string; usuarioId: string; slug: string }> {
  const email = pessoa.email.trim().toLowerCase();
  const publico = ehDominioPublico(email);

  // O nome da conta: o da empresa quando o e-mail é corporativo, o da pessoa
  // quando não é. Ambos são provisórios — "minha conta" reescreve.
  const nome = publico
    ? pessoa.nome?.trim() || email.slice(0, email.indexOf('@'))
    : dominioDoEmail(email).split('.')[0] || email.slice(0, email.indexOf('@'));

  const cliente = await provisionarCliente({
    nome,
    slug: await slugLivre(enderecoDaConta(email)),
    plano: 'essencial',
    admin: email,
    // E-mail pessoal não reivindica domínio; corporativo também não, aqui:
    // domínio é o que dá entrada a TODO mundo daquele endereço, e isso se pede
    // depois, com verificação por DNS.
    semDominio: true,
  });

  const nomeDaPessoa = pessoa.nome?.trim();
  if (nomeDaPessoa) {
    await noTenant(cliente.tenantId, (tx) =>
      tx.execute(
        sql`update usuario set nome = ${nomeDaPessoa}, atualizado_em = now()
             where id = ${cliente.adminId}::uuid`,
      ),
    );
  }

  return { tenantId: cliente.tenantId, usuarioId: cliente.adminId, slug: cliente.slug };
}

/**
 * O endereço da conta, no formato da plataforma de origem: a PARTE LOCAL DO
 * E-MAIL mais um sufixo curto — `anderson-linhares-oxo7k`.
 *
 * Lá esse texto vira o subdomínio do portal daquela conta, e ele sai do e-mail
 * de quem está criando, não do nome da empresa: no minuto do cadastro ninguém
 * digitou nome de empresa ainda, e o endereço precisa existir antes disso.
 *
 * O sufixo aleatório não é enfeite: sem ele, duas pessoas chamadas
 * `joao.silva` em empresas diferentes brigariam pelo mesmo endereço, e a
 * segunda entraria numa fila de `-2`, `-3` que denuncia quantas contas existem.
 * Cinco caracteres em base 36 dão 60 milhões de combinações por nome.
 */
export function enderecoDaConta(email: string, aleatorio = Math.random): string {
  const local = email.slice(0, email.indexOf('@') > 0 ? email.indexOf('@') : undefined);
  const base = local
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  const sufixo = Math.floor(aleatorio() * 36 ** 5)
    .toString(36)
    .padStart(5, '0');
  return `${base || 'conta'}-${sufixo}`;
}

/** `nome`, `nome-2`, `nome-3`… O primeiro que ninguém usou. */
async function slugLivre(base: string): Promise<string> {
  for (let tentativa = 1; tentativa <= 50; tentativa++) {
    const slug = tentativa === 1 ? base : `${base}-${tentativa}`;
    const { rows } = await bancoDono().execute<{ existe: boolean }>(
      sql`select exists (select 1 from tenant where slug = ${slug}) as existe`,
    );
    if (!rows[0]?.existe) return slug;
  }
  // 50 contas com o mesmo nome é sinal de outra coisa acontecendo; o sufixo de
  // tempo garante que ninguém fica sem entrar enquanto se descobre o quê.
  return `${base}-${Date.now().toString(36)}`;
}

export async function construirConta(pedido: PedidoDeConta): Promise<ContaCriada> {
  const email = (pedido.email ?? '').trim().toLowerCase();

  // `validate_email` — o `SignUpEmailValidationService`, com as frases do pt_BR dele.
  if (!EMAIL_ACEITAVEL.test(email)) {
    throw ErroPipe.requisicao('email_invalido', 'Você digitou um email inválido');
  }
  if (ehDominioPublico(email)) {
    throw ErroPipe.requisicao(
      'dominio_bloqueado',
      'Este domínio não é permitido. Se você acredita que isso é um erro, por favor contate o suporte.',
    );
  }

  // `validate_user`: e-mail que já é usuário em qualquer cliente. Papel dono,
  // porque a pergunta é global, e só volta sim ou não.
  const { rows } = await bancoDono().execute<{ existe: boolean }>(
    sql`select exists (select 1 from usuario where lower(email) = ${email}) as existe`,
  );
  if (rows[0]?.existe) {
    throw ErroPipe.conflito('usuario_existe', `Você já se cadastrou para uma conta com ${email}`);
  }

  // `create_account` e `create_and_link_user`, pelo provisionamento de sempre.
  const nome = pedido.nomeDaConta?.trim() || pedido.nomeDoUsuario?.trim() || dominioDoEmail(email);
  const cliente = await provisionarCliente({
    nome,
    slug: slugDaConta(nome, email),
    plano: 'essencial',
    admin: email,
  });

  // `name: user_full_name` — o provisionamento põe a parte local do e-mail.
  const nomeDoUsuario = pedido.nomeDoUsuario?.trim();
  if (nomeDoUsuario) {
    await noTenant(cliente.tenantId, (tx) =>
      tx.execute(sql`update usuario set nome = ${nomeDoUsuario} where id = ${cliente.adminId}::uuid`),
    );
  }

  return { tenantId: cliente.tenantId, adminId: cliente.adminId, slug: cliente.slug, email };
}
