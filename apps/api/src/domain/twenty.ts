import { sql } from 'drizzle-orm';
import { keyringOfAmbiente, decifrar, estaCifrado } from '@pipe/db';
import type { TransactionPipe } from '@pipe/db';

/**
 * Twenty CRM client, Pipe's only CRM access path (`docs/specs/2026-09-07-integracao-twenty.md`). Authenticate via `/metadata`; `/graphql` serves workspace data only and returns `Cannot query field "getLoginTokenFromCredentials" on type "Mutation"` for login attempts. Match metadata by `name`, never translated `label`: with `x-locale` pt-BR, labels such as `Pessoa` and `Empresa` change while `nameSingular` and field `name` remain English. Each tenant has its own CRM instance, so take URL and key from the tenant, never environment defaults. Without configuration, skip integration; a fallback could send one tenant's data to another's CRM. The configuration is selected from `tenant`.
 */

/** A CRM outage must not hang the worker. */
const TIMEOUT_MS = Number(process.env['PIPE_TWENTY_TIMEOUT_MS'] ?? 8_000);

export interface ConfigTwenty {
  /** Public base URL of this tenant's CRM instance, without a trailing slash. */
  url: string;
  /** Already decrypted API key; never log it. */
  key: string;
}

export class TwentyError extends Error {
  readonly permanente: boolean;
  constructor(message: string, permanente = false) {
    super(message);
    this.name = 'TwentyErro';
    this.permanente = permanente;
  }
}

/**
 * Return this tenant's CRM configuration or null. Run inside `comTenant`: if RLS hides the tenant's row, no URL or key is available and no integration occurs. This is the first of three isolation checks in spec §5. Return `null` when this tenant has no CRM.
 */
export async function configDoTenant(
  tx: TransactionPipe,
  tenantId: string,
): Promise<ConfigTwenty | null> {
  const { rows } = await tx.execute<{ twenty_url: string | null; twentyKey: string | null }>(
    sql`select twenty_url, twenty_chave from tenant where id = ${tenantId}::uuid limit 1`,
  );
  const linha = rows[0];
  if (!linha?.twenty_url || !linha.twentyKey) return null;

  const bruta = linha.twentyKey;
  // Tolera chave em texto puro para o ambiente de desenvolvimento, do mesmo jeito
  // Accept plaintext CRM keys in development, as `decifrarConfig` does for Meta tokens; production supplies an encrypted key.
  const key = estaCifrado(bruta) ? decifrar(bruta, keyringOfAmbiente()) : bruta;
  return { url: linha.twenty_url.replace(/\/$/, ''), key };
}

interface RespostaGraphql<T> {
  data?: T;
  errors?: { message: string; extensions?: { subCode?: string } }[];
}

/**
 * Call the CRM at `caminho`: `/graphql` for data, `/metadata` for authentication and metadata. Inject `buscar` so tests avoid network calls, as in `packages/autenticacao`. Log URL and error message, never the `Authorization` header.
 */
export async function chamar<T>(
  config: ConfigTwenty,
  caminho: '/graphql' | '/metadata',
  query: string,
  variables: Record<string, unknown> = {},
  buscar: typeof fetch = fetch,
): Promise<T> {
  let resposta: Response;
  try {
    resposta = await buscar(`${config.url}${caminho}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify({ query, variables: variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // Treat network failures as temporary; the CRM may be down and recover.
    throw new TwentyError(`CRM inalcançável em ${config.url}: ${(error as Error).message}`);
  }

  if (!resposta.ok) {
    // HTTP 401/403 means an invalid or unauthorized key; retrying cannot fix it.
    const permanente = resposta.status === 401 || resposta.status === 403;
    throw new TwentyError(`CRM respondeu ${resposta.status} em ${caminho}`, permanente);
  }

  const corpo = (await resposta.json()) as RespostaGraphql<T>;
  if (corpo.errors?.length) {
    const first = corpo.errors[0]!;
    const permanente = first.extensions?.subCode === 'PERMISSION_DENIED';
    throw new TwentyError(`CRM recusou a operação: ${first.message}`, permanente);
  }
  if (!corpo.data) throw new TwentyError('CRM respondeu sem `data`');
  return corpo.data;
}

/**
 * Pipe has one name field; Twenty splits names. Split on the first space: "Maria Clara Souza" becomes `Maria` and `Clara Souza`. Without a space, leave `lastName` empty, as Twenty expects.
 */
export function partirNome(nome: string | null): { firstName: string; lastName: string } {
  const limpo = (nome ?? '').trim();
  if (!limpo) return { firstName: '', lastName: '' };
  const corte = limpo.indexOf(' ');
  if (corte < 0) return { firstName: limpo, lastName: '' };
  return { firstName: limpo.slice(0, corte), lastName: limpo.slice(corte + 1).trim() };
}

export interface TelefoneTwenty {
  primaryPhoneNumber: string;
  primaryPhoneCallingCode: string;
  primaryPhoneCountryCode: string;
}

/**
 * Map `+5511988887777` to number, +55, and BR. Only Brazil has a country mapping because it is the current market. For numbers outside +55, leave country empty, which Twenty accepts, rather than losing the phone number. The target shape is `{número, +55, BR}`.
 */
export function partirTelefone(e164: string | null): TelefoneTwenty | null {
  const limpo = (e164 ?? '').replace(/[^\d+]/g, '');
  if (!limpo.startsWith('+') || limpo.length < 8) return null;
  if (limpo.startsWith('+55')) {
    return {
      primaryPhoneNumber: limpo.slice(3),
      primaryPhoneCallingCode: '+55',
      primaryPhoneCountryCode: 'BR',
    };
  }
  return {
    primaryPhoneNumber: limpo.slice(1),
    primaryPhoneCallingCode: '',
    primaryPhoneCountryCode: '',
  };
}

/** Link to the customer's CRM record, never the CRM home page. */
export function linkDaPessoa(url: string, pessoaId: string): string {
  return `${url.replace(/\/$/, '')}/object/person/${pessoaId}`;
}

export function linkDaEmpresa(url: string, empresaId: string): string {
  return `${url.replace(/\/$/, '')}/object/company/${empresaId}`;
}

export interface ContactForEspelhar {
  id: string;
  name: string | null;
  email: string | null;
  telefoneE164: string | null;
  twentyPessoaId: string | null;
  empresaTwentyId: string | null;
}

interface NoPessoa {
  id: string;
  pipeContactId: string | null;
}

const CAMPOS_PESSOA = 'id pipeContatoId';

/**
 * Create or update the matching Twenty `person` and return its ID. Look up `pipeContatoId` before creating to avoid duplicates when CRM creation succeeds but the Pipe transaction fails before saving the ID; the next run adopts the orphaned CRM record.
 */
export async function espelharContact(
  config: ConfigTwenty,
  contact: ContactForEspelhar,
  buscar: typeof fetch = fetch,
): Promise<string> {
  const nome = partirNome(contact.name);
  const telefone = partirTelefone(contact.telefoneE164);

  const data: Record<string, unknown> = { name: nome, pipeContatoId: contact.id };
  if (contact.email) data['emails'] = { primaryEmail: contact.email };
  if (telefone) data['phones'] = telefone;
  if (contact.empresaTwentyId) data['companyId'] = contact.empresaTwentyId;

  const idConhecido = contact.twentyPessoaId ?? (await acharPessoa(config, contact.id, buscar));

  if (idConhecido) {
    const r = await chamar<{ updatePerson: NoPessoa }>(
      config,
      '/graphql',
      `mutation($id: UUID!, $data: PersonUpdateInput!) {
         updatePerson(id: $id, data: $data) { ${CAMPOS_PESSOA} }
       }`,
      { id: idConhecido, data: data },
      buscar,
    );
    conferirDono(r.updatePerson, contact.id, config.url);
    return r.updatePerson.id;
  }

  const r = await chamar<{ createPerson: NoPessoa }>(
    config,
    '/graphql',
    `mutation($data: PersonCreateInput!) { createPerson(data: $data) { ${CAMPOS_PESSOA} } }`,
    { data: data },
    buscar,
  );
  conferirDono(r.createPerson, contact.id, config.url);
  return r.createPerson.id;
}

async function acharPessoa(
  config: ConfigTwenty,
  contactId: string,
  buscar: typeof fetch,
): Promise<string | null> {
  const r = await chamar<{ people: { edges: { node: NoPessoa }[] } }>(
    config,
    '/graphql',
    `query($f: PersonFilterInput) {
       people(filter: $f, first: 1) { edges { node { ${CAMPOS_PESSOA} } } }
     }`,
    { f: { pipeContatoId: { eq: contactId } } },
    buscar,
  );
  return r.people.edges[0]?.node.id ?? null;
}

/**
 * Third tenant-isolation check from spec §5: if the CRM response contains a `pipeContatoId` different from the originating contact, this tenant's URL points to another tenant's CRM instance despite a valid key. Abort without storing an ID.
 */
function conferirDono(no: NoPessoa, contatoId: string, url: string): void {
  if (no.pipeContactId !== contatoId) {
    throw new TwentyError(
      `CRM em ${url} devolveu o contato ${no.pipeContactId ?? 'sem marca'} para o pedido de ${contatoId}: ` +
        'a URL deste tenant provavelmente aponta para a instância de outro cliente.',
      true,
    );
  }
}

export interface FichaNoCrm {
  pessoaId: string;
  name: string;
  email: string | null;
  empresa: string | null;
  link: string;
}

/** Read-only view of what the CRM knows about this customer; Desk does not write there. */
export async function lerFicha(
  config: ConfigTwenty,
  pessoaId: string,
  buscar: typeof fetch = fetch,
): Promise<FichaNoCrm | null> {
  const r = await chamar<{
    person: {
      id: string;
      name: { firstName: string | null; lastName: string | null };
      emails: { primaryEmail: string | null } | null;
      company: { name: string | null } | null;
    } | null;
  }>(
    config,
    '/graphql',
    `query($id: UUID!) {
       person(filter: {id: {eq: $id}}) {
         id name { firstName lastName } emails { primaryEmail } company { name }
       }
     }`,
    { id: pessoaId },
    buscar,
  );
  const p = r.person;
  if (!p) return null;
  return {
    pessoaId: p.id,
    name: [p.name.firstName, p.name.lastName].filter(Boolean).join(' ').trim(),
    email: p.emails?.primaryEmail ?? null,
    empresa: p.company?.name ?? null,
    link: linkDaPessoa(config.url, p.id),
  };
}
