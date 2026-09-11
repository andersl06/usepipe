import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { TransacaoPipe } from '@pipe/db';
import { FORMATO_E164, candidatosDoTelefone, paraE164 } from '@pipe/core';

/**
 * Portado de chatwoot/chatwoot (MIT), app/services/data_import/contact_manager.rb,
 * com as validações de `phone_number` e `email` de app/models/contact.rb.
 *
 * Uma linha do CSV vira um contato: acha o existente por identificador, e-mail
 * ou telefone, nessa ordem; se achou, MESCLA (o que veio na linha ganha, o resto
 * fica); se não, monta um novo. Depois valida. É assim que a importação
 * deduplica — reimportar a mesma planilha não cria ninguém de novo, atualiza.
 *
 * Todas as consultas rodam dentro do `comTenant` da importação: a busca pelo
 * existente só enxerga contato daquele cliente, e é a RLS que garante isso.
 *
 * Acréscimos do Pipe:
 * - o telefone é normalizado para E.164 com o nono dígito (`paraE164`), e o
 *   existente é achado por qualquer das duas formas do número
 *   (`candidatosDoTelefone`, o mesmo casamento que o Chatwoot faz no webhook);
 * - contato sem telefone e sem e-mail é recusado — a mesma regra de
 *   `POST /v1/contatos` do Pipe: sem identificador, não recebe mensagem;
 * - quem tem telefone ganha `contato_identidade` de WhatsApp, para a primeira
 *   mensagem dele cair nesta ficha e não abrir uma nova.
 */

/** As colunas que o original reconhece. O resto da linha vira atributo. */
const CAMPOS_PROPRIOS = new Set(['identifier', 'email', 'name', 'phone_number']);

/** `Devise.email_regexp`. */
const FORMATO_EMAIL = /^[^@\s]+@[^@\s]+$/;

export type ParametrosDoContato = Record<string, string>;

export interface ContatoMontado {
  id: string | null;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  atributos: Record<string, unknown>;
  erros: string[];
}

type LinhaContato = {
  [coluna: string]: unknown;
  id: string;
  nome: string | null;
  email: string | null;
  telefone_e164: string | null;
  atributos: Record<string, unknown> | null;
};

function lista(valores: readonly string[]): SQL {
  return sql.join(
    valores.map((v) => sql`${v}`),
    sql`, `,
  );
}

async function umContato(tx: TransacaoPipe, condicao: SQL): Promise<ContatoMontado | null> {
  const { rows } = await tx.execute<LinhaContato>(sql`
    select id, nome, email, telefone_e164, atributos
      from contato
     where excluido_em is null and ${condicao}
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
    erros: [],
  };
}

/** Todas as formas do mesmo número, com `+`. */
function formasDoTelefone(e164: string): string[] {
  return candidatosDoTelefone(e164.slice(1)).map((d) => `+${d}`);
}

/** `find_existing_contact`: identificador, depois e-mail, depois telefone. */
async function acharExistente(
  tx: TransacaoPipe,
  params: ParametrosDoContato,
): Promise<ContatoMontado | null> {
  if (params['identifier']) {
    const achado = await umContato(tx, sql`atributos->>'identifier' = ${params['identifier']}`);
    if (achado) return achado;
  }
  if (params['email']) {
    const achado = await umContato(tx, sql`lower(email) = ${params['email'].toLowerCase()}`);
    if (achado) return achado;
  }
  const telefone = paraE164(params['phone_number']);
  if (telefone && FORMATO_E164.test(telefone)) {
    // A forma exata ganha quando as duas existem (o `prefers the normalized format` do spec).
    const { rows } = await tx.execute<{ id: string }>(sql`
      select id from contato
       where excluido_em is null and telefone_e164 in (${lista(formasDoTelefone(telefone))})
       order by (telefone_e164 = ${telefone}) desc
       limit 1
    `);
    if (rows[0]) return umContato(tx, sql`id = ${rows[0].id}::uuid`);
  }
  return null;
}

/** `update_contact_attributes`: nome, e o resto da linha nos atributos. */
function atualizarAtributos(params: ParametrosDoContato, contato: ContatoMontado): void {
  if (params['name']) contato.nome = params['name'];
  for (const [chave, valor] of Object.entries(params)) {
    if (CAMPOS_PROPRIOS.has(chave) && chave !== 'identifier') continue;
    contato.atributos[chave] = valor;
  }
}

export async function montarContato(
  tx: TransacaoPipe,
  params: ParametrosDoContato,
): Promise<ContatoMontado> {
  const existente = await acharExistente(tx, params);
  const contato: ContatoMontado = existente ?? {
    id: null,
    nome: null,
    email: null,
    telefone: null,
    atributos: {},
    erros: [],
  };

  // `find_or_initialize_contact` e `update_contact_with_merged_attributes`: o
  // que veio na linha sobrescreve; o que não veio fica como estava.
  if (params['email']) contato.email = params['email'];
  if (params['phone_number']) contato.telefone = paraE164(params['phone_number']);
  atualizarAtributos(params, contato);

  contato.erros = await validar(tx, contato);
  return contato;
}

/** As validações do `Contact`, com as frases do pt_BR do Chatwoot. */
async function validar(tx: TransacaoPipe, contato: ContatoMontado): Promise<string[]> {
  const erros: string[] = [];
  if (!contato.telefone && !contato.email) {
    erros.push('Informe telefone ou e-mail: contato sem identificador não recebe mensagem');
    return erros;
  }
  if (contato.email && !FORMATO_EMAIL.test(contato.email)) erros.push('E-mail inválido');
  if (contato.telefone && !FORMATO_E164.test(contato.telefone)) {
    erros.push('Telefone deve estar no formato e164');
  }
  if (erros.length > 0) return erros;

  // `uniqueness: { scope: [:account_id] }` — o outro contato que já tem este dado.
  const outro = contato.id ? sql`id <> ${contato.id}::uuid` : sql`true`;
  if (contato.telefone) {
    const { rows } = await tx.execute<{ id: string }>(sql`
      select id from contato
       where excluido_em is null and ${outro}
         and telefone_e164 in (${lista(formasDoTelefone(contato.telefone))})
       limit 1
    `);
    if (rows[0]) erros.push('Telefone já está em uso');
  }
  if (contato.email) {
    const { rows } = await tx.execute<{ id: string }>(sql`
      select id from contato
       where excluido_em is null and ${outro} and lower(email) = ${contato.email.toLowerCase()}
       limit 1
    `);
    if (rows[0]) erros.push('E-mail já está em uso');
  }
  return erros;
}

/** O `Contact.import` de uma linha já validada. Devolve o id. */
export async function salvarContato(
  tx: TransacaoPipe,
  tenantId: string,
  contato: ContatoMontado,
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
    // O `wa_id` é o número sem o `+`. `do nothing`: se o WhatsApp já trouxe esta
    // pessoa, a identidade existe e continua apontando para quem ela aponta.
    await tx.execute(sql`
      insert into contato_identidade (tenant_id, contato_id, canal_tipo, identificador)
      values (${tenantId}::uuid, ${id}::uuid, 'whatsapp_cloud', ${contato.telefone.slice(1)})
      on conflict (tenant_id, canal_tipo, identificador) do nothing
    `);
  }
  return id;
}
