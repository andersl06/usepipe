import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { TransactionPipe } from '@pipe/db';
import { FORMAT_E164, candidatosDoTelefone, paraE164 } from '@pipe/core';

/**
 * Ported from chatwoot/chatwoot (MIT), `app/services/data_import/contact_manager.rb`, with `phone_number` and `email` validations from `app/models/contact.rb`. For each CSV row, find an existing contact by identifier, email, then phone; merge supplied values if found, otherwise create one, then validate. Reimporting updates rather than duplicates. All queries run inside the import's `comTenant`; RLS limits matches to that client. Pipe additions: normalize phone to E.164 with the ninth digit (`paraE164`) and match both number forms (`candidatosDoTelefone`, as in the Chatwoot webhook); reject a contact lacking phone and email, matching Pipe's `POST /v1/contatos` rule; create a WhatsApp `contato_identidade` for a phone contact so its first message reaches this record instead of making a new one.
 */

/** As colunas que o original reconhece. O resto da linha vira atributo. */
const CAMPOS_PROPRIOS = new Set(['identifier', 'email', 'name', 'phone_number']);

/** `Devise.email_regexp`. */
const FORMAT_EMAIL = /^[^@\s]+@[^@\s]+$/;

export type ParametersOfContact = Record<string, string>;

export interface ContactAssembled {
  id: string | null;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  atributos: Record<string, unknown>;
  errors: string[];
}

type LineContact = {
  [column: string]: unknown;
  id: string;
  nome: string | null;
  email: string | null;
  telefone_e164: string | null;
  atributos: Record<string, unknown> | null;
};

function lista(values: readonly string[]): SQL {
  return sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  );
}

async function aContact(tx: TransactionPipe, condition: SQL): Promise<ContactAssembled | null> {
  const { rows } = await tx.execute<LineContact>(sql`
    select id, nome, email, telefone_e164, atributos
      from contato
     where excluido_em is null and ${condition}
     limit 1
  `);
  const linha = rows[0];
  if (!linha) return null;
  return {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    telefone: linha.telefone_e164,
    atributos: { ...(linha.atributos ?? {}) },
    errors: [],
  };
}


function formasDoTelefone(e164: string): string[] {
  return candidatosDoTelefone(e164.slice(1)).map((d) => `+${d}`);
}

/** `find_existing_contact`: identificador, depois e-mail, depois telefone. */
async function acharExistente(
  tx: TransactionPipe,
  params: ParametersOfContact,
): Promise<ContactAssembled | null> {
  if (params['identifier']) {
    const achado = await aContact(tx, sql`atributos->>'identifier' = ${params['identifier']}`);
    if (achado) return achado;
  }
  if (params['email']) {
    const achado = await aContact(tx, sql`lower(email) = ${params['email'].toLowerCase()}`);
    if (achado) return achado;
  }
  const telefone = paraE164(params['phone_number']);
  if (telefone && FORMAT_E164.test(telefone)) {
    // Prefer the exact form when both exist (the spec's `prefers the normalized format`).
    const { rows } = await tx.execute<{ id: string }>(sql`
      select id from contato
       where excluido_em is null and telefone_e164 in (${lista(formasDoTelefone(telefone))})
       order by (telefone_e164 = ${telefone}) desc
       limit 1
    `);
    if (rows[0]) return aContact(tx, sql`id = ${rows[0].id}::uuid`);
  }
  return null;
}

/** `update_contact_attributes`: nome, e o resto da linha nos atributos. */
function atualizarAtributos(params: ParametersOfContact, contact: ContactAssembled): void {
  if (params['name']) contact.nome = params['name'];
  for (const [key, value] of Object.entries(params)) {
    if (CAMPOS_PROPRIOS.has(key) && key !== 'identifier') continue;
    contact.atributos[key] = value;
  }
}

export async function assembleContact(
  tx: TransactionPipe,
  params: ParametersOfContact,
): Promise<ContactAssembled> {
  const existente = await acharExistente(tx, params);
  const contact: ContactAssembled = existente ?? {
    id: null,
    nome: null,
    email: null,
    telefone: null,
    atributos: {},
    errors: [],
  };

  // `find_or_initialize_contact` e `update_contact_with_merged_attributes`: o
  // A field supplied by this row overwrites the old value; an absent field stays unchanged.
  if (params['email']) contact.email = params['email'];
  if (params['phone_number']) contact.telefone = paraE164(params['phone_number']);
  atualizarAtributos(params, contact);

  contact.errors = await validar(tx, contact);
  return contact;
}

/** Apply `Contact` validations with Chatwoot's pt_BR messages. */
async function validar(tx: TransactionPipe, contato: ContactAssembled): Promise<string[]> {
  const errors: string[] = [];
  if (!contato.telefone && !contato.email) {
    errors.push('Informe telefone ou e-mail: contato sem identificador não recebe mensagem');
    return errors;
  }
  if (contato.email && !FORMAT_EMAIL.test(contato.email)) errors.push('E-mail inválido');
  if (contato.telefone && !FORMAT_E164.test(contato.telefone)) {
    errors.push('Telefone deve estar no formato e164');
  }
  if (errors.length > 0) return errors;

  // `uniqueness: { scope: [:account_id] }` means another contact already has this value.
  const outro = contato.id ? sql`id <> ${contato.id}::uuid` : sql`true`;
  if (contato.telefone) {
    const { rows } = await tx.execute<{ id: string }>(sql`
      select id from contato
       where excluido_em is null and ${outro}
         and telefone_e164 in (${lista(formasDoTelefone(contato.telefone))})
       limit 1
    `);
    if (rows[0]) errors.push('Telefone já está em uso');
  }
  if (contato.email) {
    const { rows } = await tx.execute<{ id: string }>(sql`
      select id from contato
       where excluido_em is null and ${outro} and lower(email) = ${contato.email.toLowerCase()}
       limit 1
    `);
    if (rows[0]) errors.push('E-mail já está em uso');
  }
  return errors;
}

/** Implement `Contact.import` for one validated row and return its ID. */
export async function saveContact(
  tx: TransactionPipe,
  tenantId: string,
  contato: ContactAssembled,
): Promise<string> {
  const atributos = JSON.stringify(contato.atributos);
  let id = contato.id;
  if (id) {
    await tx.execute(sql`
      update contato
         set nome = ${contato.nome}, email = ${contato.email},
             telefone_e164 = ${contato.telefone}, atributos = ${atributos}::jsonb,
             atualizado_em = now()
       where id = ${id}::uuid
    `);
  } else {
    const { rows } = await tx.execute<{ id: string }>(sql`
      insert into contato (tenant_id, nome, email, telefone_e164, atributos)
      values (${tenantId}::uuid, ${contato.nome}, ${contato.email}, ${contato.telefone},
              ${atributos}::jsonb)
      returning id
    `);
    id = rows[0]!.id;
    contato.id = id;
  }

  if (contato.telefone) {
    // `wa_id` is the number without `+`. With `do nothing`, an identity created by WhatsApp
    // continues to point to the same contact rather than being reassigned.
    await tx.execute(sql`
      insert into contato_identidade (tenant_id, contato_id, canal_tipo, identificador)
      values (${tenantId}::uuid, ${id}::uuid, 'whatsapp_cloud', ${contato.telefone.slice(1)})
      on conflict (tenant_id, canal_tipo, identificador) do nothing
    `);
  }
  return id;
}
