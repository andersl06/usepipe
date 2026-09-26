import { sql } from 'drizzle-orm';
import { cifrar, registrarAuditoria } from '@pipe/db';
import type { TransactionPipe, Ator } from '@pipe/db';
import { keyring } from '../../database.js';
import { PipeError } from '../../errors.js';
import { esquecerCertificadosMtls } from '../mtls.js';
import { lerPfx } from './pfx.js';

/**
 * Contract mTLS certificates for `/contrato/certificados`. Blip sends LIME commands to `postmaster@mtls.blip.ai`: multipart `.pfx` and password (`password`, `file`) yield `status` and `expiration_date`, with associated `hosts` (`referencias-blip/pesquisa/blip-certificados-mtls.md`). Since migration 0044, Pipe encrypts `.pfx` and password with `packages/db/src/segredo.ts` into `arquivo_cifrado`/`senha_cifrada`; `pfx.ts` extracts expiry, fingerprint, issuer and subject. `dominio/mtls.ts` presents the certificate on outbound webhooks. Status is derived: `valido`/`expirado` from expiry, `sem_arquivo` for pre-0044 manually entered records; Blip's `underValidation` corresponds to its asynchronous upload, while ours is synchronous. NEVER expose the file or password in lists, registration responses or audit logs; only `dominio/mtls.ts` decrypts them for `https.Agent`. Use raw SQL for `certificado_mtls` and `certificado_mtls_host` (migrations 0039/0044), as in `rastreador-de-cliques.ts`, to avoid concurrent Drizzle schema changes in `identidade`/`automacao`.
 */

export interface HostDoCertificado {
  id: string;
  host: string;
}

/** Map the source's `valid`/`invalid` to reason-specific names so the screen selects its status chip. */
export type StatusDoCertificado = 'valido' | 'expirado' | 'without_file';

export interface CertificadoMtls {
  id: string;
  description: string;
  /** ISO 8601 date only (`date` in the database), read from the `.pfx`. */
  expiresAt: string;
  /** SHA-256 `AB:CD:…`, lida do `.pfx`. */
  impressaoDigital: string;
  issuer: string | null;
  subject: string | null;
  status: StatusDoCertificado;
  hosts: HostDoCertificado[];
  criadoEm: string;
}

export interface PedidoDeCertificado {
  description: string;
  hosts: string[];
  /** A senha do `.pfx`. Cifrada no banco, nunca devolvida. */
  senha: string;
  /** The `.pfx` as raw base64 or a data URL (`data:…;base64,…`) produced by the screen's `FileReader`. */
  file: string;
}

export type Recording = { ok: true } | { ok: false; error: string };

const OK: Recording = { ok: true };

/** 'O arquivo deve ter no máximo 10MB' is the source `yt` limit; check it again here. */
export const MAX_BYTES_DO_PFX = 10 * 1048576;

const URL_HTTPS = /^https:\/\/[a-zA-Z0-9-.]+\.[a-zA-Z]{2,}(:\d+)?(\/.*)?$/;

/** The source's `vt.o` (`blip-certificados-mtls.md`): HTTPS with a domain. */
function normalizarHosts(crus: string[] | undefined): string[] {
  const vistos = new Set<string>();
  const limpos: string[] = [];
  for (const cru of crus ?? []) {
    const host = (cru ?? '').trim();
    if (!host) continue;
    if (!URL_HTTPS.test(host)) {
      throw PipeError.request('host_invalid', `"${host}" não é uma URL HTTPS válida.`, { host });
    }
    if (vistos.has(host)) continue;
    vistos.add(host);
    limpos.push(host);
  }
  if (limpos.length === 0) {
    throw PipeError.request('host_required', 'Informe ao menos um host para o certificado.');
  }
  return limpos;
}

function normalizeDescription(cru: string | undefined): string {
  const descricao = (cru ?? '').trim();
  if (!descricao) {
    throw PipeError.request('description_required', 'Informe a descrição do certificado.');
  }
  if (descricao.length > 50) {
    throw PipeError.request(
      'description_long',
      'A descrição do certificado tem no máximo 50 caracteres.',
    );
  }
  return descricao;
}

function normalizarSenha(crua: unknown): string {
  const senha = typeof crua === 'string' ? crua : '';
  if (!senha) throw PipeError.request('password_required', 'Informe a senha do certificado.');
  return senha;
}

/** Decode raw base64 or a data URL to bytes; reject empty, unreadable or oversized content with 400. */
function normalizeFile(cru: unknown): Buffer {
  const texto = typeof cru === 'string' ? cru.trim() : '';
  const base64 = texto.startsWith('data:') ? texto.slice(texto.indexOf(',') + 1) : texto;
  if (!base64 || !/^[A-Za-z0-9+/=\s]+$/.test(base64)) {
    throw PipeError.request('file_required', 'Mande o arquivo .pfx em base64.');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.byteLength === 0) {
    throw PipeError.request('file_required', 'Mande o arquivo .pfx em base64.');
  }
  if (bytes.byteLength > MAX_BYTES_DO_PFX) {
    throw PipeError.request('file_large', 'O arquivo deve ter no máximo 10MB.');
  }
  return bytes;
}

type LinhaDeCertificado = {
  id: string;
  description: string;
  expira_em: string;
  impressao_digital: string;
  issuer: string | null;
  subject: string | null;
  hasFile: boolean;
  expirado: boolean;
  createdAt: string;
};

function statusDe(linha: { hasFile: boolean; expirado: boolean }): StatusDoCertificado {
  if (!linha.hasFile) return 'without_file';
  return linha.expirado ? 'expirado' : 'valido';
}

/**
 * List newest first, as source `response.items` does. Do not select `arquivo_cifrado` or `senha_cifrada`: even encrypted values must not leave here. Compute `expirado` in PostgreSQL with `current_date` so comparison of a `date` does not depend on process time zone.
 */
export async function listarCertificados(
  tx: TransactionPipe,
  tenantId: string,
): Promise<CertificadoMtls[]> {
  // `expira_em` sai como texto `YYYY-MM-DD`: o driver devolveria um `date`
  // as a `Date` at LOCAL midnight; `toISOString()` in a negative time zone
  // voltaria um dia.
  const { rows: certificados } = await tx.execute<LinhaDeCertificado>(sql`
    select id, descricao as description, to_char(expira_em, 'YYYY-MM-DD') as expira_em,
           impressao_digital, emissor as issuer, sujeito as subject,
           (arquivo_cifrado is not null and senha_cifrada is not null) as "hasFile",
           (expira_em < current_date) as expirado,
           criado_em as "createdAt"
      from certificado_mtls
     where tenant_id = ${tenantId}::uuid
     order by criado_em desc
  `);
  if (certificados.length === 0) return [];

  // A JS array interpolated into `sql` is not a PostgreSQL array literal (the driver
  // sends a record, which `any(uuid[])` rejects). Construct `{a,b,c}` explicitly
  // as one text parameter cast with `::uuid[]`.
  const idsLiteral = `{${certificados.map((c) => c.id).join(',')}}`;
  const { rows: hosts } = await tx.execute<{ id: string; certificado_id: string; host: string }>(sql`
    select id, certificado_id, host
      from certificado_mtls_host
     where certificado_id = any(${idsLiteral}::uuid[])
     order by criado_em asc
  `);
  const hostsByCertificate = new Map<string, HostDoCertificado[]>();
  for (const h of hosts) {
    const lista = hostsByCertificate.get(h.certificado_id) ?? [];
    lista.push({ id: h.id, host: h.host });
    hostsByCertificate.set(h.certificado_id, lista);
  }

  return certificados.map((c) => ({
    id: c.id,
    description: c.description,
    expiresAt: new Date(c.expira_em).toISOString(),
    impressaoDigital: c.impressao_digital,
    issuer: c.issuer,
    subject: c.subject,
    status: statusDe(c),
    hosts: hostsByCertificate.get(c.id) ?? [],
    criadoEm: new Date(c.createdAt).toISOString(),
  }));
}

/**
 * Register the certificate and its hosts in one transaction. Parse the `.pfx` with `lerPfx` BEFORE writing: a wrong password or unusable file returns 400 without a database row. Encrypt stored content with the current keyring key.
 */
export async function createCertificate(
  tx: TransactionPipe,
  tenantId: string,
  ator: Ator,
  pedido: PedidoDeCertificado,
): Promise<CertificadoMtls> {
  const description = normalizeDescription(pedido.description);
  const hosts = normalizarHosts(pedido.hosts);
  const senha = normalizarSenha(pedido.senha);
  const file = normalizeFile(pedido.file);
  const read = lerPfx(file, senha);

  const chaves = keyring();
  const fileEncrypted = cifrar(file.toString('base64'), chaves);
  const senhaCifrada = cifrar(senha, chaves);
  const expiraEm = read.expiraEm.toISOString().slice(0, 10);

  const { rows } = await tx.execute<{ id: string; createdAt: string; expirado: boolean }>(sql`
    insert into certificado_mtls
      (tenant_id, descricao, expira_em, impressao_digital, emissor, sujeito,
       arquivo_cifrado, senha_cifrada, criado_por)
    values (${tenantId}::uuid, ${description}, ${expiraEm}::date, ${read.impressaoDigital},
            ${read.emissor}, ${read.sujeito}, ${fileEncrypted}, ${senhaCifrada},
            ${ator.id ?? null})
    returning id, criado_em as "createdAt", (expira_em < current_date) as expirado
  `);
  const novo = rows[0]!;

  const hostsGravados: HostDoCertificado[] = [];
  for (const host of hosts) {
    const { rows: hostRows } = await tx.execute<{ id: string }>(sql`
      insert into certificado_mtls_host (tenant_id, certificado_id, host)
      values (${tenantId}::uuid, ${novo.id}::uuid, ${host})
      returning id
    `);
    hostsGravados.push({ id: hostRows[0]!.id, host });
  }

  // Return only public certificate fields, never the file or password.
  await registrarAuditoria(tx, tenantId, {
    ator,
    acao: 'criou',
    objetoTipo: 'certificado_mtls',
    objetoId: novo.id,
    depois: {
      description,
      expiraEm: read.expiraEm.toISOString(),
      impressaoDigital: read.impressaoDigital,
      sujeito: read.sujeito,
      emissor: read.emissor,
      hosts,
    },
  });

  // Invalidate this tenant's host index in `mtls.ts`. Called within
  // the transaction, so a delivery before commit may reload old state;
  // the index's short TTL bounds that interval.
  esquecerCertificadosMtls(tenantId);

  return {
    id: novo.id,
    description,
    // Use the listing's date representation: midnight UTC.
    expiresAt: new Date(expiraEm).toISOString(),
    impressaoDigital: read.impressaoDigital,
    issuer: read.emissor,
    subject: read.sujeito,
    status: novo.expirado ? 'expirado' : 'valido',
    hosts: hostsGravados,
    criadoEm: new Date(novo.createdAt).toISOString(),
  };
}

/** Exclui o certificado inteiro (e os hosts junto, por `ON DELETE CASCADE`). */
export async function excluirCertificado(
  tx: TransactionPipe,
  tenantId: string,
  ator: Ator,
  certificadoId: string,
): Promise<Recording> {
  const { rows } = await tx.execute<{ id: string; description: string }>(sql`
    select id, descricao as "description" from certificado_mtls
     where id = ${certificadoId}::uuid and tenant_id = ${tenantId}::uuid
     limit 1
  `);
  const alvo = rows[0];
  if (!alvo) return { ok: false, error: 'Este certificado não existe neste contrato.' };

  await tx.execute(
    sql`delete from certificado_mtls where id = ${certificadoId}::uuid and tenant_id = ${tenantId}::uuid`,
  );

  await registrarAuditoria(tx, tenantId, {
    ator,
    acao: 'excluiu',
    objetoTipo: 'certificado_mtls',
    objetoId: certificadoId,
    antes: { descricao: alvo.description },
  });
  esquecerCertificadosMtls(tenantId, certificadoId);
  return OK;
}

/**
 * Remove a host from the certificate. If it was the last, remove the certificate too: a certificate without a host authenticates nothing. This matches the source host modal behavior in `blip-certificados-mtls.md`: 'Se o certificado fica sem host, o modal de hosts fecha e a lista recarrega'.
 */
export async function excluirHostDoCertificado(
  tx: TransactionPipe,
  tenantId: string,
  ator: Ator,
  certificadoId: string,
  hostId: string,
): Promise<Recording> {
  const { rows } = await tx.execute<{ id: string; host: string }>(sql`
    select h.id, h.host
      from certificado_mtls_host h
      join certificado_mtls c on c.id = h.certificado_id
     where h.id = ${hostId}::uuid and h.certificado_id = ${certificadoId}::uuid
       and c.tenant_id = ${tenantId}::uuid
     limit 1
  `);
  const alvo = rows[0];
  if (!alvo) return { ok: false, error: 'Este host não existe neste certificado.' };

  await tx.execute(sql`delete from certificado_mtls_host where id = ${hostId}::uuid`);

  const { rows: restantes } = await tx.execute<{ n: string }>(sql`
    select count(*)::text as n from certificado_mtls_host where certificado_id = ${certificadoId}::uuid
  `);
  const semHostRestante = restantes[0]?.n === '0';
  if (semHostRestante) {
    await tx.execute(
      sql`delete from certificado_mtls where id = ${certificadoId}::uuid and tenant_id = ${tenantId}::uuid`,
    );
  }

  await registrarAuditoria(tx, tenantId, {
    ator,
    acao: 'excluiu',
    objetoTipo: 'certificado_mtls_host',
    objetoId: hostId,
    antes: { host: alvo.host, certificadoExcluidoJunto: semHostRestante },
  });
  esquecerCertificadosMtls(tenantId, certificadoId);
  return OK;
}
