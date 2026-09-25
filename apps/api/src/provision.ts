import { parseArgs } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { seed } from '@pipe/db';
import { LIMITES_DO_PLANO, PLANOS } from '@pipe/db/schema';
import type { Plano } from '@pipe/db/schema';
import { domainOfEmail, ehDomainPublic } from '@pipe/authentication';
import { databaseOwner, fecharBancos, noTenant } from './database.js';
import { PipeError } from './errors.js';
import { logDomain, checkDomain } from './domain/dominios.js';
import type { RegistroOfVerification } from './domain/dominios.js';

/**
 * Provisionar um cliente: de "vendemos" a "o dono consegue entrar".
 *
 * ## Comando, e não rota. Por quê
 *
 * Provisionar cria tenant, primeiro administrador e domínio verificado — as três
 * coisas que, juntas, dão acesso a um cliente inteiro. Exposto como rota, isso vira
 * **uma chave mestra por HTTP**: um segredo em variável de ambiente que, vazado em
 * log, em captura de tela ou no histórico do shell de quem chamou com `curl`, cria
 * tenants e administradores para quem o tiver. Rota também exige rotação de chave,
 * limite de tentativa e auditoria de quem chamou — trabalho que só se paga quando
 * existe tela de administração para justificá-lo.
 *
 * Como comando, a credencial é a que já existe e já é protegida: **o acesso ao
 * banco de produção**. Quem pode rodar isto já podia inserir as linhas à mão; a
 * diferença é que agora ele as insere certas, com o catálogo semeado e o domínio
 * verificado. E não há superfície nova na internet.
 *
 * Quando existir tela de administração do Pipe, o caminho é ela chamar uma rota
 * autenticada pela sessão de um usuário nosso, com papel próprio e auditoria — e
 * `provisionarCliente` continua sendo a função que ela chama. Não é preciso
 * reescrever nada; é preciso ganhar um chamador com identidade.
 *
 * ## Uso
 *
 * ```
 * pnpm --filter @pipe/api provisionar \
 *   --nome "Acme Atendimento" --slug acme --plano operacao \
 *   --admin ana@acme.com.br [--dominio acme.com.br] [--verificar] [--reaplicar]
 * ```
 *
 * Sem `--verificar` o comando imprime o TXT a publicar e o domínio fica pendente —
 * que é o caso normal, porque o DNS é do cliente. Enquanto ele não estiver
 * verificado, a equipe entra por convite (`POST /v1/convites`), que é a outra porta.
 */

/**
 * Motivos de pausa do dia 1.
 *
 * Ficam aqui e não em `packages/db/src/semente.ts` só porque aquele arquivo é
 * território de outra pessoa nesta rodada. É lá que eles pertencem, ao lado dos
 * papéis e das filas de exemplo — este bloco deve mudar de casa junto com a
 * primeira alteração que abrir a semente.
 */
const MOTIVOS_PAUSA_PADRAO = [
  { nome: 'Almoço', duracaoSugeridaMin: 60, contaComoProdutivo: false },
  { nome: 'Intervalo', duracaoSugeridaMin: 15, contaComoProdutivo: false },
  { nome: 'Banheiro', duracaoSugeridaMin: 5, contaComoProdutivo: false },
  { nome: 'Reunião', duracaoSugeridaMin: 30, contaComoProdutivo: true },
  { nome: 'Treinamento', duracaoSugeridaMin: 60, contaComoProdutivo: true },
] as const;

const SLUG_ACEITAVEL = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL_ACEITAVEL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface RequestOfProvisioning {
  name: string;
  slug: string;
  plan: string;
  /** O e-mail do primeiro administrador. O domínio dele é o padrão do tenant. */
  admin: string;
  domain?: string | undefined;
  /** Confere o TXT agora. Só faz sentido quando o cliente já publicou o registro. */
  verificar?: boolean | undefined;
  /** Deixa reaplicar sobre um slug que já existe. Sem isto, slug repetido para. */
  reaplicar?: boolean | undefined;
  /**
   * Cria o cliente SEM registrar domínio.
   *
   * É o caso da conta que nasce no login (autosserviço): quem entra com e-mail
   * pessoal não tem domínio para reivindicar, e registrar "gmail.com" como
   * domínio de um tenant daria a ele todo mundo que tem Gmail. Domínio ali é
   * assunto de depois, quando a empresa quiser entrada por domínio.
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
  /** Nulo quando o cliente nasceu sem domínio — ver `semDominio` no pedido. */
  domain: {
    id: string;
    domain: string;
    verificado: boolean;
    registro: RegistroOfVerification;
  } | null;
}

export async function provisionCustomer(
  pedido: RequestOfProvisioning,
): Promise<ClienteProvisionado> {
  const nome = pedido.nome.trim();
  const slug = pedido.slug.trim().toLowerCase();
  const admin = pedido.admin.trim().toLowerCase();

  if (!nome) throw PipeError.request('name_missing', 'O cliente precisa de nome.');
  if (!SLUG_ACEITAVEL.test(slug)) {
    throw PipeError.request(
      'slug_invalid',
      `"${slug}" não serve como slug: minúsculas, números e hífen no meio.`,
    );
  }
  if (!EMAIL_ACEITAVEL.test(admin)) {
    throw PipeError.request('admin_invalid', 'Informe o e-mail do primeiro administrador.');
  }
  if (!PLANOS.includes(pedido.plano as Plano)) {
    throw PipeError.request(
      'plan_invalid',
      `Plano "${pedido.plano}" não existe. Os planos são: ${PLANOS.join(', ')}.`,
    );
  }
  const plano = pedido.plano as Plano;

  // O domínio sai do e-mail do administrador quando não vier explícito — é o caso
  // normal, e digitar duas vezes a mesma coisa é como se erra uma delas.
  const domainTarget = pedido.dominio ?? domainOfEmail(admin);
  if (!pedido.withoutDomain && !pedido.dominio && ehDomainPublic(admin)) {
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

  // A semente base é a fonte única do catálogo mínimo: papéis do dia 1, permissões e
  // filas de exemplo. Repetir aquela lista aqui garantiria que as duas divergissem.
  const semeado = await seed(dono, { nome, slug });

  const admins = await noTenant(semeado.tenantId, async (tx) => {
    // Em série, nunca em `Promise.all`: paralelo dentro da transação derruba o
    // `pipe.tenant_id` e a consulta passa a rodar sem tenant — ver o README.
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

    // Dois papéis: `admin` na conta (o único papel de conta dele) e
    // `administrador` no atendimento (migração 0021).
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
    plano,
    adminId: admins,
    adminEmail: admin,
    papeis: semeado.papeis,
    permissions: semeado.permissions,
    queues: semeado.queues,
    motivosDePausa: MOTIVOS_PAUSA_PADRAO.length,
    domain: domain
      ? { id: domain.id, dominio: domain.dominio, verificado, registro: domain.registro }
      : null,
  };
}

/** O que o dono do cliente precisa para entrar, em texto de terminal. */
export function asLogin(cliente: ClienteProvisionado): string {
  const app = (process.env['PIPE_URL_APP'] ?? 'http://localhost:3000').replace(/\/$/, '');
  const limites = LIMITES_DO_PLANO[cliente.plano];
  const linhas = [
    `tenant ${cliente.slug} (${cliente.tenantId}) criado no plano ${cliente.plano}`,
    `  catálogo: ${cliente.papeis} papéis, ${cliente.permissions} permissões, ` +
      `${cliente.queues} filas, ${cliente.motivosDePausa} motivos de pausa`,
    `  franquia: ${limites.conversationsAiByAgent} conversas de IA por atendente, ` +
      `mínimo de ${limites.minimumOfAgents} atendentes`,
    `  administrador: ${cliente.adminEmail} (${cliente.adminId})`,
    '',
  ];

  if (!cliente.domain) {
    linhas.push(
      'sem domínio registrado (conta criada no login).',
      `Diga ao cliente: entre em ${app}/entrar com a conta Google ${cliente.adminEmail}.`,
      'Para entrada por domínio, registre um em POST /v1/dominios e verifique o TXT.',
    );
    return linhas.join('\n');
  }

  if (cliente.domain.verificado) {
    linhas.push(
      `domínio ${cliente.domain.dominio} VERIFICADO.`,
      `Diga ao cliente: entre em ${app}/entrar com a conta Google ${cliente.adminEmail}.`,
      'A conta do Google é ligada sozinha na primeira entrada.',
    );
  } else {
    const r = cliente.domain.registro;
    linhas.push(
      `domínio ${cliente.domain.dominio} PENDENTE. Peça ao cliente para publicar no DNS:`,
      '',
      `  ${r.nome}   ${r.tipo}   "${r.value}"`,
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
      nome: values.nome ?? '',
      slug: values.slug ?? '',
      plano: values.plano ?? 'essencial',
      admin: values.admin ?? '',
      dominio: values.dominio,
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
