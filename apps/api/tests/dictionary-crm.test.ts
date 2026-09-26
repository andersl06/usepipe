import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 9).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { cifrar, keyringOfEnvironment } = await import('@pipe/db');
const { createToken } = await import('@pipe/authentication');
const { SESSION_COOKIE_NAME: NOME_DO_COOKIE } = await import('../src/session.js');
const { readDictionary, lerMetadados, syncDictionary } = await import(
  '../src/domain/dictionary-crm.js'
);
const { noTenant } = await import('../src/database.js');
const { upApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

/**
 * A REAL response from the Metadata API, captured from a local Twenty 2.39 and trimmed down — see `_origem` inside the file. The variations below (removed field, old version) branch from it.
 */
interface Fixture {
  introspeccao: { data: { o: { fields: { name: string }[] }; f: { fields: { name: string }[] } } };
  workspace: unknown;
  paginas: {
    data: { objects: { pageInfo: unknown; edges: { node: NoGravado }[] } };
  }[];
}
interface NoGravado {
  nameSingular: string;
  applicationId?: string;
  isCustom?: boolean;
  fieldsList: { name: string; applicationId?: string; isCustom?: boolean; options?: unknown }[];
}

const FIXTURE = JSON.parse(
  readFileSync(new URL('./fixtures/twenty-metadados-2.39.json', import.meta.url), 'utf8'),
) as Fixture;
const APP_DO_CLIENTE = (FIXTURE.workspace as {
  data: { currentWorkspace: { workspaceCustomApplicationId: string } };
}).data.currentWorkspace.workspaceCustomApplicationId;

const CONFIG = { url: 'https://crm.cliente.teste', key: 'chave-de-teste' };

function copia<T>(x: T): T {
  return structuredClone(x);
}

/** The responses, in the order the client asks for them: introspeccao, workspace, pages. */
function respostas(f: Fixture = FIXTURE): unknown[] {
  return [f.introspeccao, f.workspace, ...f.paginas];
}

/** The same fixture, missing a field and an object — what "went missing" from the CRM. */
function semAlgo(objetoRemovido: string, campoRemovido: [string, string]): Fixture {
  const f = copia(FIXTURE);
  for (const p of f.paginas) {
    p.data.objects.edges = p.data.objects.edges.filter((e) => e.node.nameSingular !== objetoRemovido);
    for (const { node } of p.data.objects.edges) {
      if (node.nameSingular === campoRemovido[0]) {
        node.fieldsList = node.fieldsList.filter((c) => c.name !== campoRemovido[1]);
      }
    }
  }
  return f;
}

function fetchFalso(lista: unknown[]): {
  buscar: typeof fetch;
  chamadas: { url: string; body: { query: string; variables: Record<string, unknown> } }[];
} {
  const chamadas: { url: string; body: { query: string; variables: Record<string, unknown> } }[] =
    [];
  let i = 0;
  const buscar = (async (url: string, init: RequestInit) => {
    chamadas.push({ url: String(url), body: JSON.parse(String(init.body)) });
    const corpo = lista[i++];
    if (!corpo) throw new Error(`chamada ${i} não prevista pelo teste`);
    return new Response(JSON.stringify(corpo), { status: 200 });
  }) as unknown as typeof fetch;
  return { buscar, chamadas };
}

const naoChame = (async () => {
  throw new Error('não deveria ter chamado o CRM');
}) as unknown as typeof fetch;

describe('cliente da Metadata API, contra a resposta gravada do Twenty 2.39', () => {
  it('Read `/metadata` through every page and fetch each object\'s fields', async () => {
    const { buscar, chamadas } = fetchFalso(respostas());

    const meta = await lerMetadados(CONFIG, buscar);

    expect(chamadas.every((c) => c.url === `${CONFIG.url}/metadata`)).toBe(true);
    expect(meta.objetos.map((o) => o.nameSingular)).toEqual([
      'person',
      'company',
      'opportunity',
      'messageCampaign',
    ]);
    // // The second page was requested with the cursor the first one returned.
    expect(chamadas[3]?.body.variables['depois']).toBe('cursor-da-pagina-2');
    expect(meta.customApplicationId).toBe(APP_DO_CLIENTE);
    expect(meta.objetos[0]?.fields.map((c) => c.name)).toContain('pipeContatoId');
  });

  it('na 2.12+ pede applicationId e NÃO isCustom — pedir campo que não existe derruba a query', async () => {
    const { buscar, chamadas } = fetchFalso(respostas());
    await lerMetadados(CONFIG, buscar);
    const query = chamadas[2]!.body.query;
    expect(query).toContain('applicationId');
    expect(query).not.toContain('isCustom');
    expect(query).toContain('relation {');
  });

  it('antes da 2.12 pede isCustom e dispensa o workspace', async () => {
    // // A synthetic variant of the write: swaps applicationId for isCustom, as the old schema was.
    // // There's no old instance running to write against for real.
    const f = copia(FIXTURE);
    for (const t of [f.introspeccao.data.o, f.introspeccao.data.f]) {
      t.fields = t.fields.map((c) => (c.name === 'applicationId' ? { name: 'isCustom' } : c));
    }
    for (const p of f.paginas) {
      for (const { node } of p.data.objects.edges) {
        node.isCustom = node.applicationId === APP_DO_CLIENTE;
        delete node.applicationId;
        for (const c of node.fieldsList) {
          c.isCustom = c.applicationId === APP_DO_CLIENTE;
          delete c.applicationId;
        }
      }
    }
    const { buscar, chamadas } = fetchFalso([f.introspeccao, ...f.paginas]);

    const meta = await lerMetadados(CONFIG, buscar);

    expect(chamadas).toHaveLength(3);
    expect(chamadas[1]!.body.query).toContain('isCustom');
    expect(meta.customApplicationId).toBeNull();
    const pessoa = meta.objetos.find((o) => o.nameSingular === 'person');
    expect(pessoa?.fields.find((c) => c.name === 'pipeContatoId')?.isCustom).toBe(true);
  });
});

describe('Synchronize the CRM dictionary in the database', () => {
  let a: Cenario;
  let b: Cenario;

  beforeAll(async () => {
    a = await montarCenario(`dic-a-${randomUUID().slice(0, 8)}`);
    b = await montarCenario(`dic-b-${randomUUID().slice(0, 8)}`);
    for (const c of [a, b]) {
      await c.dono.execute(sql`
        update tenant set twenty_url = ${`https://crm-${c.tenantId.slice(0, 8)}.teste`},
                          twenty_chave = ${cifrar('k', keyringOfEnvironment())}
         where id = ${c.tenantId}
      `);
    }
  });

  afterAll(async () => {
    await a.encerrar();
    await b.encerrar();
  });

  const ler = (c: Cenario) => noTenant(c.tenantId, readDictionary);
  const campo = async (c: Cenario, objeto: string, nome: string) =>
    (await ler(c)).find((o) => o.codigo === objeto)?.campos.find((x) => x.codigo === nome);

  it('Store Twenty objects and fields matched by name', async () => {
    const r = await syncDictionary(a.tenantId, fetchFalso(respostas()).buscar);

    expect(r).toMatchObject({
      state: 'sincronizado',
      objetos: 4,
      doCliente: { objetos: 0, campos: 2 },
      removidos: { objetos: 0, campos: 0 },
    });

    const pessoa = (await ler(a)).find((o) => o.codigo === 'person');
    // // A translated label stays only in the label; the code is the English `nameSingular`.
    expect(pessoa?.rotulo).toBe('Pessoa');
    expect(pessoa?.namePlural).toBe('people');

    const contactId = await campo(a, 'person', 'pipeContatoId');
    expect(contactId).toMatchObject({ tipo: 'TEXT', isCustom: true, agregavel: false });
    expect((await campo(a, 'person', 'name'))?.isCustom).toBe(false);

    // // A relation in the API's format, with the cardinality.
    expect((await campo(a, 'person', 'company'))?.relation).toMatchObject({
      type: 'MANY_TO_ONE',
      targetObjectMetadata: { nameSingular: 'company' },
    });
    expect((await campo(a, 'company', 'people'))?.relation).toMatchObject({
      type: 'ONE_TO_MANY',
      targetObjectMetadata: { nameSingular: 'person' },
    });

    // // SELECT options exactly as they came.
    const gravado = FIXTURE.paginas[1]!.data.objects.edges[0]!.node.fieldsList.find(
      (c) => c.name === 'stage',
    );
    expect(gravado?.options).toBeInstanceOf(Array);
    expect((await campo(a, 'opportunity', 'stage'))?.options).toEqual(gravado?.options);
  });

  it('Mark only number and currency fields as aggregatable and exclude search vectors from queries', async () => {
    expect(await campo(a, 'messageCampaign', 'sentCount')).toMatchObject({
      tipo: 'NUMBER',
      agregavel: true,
    });
    expect((await campo(a, 'opportunity', 'amount'))).toMatchObject({
      tipo: 'CURRENCY',
      agregavel: true,
    });
    expect((await campo(a, 'company', 'name'))).toMatchObject({ tipo: 'TEXT', agregavel: false });
    expect((await campo(a, 'person', 'searchVector'))?.consultavel).toBe(false);
  });

  it('sincronizar de novo não duplica nada', async () => {
    const antes = await contar(a);
    await syncDictionary(a.tenantId, fetchFalso(respostas()).buscar);
    expect(await contar(a)).toEqual(antes);
  });

  it('o que sumiu do CRM fica inativo e marcado — nunca apagado', async () => {
    // // Declared by hand for the in-house CRM: it didn't come from Twenty, the sync doesn't touch it.
    await a.dono.execute(sql`
      insert into dicionario_campo (tenant_id, objeto_codigo, codigo, rotulo, tipo)
      values (${a.tenantId}, 'lead', 'origem', 'Origem', 'texto')
    `);
    const antes = await contar(a);

    const r = await syncDictionary(
      a.tenantId,
      fetchFalso(respostas(semAlgo('opportunity', ['person', 'pipeContatoId']))).buscar,
    );

    const fieldsOfOpportunity = FIXTURE.paginas[1]!.data.objects.edges[0]!.node.fieldsList.length;
    expect(r).toMatchObject({ removidos: { objetos: 1, campos: 1 + fieldsOfOpportunity } });
    expect(await contar(a)).toEqual(antes);

    const removido = await campo(a, 'person', 'pipeContatoId');
    expect(removido?.isActive).toBe(false);
    expect(removido?.excluidoEm).not.toBeNull();
    const opportunity = (await ler(a)).find((o) => o.codigo === 'opportunity');
    expect(opportunity).toMatchObject({ isActive: false });
    expect(opportunity?.excluidoEm).not.toBeNull();
    expect(await origemDoLead(a)).toEqual({ excluido_em: null });
  });

  it('o que volta ao CRM volta ativo', async () => {
    await syncDictionary(a.tenantId, fetchFalso(respostas()).buscar);
    const devolvido = await campo(a, 'person', 'pipeContatoId');
    expect(devolvido).toMatchObject({ isActive: true, excluidoEm: null });
  });

  it('Keep each tenant\'s CRM dictionary independent during synchronization', async () => {
    expect(await ler(b)).toEqual([]);

    await syncDictionary(b.tenantId, fetchFalso(respostas()).buscar);
    await syncDictionary(
      a.tenantId,
      fetchFalso(respostas(semAlgo('opportunity', ['person', 'pipeContatoId']))).buscar,
    );

    expect((await campo(b, 'person', 'pipeContatoId'))).toMatchObject({
      isActive: true,
      excluidoEm: null,
    });
    expect((await campo(a, 'person', 'pipeContatoId'))?.isActive).toBe(false);
    // // No row of B has A's tenant, or the other way around.
    expect((await ler(b)).map((o) => o.codigo).sort()).toEqual([
      'company',
      'messageCampaign',
      'opportunity',
      'person',
    ]);
  });

  it('Skip tenants without a CRM without calling the provider or failing', async () => {
    const c = await montarCenario(`dic-c-${randomUUID().slice(0, 8)}`);
    try {
      expect(await syncDictionary(c.tenantId, naoChame)).toEqual({ state: 'sem_crm' });
    } finally {
      await c.encerrar();
    }
  });

  it('Preserve the dictionary when the CRM returns no objects', async () => {
    const empty = copia(FIXTURE);
    empty.paginas = [
      { data: { objects: { pageInfo: { hasNextPage: false, endCursor: null }, edges: [] } } },
    ];
    const error = await syncDictionary(b.tenantId, fetchFalso(respostas(empty)).buscar).catch(
      (e: unknown) => e,
    );
    expect(String((error as Error).message)).toContain('zero objetos');
    expect((await campo(b, 'person', 'name'))?.excluidoEm).toBeNull();
  });

  it('Require a session for GET /v1/crm/dictionary and return only that tenant\'s dictionary', async () => {
    const api = await upApi(0);
    try {
      const withoutSession = await fetch(`${api.url}/v1/crm/dictionary`);
      expect(withoutSession.status).toBe(401);

      const novo = createToken();
      await a.dono.execute(sql`
        insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
        values (${a.tenantId}, ${a.agentId}, ${novo.hash}, ${novo.expiraEm}, 'google')
      `);
      const r = await fetch(`${api.url}/v1/crm/dictionary`, {
        headers: { cookie: `${NOME_DO_COOKIE}=${novo.token}` },
      });
      expect(r.status).toBe(200);
      const corpo = (await r.json()) as {
        objetos: { code: string; campos: { code: string; isActive: boolean }[] }[];
      };
      // // A's: the pipeContatoId is removed there, and active in B.
      const pessoa = corpo.objetos.find((o) => o.code === 'person');
      expect(pessoa?.campos.find((c) => c.code === 'pipeContatoId')?.isActive).toBe(false);
      expect(JSON.stringify(corpo)).not.toContain(b.tenantId);
    } finally {
      await api.fechar();
    }
  });
});

async function contar(c: Cenario): Promise<{ objetos: number; campos: number }> {
  const { rows } = await c.dono.execute<{ objetos: number; campos: number }>(sql`
    select (select count(*)::int from dicionario_objeto where tenant_id = ${c.tenantId}) as objetos,
           (select count(*)::int from dicionario_campo where tenant_id = ${c.tenantId}) as campos
  `);
  return rows[0]!;
}

/** The in-house CRM's row, read raw: it has no object in `dicionario_objeto`. */
async function origemDoLead(c: Cenario): Promise<{ excluido_em: Date | null } | undefined> {
  const { rows } = await c.dono.execute<{ excluido_em: Date | null }>(sql`
    select excluido_em from dicionario_campo
     where tenant_id = ${c.tenantId} and objeto_codigo = 'lead' and codigo = 'origem'
  `);
  return rows[0];
}
