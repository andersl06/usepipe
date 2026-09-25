import { sql } from 'drizzle-orm';
import { keyringOfAmbiente, decifrar, estaCifrado } from '@pipe/db';
import type { TransactionPipe } from '@pipe/db';

/**
 * O cliente do CRM (Twenty). **A única porta do Pipe para o CRM.**
 *
 * Ver `docs/specs/2026-09-07-integracao-twenty.md`. Três coisas que doem se forem
 * redescobertas por acidente:
 *
 * 1. **O esquema de autenticação NÃO está em `/graphql`, está em `/metadata`.**
 *    `/graphql` serve só os dados do workspace. Apontar o login para `/graphql`
 *    devolve `Cannot query field "getLoginTokenFromCredentials" on type "Mutation"`,
 *    que parece divergência de versão e não é.
 * 2. **Casar por `name`, nunca por `label`.** O workspace está com `x-locale` em
 *    pt-BR e a API devolve rótulo traduzido (`Pessoa`, `Empresa`), mas `nameSingular`
 *    e o `name` dos campos seguem em inglês. Casar por rótulo quebra no dia em que
 *    alguém reescrever uma tradução.
 * 3. **Uma instância por cliente**, e por isso URL e chave vêm do `tenant`, nunca do
 *    ambiente. Não existe instância padrão: sem configuração, a integração não
 *    acontece. Fallback silencioso é como o dado de um cliente vai parar no CRM
 *    de outro.
 */

/** O CRM fora do ar não pode pendurar o worker. */
const TIMEOUT_MS = Number(process.env['PIPE_TWENTY_TIMEOUT_MS'] ?? 8_000);

export interface ConfigTwenty {
  /** Base pública da instância daquele cliente, sem barra final. */
  url: string;
  /** Chave de API já decifrada. **Nunca** vai para log. */
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
 * A configuração do CRM daquele tenant, ou `null` se ele não tem CRM.
 *
 * Roda dentro do `comTenant`: se a RLS não deixar ver a linha do tenant, não há
 * URL nem chave e a integração não acontece. É a primeira das três conferências
 * de isolamento da §5 da spec.
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
  // que `decifrarConfig` faz com o token da Meta. Em produção ela chega cifrada.
  const key = estaCifrado(bruta) ? decifrar(bruta, keyringOfAmbiente()) : bruta;
  return { url: linha.twenty_url.replace(/\/$/, ''), key };
}

interface RespostaGraphql<T> {
  data?: T;
  errors?: { message: string; extensions?: { subCode?: string } }[];
}

/**
 * Uma chamada ao CRM.
 *
 * `caminho` é `/graphql` (dados) ou `/metadata` (auth e metadados) — ver o cabeçalho.
 * `buscar` é injetável pelo mesmo motivo de `packages/autenticacao`: teste não bate
 * na rede.
 *
 * O erro registra a URL e a mensagem, **nunca** o cabeçalho `Authorization`.
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
    // Rede: sempre temporário. O CRM pode ter caído, e cai de volta.
    throw new TwentyError(`CRM inalcançável em ${config.url}: ${(error as Error).message}`);
  }

  if (!resposta.ok) {
    // 401/403 é chave errada ou sem permissão: repetir não conserta.
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
 * O nome do Pipe é campo único; o do Twenty é composto.
 *
 * Quebra no PRIMEIRO espaço: "Maria Clara Souza" vira `Maria` + `Clara Souza`. Nome
 * sem espaço deixa `lastName` vazio, que é o que o Twenty espera de um nome só.
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
 * `+5511988887777` vira `{número, +55, BR}`.
 *
 * Só o Brasil está mapeado, e de propósito: é o único país que o produto atende hoje,
 * e uma tabela de DDI completa seria código morto. Número de fora do +55 entra com o
 * país vazio, que o Twenty aceita — melhor perder a bandeirinha do que perder o
 * telefone.
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

/** O link para a FICHA do cliente no CRM. Nunca a home. */
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
 * Cria ou atualiza a `person` do Twenty correspondente ao contato, e devolve o id dela.
 *
 * O passo do meio — procurar por `pipeContatoId` antes de criar — é o que impede
 * duplicata. Sem ele, o roteiro "cria no CRM, a transação do Pipe falha antes de
 * gravar o id" deixa um registro órfão, e a execução seguinte cria OUTRO. Com ele, a
 * segunda execução acha o órfão e adota.
 */
export async function espelharContact(
  config: ConfigTwenty,
  contact: ContactForEspelhar,
  buscar: typeof fetch = fetch,
): Promise<string> {
  const nome = partirNome(contact.nome);
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
 * A terceira conferência de isolamento da §5 da spec.
 *
 * Se a resposta veio com um `pipeContatoId` que não é o do contato que originou a
 * chamada, a URL daquele tenant aponta para a instância de OUTRO cliente — erro de
 * digitação na implantação, com chave válida. Aborta sem gravar id nenhum.
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

/** O que o CRM sabe daquele cliente. Leitura, e só leitura — o Desk não escreve lá. */
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
    nome: [p.name.firstName, p.name.lastName].filter(Boolean).join(' ').trim(),
    email: p.emails?.primaryEmail ?? null,
    empresa: p.company?.name ?? null,
    link: linkDaPessoa(config.url, p.id),
  };
}
