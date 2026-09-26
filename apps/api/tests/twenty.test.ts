import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 9).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { cifrar, keyringOfEnvironmentkeyringOfAmbientekeyringOfEnvironment } = await import('@pipe/db');
const {
  TwentyError,
  chamar,
  configDoTenant,
  mirrorContactespelharContactmirrorContact,
  linkDaPessoa,
  partirNome,
  partirTelefone,
} = await import('../src/domain/twenty.js');
const { syncContact } = await import('../src/domain/mirror-crm.js');
const { noTenant } = await import('../src/database.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

const CONFIG = { url: 'https://crm.cliente.teste', key: 'chave-de-teste' };

/** A fake `fetch` that returns whatever the test instructs and records what it received. */
function fetchFalso(respostas: unknown[]): {
  buscar: typeof fetch;
  chamadas: { url: string; body: Record<string, unknown> }[];
} {
  const chamadas: { url: string; body: Record<string, unknown> }[] = [];
  let i = 0;
  const buscar = (async (url: string, init: RequestInit) => {
    chamadas.push({
      url: String(url),
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
    });
    const corpo = respostas[i++] ?? { data: {} };
    return new Response(JSON.stringify(corpo), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { buscar, chamadas };
}

describe('conversão de campo entre Pipe e Twenty', () => {
  it('Split a full name at the first space', () => {
    expect(partirNome('Maria Clara Souza')).toEqual({
      firstName: 'Maria',
      lastName: 'Clara Souza',
    });
    expect(partirNome('Madonna')).toEqual({ firstName: 'Madonna', lastName: '' });
    expect(partirNome('  Ana  ')).toEqual({ firstName: 'Ana', lastName: '' });
    expect(partirNome(null)).toEqual({ firstName: '', lastName: '' });
  });

  it('Split Brazilian phone numbers into national number, calling code, and country', () => {
    expect(partirTelefone('+5511988887777')).toEqual({
      primaryPhoneNumber: '11988887777',
      primaryPhoneCallingCode: '+55',
      primaryPhoneCountryCode: 'BR',
    });
  });

  it('aceita telefone de fora do +55 sem país em vez de descartá-lo', () => {
    const fora = partirTelefone('+13125551234');
    expect(fora?.primaryPhoneNumber).toBe('13125551234');
    expect(fora?.primaryPhoneCountryCode).toBe('');
  });

  it('devolve nulo para telefone que não é E.164', () => {
    expect(partirTelefone(null)).toBeNull();
    expect(partirTelefone('11988887777')).toBeNull();
    expect(partirTelefone('+55')).toBeNull();
  });

  it('monta o link para a FICHA, nunca para a home', () => {
    expect(linkDaPessoa('https://crm.teste/', 'abc-123')).toBe(
      'https://crm.teste/object/person/abc-123',
    );
  });
});

describe('Classify permanent and retryable CRM failures', () => {
  it('Classify CRM 401 and 403 responses as permanent failures', async () => {
    for (const status of [401, 403]) {
      const buscar = (async () => new Response('', { status })) as unknown as typeof fetch;
      const erro = await chamar(CONFIG, '/graphql', '{ ok }', {}, buscar).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(TwentyError);
      expect((erro as InstanceType<typeof TwentyError>).permanente).toBe(true);
    }
  });

  it('trata falha de rede como temporária — o CRM cai e volta', async () => {
    const buscar = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const error = await chamar(CONFIG, '/graphql', '{ ok }', {}, buscar).catch((e: unknown) => e);
    expect((error as InstanceType<typeof TwentyError>).permanente).toBe(false);
  });

  it('Never expose the CRM API key in error messages', async () => {
    const buscar = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    const erro = await chamar(CONFIG, '/graphql', '{ ok }', {}, buscar).catch((e: unknown) => e);
    expect(String((erro as Error).message)).not.toContain(CONFIG.key);
  });
});

describe('Mirror contacts to the CRM without creating duplicates', () => {
  const contact = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Maria Souza',
    email: 'maria@exemplo.com.br',
    telefoneE164: '+5511988887777',
    twentyPessoaId: null,
    empresaTwentyId: null,
  };

  it('Find a contact by pipeContatoId before creating it and adopt an orphan match', async () => {
    const { buscar, chamadas } = fetchFalso([
      { data: { people: { edges: [{ node: { id: 'orfao-1', pipeContatoId: contact.id } }] } } },
      { data: { updatePerson: { id: 'orfao-1', pipeContatoId: contact.id } } },
    ]);

    const id = await mirrorContactespelharContactmirrorContact(CONFIG, contact, buscar);

    expect(id).toBe('orfao-1');
    // Achou pelo pipeContatoId e ATUALIZOU. Se criasse, viraria duplicata.
    expect(String(chamadas[1]?.body['query'])).toContain('updatePerson');
  });

  it('Create a CRM contact when no mirror exists', async () => {
    const { buscar, chamadas } = fetchFalso([
      { data: { people: { edges: [] } } },
      { data: { createPerson: { id: 'nova-1', pipeContatoId: contact.id } } },
    ]);

    const id = await mirrorContactespelharContactmirrorContact(CONFIG, contact, buscar);

    expect(id).toBe('nova-1');
    expect(String(chamadas[1]?.body['query'])).toContain('createPerson');
  });

  it('Abort when the CRM returns another tenant\'s contact', async () => {
    // The case of a swapped URL in the deployment: a valid key, but the wrong instance.
    const { buscar } = fetchFalso([
      { data: { people: { edges: [] } } },
      { data: { createPerson: { id: 'x', pipeContatoId: 'de-outro-cliente' } } },
    ]);

    const erro = await mirrorContactespelharContactmirrorContact(CONFIG, contact, buscar).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(TwentyError);
    expect((erro as InstanceType<typeof TwentyError>).permanente).toBe(true);
    expect(String((erro as Error).message)).toContain('outro cliente');
  });
});

describe('Load CRM configuration per tenant with fail-closed behavior', () => {
  let cenario: Cenario;

  beforeAll(async () => {
    cenario = await montarCenario(`twenty-${randomUUID().slice(0, 8)}`);
  });

  afterAll(async () => {
    await cenario.encerrar();
  });

  async function definir(url: string | null, key: string | null): Promise<void> {
    await cenario.dono.execute(sql`
      update tenant set twenty_url = ${url}, twenty_chave = ${key} where id = ${cenario.tenantId}
    `);
  }

  it('sem URL, não há CRM — e não existe instância padrão', async () => {
    await definir(null, 'uma-chave');
    const config = await noTenant(cenario.tenantId, (tx) =>
      configDoTenant(tx, cenario.tenantId),
    );
    expect(config).toBeNull();
  });

  it('Disable CRM integration when no API key is configured', async () => {
    await definir('https://crm.cliente.teste', null);
    const config = await noTenant(cenario.tenantId, (tx) =>
      configDoTenant(tx, cenario.tenantId),
    );
    expect(config).toBeNull();
  });

  it('Decrypt the CRM key while keeping it encrypted in the database', async () => {
    const cifrada = cifrar('chave-secreta-do-crm', keyringOfEnvironmentkeyringOfAmbientekeyringOfEnvironment());
    await definir('https://crm.cliente.teste/', cifrada);

    const { rows } = await cenario.dono.execute<{ twenty_chave: string }>(
      sql`select twenty_chave from tenant where id = ${cenario.tenantId}`,
    );
    expect(rows[0]?.twenty_chave).not.toContain('chave-secreta-do-crm');

    const config = await noTenant(cenario.tenantId, (tx) =>
      configDoTenant(tx, cenario.tenantId),
    );
    expect(config?.key).toBe('chave-secreta-do-crm');
    // The trailing slash is removed: otherwise the link would become `…//object/person/…`.
    expect(config?.url).toBe('https://crm.cliente.teste');
  });

  it('Skip contact mirroring for tenants without CRM', async () => {
    await definir(null, null);
    const contactId = await seedContact(cenario);

    const r = await syncContact(cenario.tenantId, contactId, naoChame);

    expect(r.state).toBe('without_mirror');
  });

  it('Store the CRM-returned ID on the contact', async () => {
    await definir('https://crm.cliente.teste', cifrar('k', keyringOfEnvironmentkeyringOfAmbientekeyringOfEnvironment()));
    const contatoId = await seedContact(cenario);

    const { buscar } = fetchFalso([
      { data: { people: { edges: [] } } },
      { data: { createPerson: { id: 'pessoa-nova', pipeContatoId: contatoId } } },
    ]);

    const r = await syncContact(cenario.tenantId, contatoId, buscar);

    expect(r).toEqual({ state: 'espelhado', pessoaId: 'pessoa-nova' });
    const { rows } = await cenario.dono.execute<{ twenty_pessoa_id: string | null }>(
      sql`select twenty_pessoa_id from contato where id = ${contatoId}`,
    );
    expect(rows[0]?.twenty_pessoa_id).toBe('pessoa-nova');
  });

  it('Do not write another tenant\'s contact to the CRM', async () => {
    await definir('https://crm.cliente.teste', cifrar('k', keyringOfEnvironmentkeyringOfAmbientekeyringOfEnvironment()));

    // An id that does not exist in this tenant has the same outcome as one from another customer:
    // RLS returns no row, and the mirror does not happen.
    const r = await syncContact(cenario.tenantId, randomUUID(), naoChame);

    expect(r.state).toBe('without_mirror');
  });
});

/** A `fetch` that fails the test if called. Proves it never even tried to talk to the CRM. */
const naoChame = (async () => {
  throw new Error('não deveria ter chamado o CRM');
}) as unknown as typeof fetch;

async function seedContact(cenario: Cenario): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${cenario.tenantId}, 'Contato de teste', '+5511999990000')
    returning id
  `);
  const id = rows[0]?.id;
  if (!id) throw new Error('a semente não devolveu contato');
  return id;
}
