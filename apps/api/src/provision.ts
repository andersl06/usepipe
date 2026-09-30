import { parseArgs } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { seed } from '@pipe/db';
import { LIMITES_DO_PLANO, PLANOS } from '@pipe/db/schema';
import type { Plano } from '@pipe/db/schema';
import { domainOfEmail, ehDomainPublic } from '@pipe/authentication';
import { readTenantHostConfig } from '@pipe/authentication';
import { buildLoginUrl, buildTenantOrigin, isReservedSubdomain, isValidTenantSlug, TENANT_SLUG_PATTERN } from '@pipe/contracts';
import { databaseOwner, fecharBancos, noTenant } from './database.js';
import { PipeError } from './errors.js';
import { logDomain, checkDomain } from './domain/dominios.js';
import type { RecordOfVerification } from './domain/dominios.js';

/**
 * Provision a tenant, first administrator, and verified domain through a command, not an HTTP route. Together these grant full tenant access; a route would require a master secret vulnerable to logs, screenshots, or `curl` shell history, plus rotation, rate limits, and caller audit. The command instead uses existing production database access, whose holder could already insert these records, and adds no Internet-facing surface. When a Pipe admin UI exists, it can call `provisionarCliente` through a session-authenticated route with a dedicated role and audit. Usage: `pnpm --filter @pipe/api provisionar --nome "Acme Atendimento" --slug acme --plano operacao --admin ana@acme.com.br [--dominio acme.com.br] [--verificar] [--reaplicar]`. Without `--verificar`, print the TXT record and leave the customer-owned DNS domain pending; staff can enter through invitations (`POST /v1/convites`) meanwhile.
 */


const MOTIVOS_PAUSA_PADRAO = [
  { nome: 'Almoço', duracaoSugeridaMin: 60, contaComoProdutivo: false },
  { nome: 'Intervalo', duracaoSugeridaMin: 15, contaComoProdutivo: false },
  { nome: 'Banheiro', duracaoSugeridaMin: 5, contaComoProdutivo: false },
  { nome: 'Reunião', duracaoSugeridaMin: 30, contaComoProdutivo: true },
  { nome: 'Treinamento', duracaoSugeridaMin: 60, contaComoProdutivo: true },
] as const;

const EMAIL_ACEITAVEL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface RequestOfProvisioning {
  name: string;
  slug: string;
  plan: string;
  /** First administrator's email; its domain is the tenant default. */
  admin: string;
  domain?: string | undefined;
  /** Check the TXT record now, only after the customer has published it. */
  verificar?: boolean | undefined;
  /** Allow reapplying to an existing slug; otherwise a duplicate slug stops. */
  reaplicar?: boolean | undefined;
  /**
   * Create a tenant without registering a domain for self-service signups. Personal-email users cannot claim a company domain: registering `gmail.com` for one tenant would grant it every Gmail user. Domain-based sign-in can be configured later.
   */
  withoutDomain?: boolean | undefined;
}

export interface ClienteProvisionado {
  tenantId: string;
  slug: string;
  plan: Plano;
  adminId: string;
  adminEmail: string;
  papeis: number;
  permissions: number;
  queues: number;
  motivosDePausa: number;
  /** Null when the tenant was created without a domain; see `semDominio` in the request. */
  domain: {
    id: string;
    domain: string;
    verificado: boolean;
    registro: RecordOfVerification;
  } | null;
}

export async function provisionCustomer(
  pedido: RequestOfProvisioning,
): Promise<ClienteProvisionado> {
  const nome = pedido.name.trim();
  const slug = pedido.slug.trim().toLowerCase();
  const admin = pedido.admin.trim().toLowerCase();

  if (!nome) throw PipeError.request('name_missing', 'O cliente precisa de nome.');
  if (isReservedSubdomain(slug)) {
    throw PipeError.request('reserved_slug', `"${slug}" é reservado e não pode ser usado como slug.`);
  }
  if (!TENANT_SLUG_PATTERN.test(slug) || !isValidTenantSlug(slug)) {
    throw PipeError.request(
      'slug_invalid',
      `"${slug}" não serve como slug: minúsculas, números e hífen no meio.`,
    );
  }
  if (!EMAIL_ACEITAVEL.test(admin)) {
    throw PipeError.request('admin_invalid', 'Informe o e-mail do primeiro administrador.');
  }
  if (!PLANOS.includes(pedido.plan as Plano)) {
    throw PipeError.request(
      'plan_invalid',
      `Plano "${pedido.plan}" não existe. Os planos são: ${PLANOS.join(', ')}.`,
    );
  }
  const plano = pedido.plan as Plano;

  // If no domain is supplied, derive it from the administrator email; entering the same value twice invites a mismatch.
  const domainTarget = pedido.domain ?? domainOfEmail(admin);
  if (!pedido.withoutDomain && !pedido.domain && ehDomainPublic(admin)) {
    throw PipeError.request(
      'domain_public',
      `${admin} é e-mail pessoal e não identifica empresa. Passe --dominio, ou provisione com o e-mail corporativo do administrador.`,
    );
  }

  const dono = databaseOwner();
  const { rows: existentes } = await dono.execute<{ id: string }>(
    sql`select id from tenant where slug = ${slug} limit 1`,
  );
  if (existentes[0] && !pedido.reaplicar) {
    throw PipeError.conflito(
      'slug_in_use',
      `Já existe um tenant com o slug "${slug}". Use outro slug, ou --reaplicar se a intenção é completar um provisionamento que falhou no meio.`,
    );
  }

  // The base seed is the single source for initial roles, permissions, and catalog.
  // filas de exemplo. Repetir aquela lista aqui garantiria que as duas divergissem.
  const semeado = await seed(dono, { name: nome, slug });

  const admins = await noTenant(semeado.tenantId, async (tx) => {
    // Run serially, never with `Promise.all`: parallel operations inside this transaction can lose `pipe.tenant_id` and run without a tenant; see the README.
    await tx.execute(
      sql`update tenant set plano = ${plano}, atualizado_em = now()
           where id = ${semeado.tenantId}::uuid`,
    );

    for (const motivo of MOTIVOS_PAUSA_PADRAO) {
      await tx.execute(sql`
        insert into motivo_pausa (tenant_id, nome, duracao_sugerida_min, conta_como_produtivo)
        select ${semeado.tenantId}::uuid, ${motivo.nome}, ${motivo.duracaoSugeridaMin},
               ${motivo.contaComoProdutivo}
         where not exists (select 1 from motivo_pausa where nome = ${motivo.nome})
      `);
    }

    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into usuario (tenant_id, nome, email)
      values (${semeado.tenantId}::uuid, ${admin.slice(0, admin.indexOf('@'))}, ${admin})
      on conflict (tenant_id, email) do update set ativo = true, atualizado_em = now()
      returning id
    `);
    const adminId = rows[0]!.id;

    // Assign two roles: `admin` at account scope (their only account role) and `administrador` at attendance scope (migration 0021).
    await tx.execute(sql`
      insert into usuario_papel (tenant_id, usuario_id, papel_id, escopo)
      select ${semeado.tenantId}::uuid, ${adminId}::uuid, id, escopo
        from papel where nome in ('admin', 'administrador')
      on conflict do nothing
    `);

    return adminId;
  });

  const domain = pedido.withoutDomain ? null : await logDomain(semeado.tenantId, domainTarget);
  let verificado = domain ? domain.verificadoEm !== null : false;
  if (domain && pedido.verificar && !verificado) {
    await checkDomain(semeado.tenantId, domain.id);
    verificado = true;
  }

  return {
    tenantId: semeado.tenantId,
    slug,
    plan: plano,
    adminId: admins,
    adminEmail: admin,
    papeis: semeado.papeis,
    permissions: semeado.permissions,
    queues: semeado.queues,
    motivosDePausa: MOTIVOS_PAUSA_PADRAO.length,
    domain: domain
      ? { id: domain.id, domain: domain.domain, verificado, registro: domain.registro }
      : null,
  };
}

/** Terminal text giving the tenant owner what they need to sign in. */
export function asLogin(cliente: ClienteProvisionado): string {
  const app = (process.env['PIPE_URL_APP'] ?? 'http://localhost:3000').replace(/\/$/, '');
  const config = readTenantHostConfig();
  const limites = LIMITES_DO_PLANO[cliente.plan];
  const linhas = [
    `tenant ${cliente.slug} (${cliente.tenantId}) criado no plano ${cliente.plan}`,
    `  catálogo: ${cliente.papeis} papéis, ${cliente.permissions} permissões, ` +
      `${cliente.queues} filas, ${cliente.motivosDePausa} motivos de pausa`,
    `  franquia: ${limites.conversationsAiByAgent} conversas de IA por atendente, ` +
      `mínimo de ${limites.minimumOfAgents} atendentes`,
    `  administrador: ${cliente.adminEmail} (${cliente.adminId})`,
    '',
  ];
  if (config) {
    linhas.push(
      `  Gestão: ${buildTenantOrigin(cliente.slug, 'application', config)}/application`,
      `  Desk: ${buildTenantOrigin(cliente.slug, 'desk', config)}/`,
      `  Login: ${buildLoginUrl(config)}`,
      '',
    );
  }

  if (!cliente.domain) {
    linhas.push(
      'sem domínio registrado (conta criada no login).',
      `Diga ao cliente: entre em ${config ? buildLoginUrl(config) : `${app}/login`} com a conta Google ${cliente.adminEmail}.`,
      'Para entrada por domínio, registre um em POST /v1/dominios e verifique o TXT.',
    );
    return linhas.join('\n');
  }

  if (cliente.domain.verificado) {
    linhas.push(
      `domínio ${cliente.domain.domain} VERIFICADO.`,
      `Diga ao cliente: entre em ${config ? buildLoginUrl(config) : `${app}/login`} com a conta Google ${cliente.adminEmail}.`,
      'A conta do Google é ligada sozinha na primeira entrada.',
    );
  } else {
    const r = cliente.domain.registro;
    linhas.push(
      `domínio ${cliente.domain.domain} PENDENTE. Peça ao cliente para publicar no DNS:`,
      '',
      `  ${r.name}   ${r.tipo}   "${r.value}"`,
      '',
      'Depois de propagar, confira com --verificar, ou pela rota',
      `POST /v1/dominios/${cliente.domain.id}/verificar.`,
      '',
      'Enquanto não estiver verificado, ninguém entra por domínio: use convite.',
      `O administrador já existe — convide-o por POST /v1/convites e mande o link.`,
    );
  }
  return linhas.join('\n');
}

const executadoDiretamente = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (executadoDiretamente) {
  const { values } = parseArgs({
    options: {
      nome: { type: 'string' },
      slug: { type: 'string' },
      plano: { type: 'string', default: 'essencial' },
      admin: { type: 'string' },
      dominio: { type: 'string' },
      verificar: { type: 'boolean', default: false },
      reaplicar: { type: 'boolean', default: false },
    },
  });

  const faltando = (['nome', 'slug', 'admin'] as const).filter((campo) => !values[campo]);
  if (faltando.length > 0) {
    process.stderr.write(
      `faltam --${faltando.join(', --')}\n` +
        'uso: provisionar --nome "Acme" --slug acme --plano operacao --admin ana@acme.com.br\n',
    );
    process.exitCode = 1;
  } else {
    provisionCustomer({
      name: values.nome ?? '',
      slug: values.slug ?? '',
      plan: values.plano ?? 'essencial',
      admin: values.admin ?? '',
      domain: values.dominio,
      verificar: values.verificar,
      reaplicar: values.reaplicar,
    })
      .then((cliente) => {
        process.stdout.write(`${asLogin(cliente)}\n`);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`falha ao provisionar: ${message}\n`);
        process.exitCode = 1;
      })
      .finally(() => fecharBancos());
  }
}
