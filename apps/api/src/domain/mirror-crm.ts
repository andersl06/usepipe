import { sql } from 'drizzle-orm';
import type { JobMirrorCrm } from '@pipe/workers';
import { databaseOwner, noTenant } from '../database.js';
import { configDoTenant, espelharContact } from './twenty.js';
import type { ContactForEspelhar } from './twenty.js';

/**
 * Mirror a Pipe contact as a `person` in that client's CRM (`docs/specs/2026-09-07-integracao-twenty.md` §§4–5). Pipe remains the contact source of truth; writes only flow outward. Three §5 isolation checks apply: read `configDoTenant` inside `comTenant` so RLS guards CRM URL and key; reread the contact in the job tenant's `comTenant` so another client's `contatoId` returns no row; and verify returned `pipeContatoId` in `espelharContato` before storing any ID.
 */

/** A missing contact or tenant CRM is absence, not an error. */
export const WITHOUT_MIRROR = 'without_mirror' as const;

export type ResultMirror =
  | { state: 'espelhado'; pessoaId: string }
  | { state: typeof WITHOUT_MIRROR };

export async function syncContact(
  tenantId: string,
  contactId: string,
  buscar: typeof fetch = fetch,
): Promise<ResultMirror> {
  // Read contact and configuration in one transaction with a fixed tenant, IN SERIES;
  // `Promise.all` aqui derruba o `set_config('pipe.tenant_id')` e o passo seguinte
  // a cross-tenant CRM write is the worst place for a transaction-context failure.
  const preparo = await noTenant(tenantId, async (tx) => {
    const config = await configDoTenant(tx, tenantId);
    if (!config) return null;

    const { rows } = await tx.execute<{
      id: string;
      name: string | null;
      email: string | null;
      phoneE164: string | null;
      twenty_pessoa_id: string | null;
      empresa_twenty_id: string | null;
    }>(sql`
      select c.id, c.nome, c.email, c.telefone_e164, c.twenty_pessoa_id,
             a.twenty_empresa_id as empresa_twenty_id
        from contato c
        left join conta a on a.id = c.conta_id
       where c.id = ${contactId}::uuid and c.excluido_em is null
       limit 1
    `);
    const linha = rows[0];
    if (!linha) return null;

    const contact: ContactForEspelhar = {
      id: linha.id,
      name: linha.name,
      email: linha.email,
      telefoneE164: linha.phoneE164,
      twentyPessoaId: linha.twenty_pessoa_id,
      empresaTwentyId: linha.empresa_twenty_id,
    };
    return { config, contact };
  });

  if (!preparo) return { state: WITHOUT_MIRROR };

  // Call the network OUTSIDE the transaction: a database connection
  // held while waiting for a slow client CRM is unavailable to everyone else.
  // outros. O `PIPE_TWENTY_TIMEOUT_MS` protege o worker; isto protege o pool.
  const pessoaId = await espelharContact(preparo.config, preparo.contact, buscar);

  if (pessoaId !== preparo.contact.twentyPessoaId) {
    await noTenant(tenantId, async (tx) => {
      await tx.execute(sql`
        update contato set twenty_pessoa_id = ${pessoaId}, atualizado_em = now()
         where id = ${contactId}::uuid
      `);
    });
  }

  return { state: 'espelhado', pessoaId };
}

/**
 * The recovery sweep requeues contacts that have no CRM mirror. The queue is a nudge; the sweep is the guarantee, as with outbox delivery. Without it, a lost job leaves a contact permanently without the CRM profile link agents use. The owner role scans all tenants because RLS cannot return rows before a tenant is set (migration `0001_rls`, `banco.ts`). ONLY this `select` uses that role; actual sync returns to `comTenant` in `sincronizarContato`. Include only tenants with CRM configured.
 */
export async function contactsWithoutMirror(lote = 200): Promise<JobMirrorCrm[]> {
  const { rows } = await databaseOwner().execute<{ tenant_id: string; contactId: string }>(sql`
    select c.tenant_id, c.id as contato_id
      from contato c
      join tenant t on t.id = c.tenant_id
     where c.twenty_pessoa_id is null
       and c.excluido_em is null
       and t.ativo
       and t.twenty_url is not null
       and t.twenty_chave is not null
     order by c.criado_em
     limit ${lote}
  `);
  return rows.map((l) => ({ tenantId: l.tenant_id, contactId: l.contactId }));
}
