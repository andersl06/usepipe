import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 9).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { cifrar, chaveiroDoAmbiente } = await import('@pipe/db');
const {
  TwentyErro,
  chamar,
  configDoTenant,
  espelharContato,
  linkDaPessoa,
  partirNome,
  partirTelefone,
} = await import('../src/dominio/twenty.js');
const { sincronizarContato } = await import('../src/dominio/espelho-crm.js');
const { noTenant } = await import('../src/banco.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

const CONFIG = { url: 'https://crm.cliente.teste', chave: 'chave-de-teste' };

/** Um `fetch` de mentira que devolve o que o teste mandar e guarda o que recebeu. */
function fetchFalso(respostas: unknown[]): {
  buscar: typeof fetch;
  chamadas: { url: string; corpo: Record<string, unknown> }[];
} {
  const chamadas: { url: string; corpo: Record<string, unknown> }[] = [];
  let i = 0;
  const buscar = (async (url: string, init: RequestInit) => {
    chamadas.push({
      url: String(url),
      corpo: JSON.parse(String(init.body)) as Record<string, unknown>,
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
  it('parte o nome no primeiro espaço', () => {
    expect(partirNome('Maria Clara Souza')).toEqual({
      firstName: 'Maria',
      lastName: 'Clara Souza',
    });
    expect(partirNome('Madonna')).toEqual({ firstName: 'Madonna', lastName: '' });
    expect(partirNome('  Ana  ')).toEqual({ firstName: 'Ana', lastName: '' });
    expect(partirNome(null)).toEqual({ firstName: '', lastName: '' });
  });

  it('parte o telefone brasileiro em número, DDI e país', () => {
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

describe('classificação de falha do CRM', () => {
  it('trata 401 e 403 como permanentes — repetir não conserta chave errada', async () => {
    for (const status of [401, 403]) {
      const buscar = (async () => new Response('', { status })) as unknown as typeof fetch;
      const erro = await chamar(CONFIG, '/graphql', '{ ok }', {}, buscar).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(TwentyErro);
      expect((erro as InstanceType<typeof TwentyErro>).permanente).toBe(true);
    }
  });

  it('trata falha de rede como temporária — o CRM cai e volta', async () => {
    const buscar = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const erro = await chamar(CONFIG, '/graphql', '{ ok }', {}, buscar).catch((e: unknown) => e);
    expect((erro as InstanceType<typeof TwentyErro>).permanente).toBe(false);
  });

  it('nunca deixa a chave de API vazar na mensagem de erro', async () => {
    const buscar = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    const erro = await chamar(CONFIG, '/graphql', '{ ok }', {}, buscar).catch((e: unknown) => e);
    expect(String((erro as Error).message)).not.toContain(CONFIG.chave);
  });
});

describe('espelho do contato, e a defesa contra duplicata', () => {
  const contato = {
    id: '11111111-1111-4111-8111-111111111111',
    nome: 'Maria Souza',
    email: 'maria@exemplo.com.br',
    telefoneE164: '+5511988887777',
    twentyPessoaId: null,
    empresaTwentyId: null,
  };

  it('procura pelo pipeContatoId antes de criar, e adota o órfão que achar', async () => {
    const { buscar, chamadas } = fetchFalso([
      { data: { people: { edges: [{ node: { id: 'orfao-1', pipeContatoId: contato.id } }] } } },
      { data: { updatePerson: { id: 'orfao-1', pipeContatoId: contato.id } } },
    ]);

    const id = await espelharContato(CONFIG, contato, buscar);

    expect(id).toBe('orfao-1');
    // Achou pelo pipeContatoId e ATUALIZOU. Se criasse, viraria duplicata.
    expect(String(chamadas[1]?.corpo['query'])).toContain('updatePerson');
  });

  it('cria quando não existe espelho nenhum', async () => {
    const { buscar, chamadas } = fetchFalso([
      { data: { people: { edges: [] } } },
      { data: { createPerson: { id: 'nova-1', pipeContatoId: contato.id } } },
    ]);

    const id = await espelharContato(CONFIG, contato, buscar);

    expect(id).toBe('nova-1');
    expect(String(chamadas[1]?.corpo['query'])).toContain('createPerson');
  });

  it('aborta se o CRM devolver o contato de OUTRO cliente', async () => {
    // O caso da URL trocada na implantação: chave válida, instância errada.
    const { buscar } = fetchFalso([
      { data: { people: { edges: [] } } },
      { data: { createPerson: { id: 'x', pipeContatoId: 'de-outro-cliente' } } },
    ]);

    const erro = await espelharContato(CONFIG, contato, buscar).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(TwentyErro);
    expect((erro as InstanceType<typeof TwentyErro>).permanente).toBe(true);
    expect(String((erro as Error).message)).toContain('outro cliente');
  });
});

describe('configuração do CRM por tenant — falha fechada', () => {
  let cenario: Cenario;

  beforeAll(async () => {
    cenario = await montarCenario(`twenty-${randomUUID().slice(0, 8)}`);
  });

  afterAll(async () => {
    await cenario.encerrar();
  });

  async function definir(url: string | null, chave: string | null): Promise<void> {
    await cenario.dono.execute(sql`
      update tenant set twenty_url = ${url}, twenty_chave = ${chave} where id = ${cenario.tenantId}
    `);
  }

  it('sem URL, não há CRM — e não existe instância padrão', async () => {
    await definir(null, 'uma-chave');
    const config = await noTenant(cenario.tenantId, (tx) =>
      configDoTenant(tx, cenario.tenantId),
    );
    expect(config).toBeNull();
  });

  it('sem chave, não há CRM', async () => {
    await definir('https://crm.cliente.teste', null);
    const config = await noTenant(cenario.tenantId, (tx) =>
      configDoTenant(tx, cenario.tenantId),
    );
    expect(config).toBeNull();
  });

  it('decifra a chave, e ela não fica em texto puro no banco', async () => {
    const cifrada = cifrar('chave-secreta-do-crm', chaveiroDoAmbiente());
    await definir('https://crm.cliente.teste/', cifrada);

    const { rows } = await cenario.dono.execute<{ twenty_chave: string }>(
      sql`select twenty_chave from tenant where id = ${cenario.tenantId}`,
    );
    expect(rows[0]?.twenty_chave).not.toContain('chave-secreta-do-crm');

    const config = await noTenant(cenario.tenantId, (tx) =>
      configDoTenant(tx, cenario.tenantId),
    );
    expect(config?.chave).toBe('chave-secreta-do-crm');
    // Barra final removida: senão o link viraria `…//object/person/…`.
    expect(config?.url).toBe('https://crm.cliente.teste');
  });

  it('tenant sem CRM não espelha, e não é erro', async () => {
    await definir(null, null);
    const contatoId = await semearContato(cenario);

    const r = await sincronizarContato(cenario.tenantId, contatoId, naoChame);

    expect(r.estado).toBe('sem_espelho');
  });

  it('grava o id devolvido pelo CRM no contato', async () => {
    await definir('https://crm.cliente.teste', cifrar('k', chaveiroDoAmbiente()));
    const contatoId = await semearContato(cenario);

    const { buscar } = fetchFalso([
      { data: { people: { edges: [] } } },
      { data: { createPerson: { id: 'pessoa-nova', pipeContatoId: contatoId } } },
    ]);

    const r = await sincronizarContato(cenario.tenantId, contatoId, buscar);

    expect(r).toEqual({ estado: 'espelhado', pessoaId: 'pessoa-nova' });
    const { rows } = await cenario.dono.execute<{ twenty_pessoa_id: string | null }>(
      sql`select twenty_pessoa_id from contato where id = ${contatoId}`,
    );
    expect(rows[0]?.twenty_pessoa_id).toBe('pessoa-nova');
  });

  it('contato de outro tenant não vira escrita no CRM', async () => {
    await definir('https://crm.cliente.teste', cifrar('k', chaveiroDoAmbiente()));

    // Um id que não existe neste tenant tem o mesmo destino de um de outro cliente:
    // a RLS não devolve linha, e o espelho não acontece.
    const r = await sincronizarContato(cenario.tenantId, randomUUID(), naoChame);

    expect(r.estado).toBe('sem_espelho');
  });
});

/** Um `fetch` que falha o teste se for chamado. Prova que nem tentou falar com o CRM. */
const naoChame = (async () => {
  throw new Error('não deveria ter chamado o CRM');
}) as unknown as typeof fetch;

async function semearContato(cenario: Cenario): Promise<string> {
  const { rows } = await cenario.dono.execute<{ id: string }>(sql`
    insert into contato (tenant_id, nome, telefone_e164)
    values (${cenario.tenantId}, 'Contato de teste', '+5511999990000')
    returning id
  `);
  const id = rows[0]?.id;
  if (!id) throw new Error('a semente não devolveu contato');
  return id;
}
