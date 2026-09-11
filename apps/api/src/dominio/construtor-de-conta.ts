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
