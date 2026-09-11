import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_CHAVES_SEGREDO'] ??= `teste:${Buffer.alloc(32, 9).toString('base64')}`;
process.env['PIPE_CHAVE_SEGREDO_ATUAL'] ??= 'teste';

const { cifrar, chaveiroDoAmbiente } = await import('@pipe/db');
const { NOME_DO_COOKIE, criarToken } = await import('@pipe/autenticacao');
const { lerDicionario, lerMetadados, sincronizarDicionario } = await import(
  '../src/dominio/dicionario-crm.js'
);
const { noTenant } = await import('../src/banco.js');
const { subirApi } = await import('../src/servidor.js');
const { montarCenario } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;

/**
 * Resposta REAL da Metadata API, gravada do Twenty 2.39 local e enxugada — ver `_origem`
 * dentro do arquivo. As variações abaixo (campo removido, versão antiga) partem dela.
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

const CONFIG = { url: 'https://crm.cliente.teste', chave: 'chave-de-teste' };

function copia<T>(x: T): T {
  return structuredClone(x);
}

/** As respostas, na ordem em que o cliente as pede: introspecção, workspace, páginas. */
function respostas(f: Fixture = FIXTURE): unknown[] {
  return [f.introspeccao, f.workspace, ...f.paginas];
}

/** A mesma fixture, sem um campo e sem um objeto — o que "sumiu" do CRM. */
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
  chamadas: { url: string; corpo: { query: string; variables: Record<string, unknown> } }[];
} {
  const chamadas: { url: string; corpo: { query: string; variables: Record<string, unknown> } }[] =
    [];
  let i = 0;
  const buscar = (async (url: string, init: RequestInit) => {
    chamadas.push({ url: String(url), corpo: JSON.parse(String(init.body)) });
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
  it('lê pela /metadata, pagina até o fim e traz os campos de cada objeto', async () => {
    const { buscar, chamadas } = fetchFalso(respostas());

    const meta = await lerMetadados(CONFIG, buscar);

    expect(chamadas.every((c) => c.url === `${CONFIG.url}/metadata`)).toBe(true);
    expect(meta.objetos.map((o) => o.nameSingular)).toEqual([
      'person',
      'company',
      'opportunity',
      'messageCampaign',
    ]);
    // A segunda página foi pedida com o cursor que a primeira devolveu.
    expect(chamadas[3]?.corpo.variables['depois']).toBe('cursor-da-pagina-2');
    expect(meta.customApplicationId).toBe(APP_DO_CLIENTE);
    expect(meta.objetos[0]?.fields.map((c) => c.name)).toContain('pipeContatoId');
  });

  it('na 2.12+ pede applicationId e NÃO isCustom — pedir campo que não existe derruba a query', async () => {
    const { buscar, chamadas } = fetchFalso(respostas());
    await lerMetadados(CONFIG, buscar);
    const query = chamadas[2]!.corpo.query;
    expect(query).toContain('applicationId');
    expect(query).not.toContain('isCustom');
    expect(query).toContain('relation {');
  });

  it('antes da 2.12 pede isCustom e dispensa o workspace', async () => {
    // Variante sintética da gravação: troca applicationId por isCustom, como era o schema
    // antigo. Não há instância antiga no ar para gravar de verdade.
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
    expect(chamadas[1]!.corpo.query).toContain('isCustom');
    expect(meta.customApplicationId).toBeNull();
    const pessoa = meta.objetos.find((o) => o.nameSingular === 'person');
    expect(pessoa?.fields.find((c) => c.name === 'pipeContatoId')?.isCustom).toBe(true);
  });
});

describe('sincronização do dicionário, no banco', () => {
  let a: Cenario;
  let b: Cenario;

  beforeAll(async () => {
    a = await montarCenario(`dic-a-${randomUUID().slice(0, 8)}`);
    b = await montarCenario(`dic-b-${randomUUID().slice(0, 8)}`);
    for (const c of [a, b]) {
      await c.dono.execute(sql`
        update tenant set twenty_url = ${`https://crm-${c.tenantId.slice(0, 8)}.teste`},
                          twenty_chave = ${cifrar('k', chaveiroDoAmbiente())}
         where id = ${c.tenantId}
      `);
    }
  });

  afterAll(async () => {
    await a.encerrar();
    await b.encerrar();
  });

  const ler = (c: Cenario) => noTenant(c.tenantId, lerDicionario);
  const campo = async (c: Cenario, objeto: string, nome: string) =>
    (await ler(c)).find((o) => o.codigo === objeto)?.campos.find((x) => x.codigo === nome);

  it('grava objetos e campos no formato do Twenty, casando por name', async () => {
    const r = await sincronizarDicionario(a.tenantId, fetchFalso(respostas()).buscar);

    expect(r).toMatchObject({
      estado: 'sincronizado',
      objetos: 4,
      doCliente: { objetos: 0, campos: 2 },
      removidos: { objetos: 0, campos: 0 },
    });

    const pessoa = (await ler(a)).find((o) => o.codigo === 'person');
    // Rótulo traduzido fica só no rótulo; o código é o nameSingular em inglês.
    expect(pessoa?.rotulo).toBe('Pessoa');
    expect(pessoa?.namePlural).toBe('people');

    const contatoId = await campo(a, 'person', 'pipeContatoId');
    expect(contatoId).toMatchObject({ tipo: 'TEXT', isCustom: true, agregavel: false });
    expect((await campo(a, 'person', 'name'))?.isCustom).toBe(false);

    // Relação no formato da API, com a cardinalidade.
    expect((await campo(a, 'person', 'company'))?.relation).toMatchObject({
      type: 'MANY_TO_ONE',
      targetObjectMetadata: { nameSingular: 'company' },
    });
    expect((await campo(a, 'company', 'people'))?.relation).toMatchObject({
      type: 'ONE_TO_MANY',
      targetObjectMetadata: { nameSingular: 'person' },
    });

    // Opções do SELECT exatamente como vieram.
    const gravado = FIXTURE.paginas[1]!.data.objects.edges[0]!.node.fieldsList.find(
      (c) => c.name === 'stage',
    );
    expect(gravado?.options).toBeInstanceOf(Array);
    expect((await campo(a, 'opportunity', 'stage'))?.options).toEqual(gravado?.options);
  });

  it('marca agregável só número e moeda, e tira o vetor de busca da consulta', async () => {
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
    await sincronizarDicionario(a.tenantId, fetchFalso(respostas()).buscar);
    expect(await contar(a)).toEqual(antes);
  });

  it('o que sumiu do CRM fica inativo e marcado — nunca apagado', async () => {
    // Declarado à mão pelo CRM caseiro: não veio do Twenty, a sincronização não toca.
    await a.dono.execute(sql`
      insert into dicionario_campo (tenant_id, objeto_codigo, codigo, rotulo, tipo)
      values (${a.tenantId}, 'lead', 'origem', 'Origem', 'texto')
    `);
    const antes = await contar(a);

    const r = await sincronizarDicionario(
      a.tenantId,
      fetchFalso(respostas(semAlgo('opportunity', ['person', 'pipeContatoId']))).buscar,
    );

    const camposDaOportunidade = FIXTURE.paginas[1]!.data.objects.edges[0]!.node.fieldsList.length;
    expect(r).toMatchObject({ removidos: { objetos: 1, campos: 1 + camposDaOportunidade } });
    expect(await contar(a)).toEqual(antes);

    const removido = await campo(a, 'person', 'pipeContatoId');
    expect(removido?.isActive).toBe(false);
    expect(removido?.excluidoEm).not.toBeNull();
    const oportunidade = (await ler(a)).find((o) => o.codigo === 'opportunity');
    expect(oportunidade).toMatchObject({ isActive: false });
    expect(oportunidade?.excluidoEm).not.toBeNull();
    expect(await origemDoLead(a)).toEqual({ excluido_em: null });
  });

  it('o que volta ao CRM volta ativo', async () => {
    await sincronizarDicionario(a.tenantId, fetchFalso(respostas()).buscar);
    const devolvido = await campo(a, 'person', 'pipeContatoId');
    expect(devolvido).toMatchObject({ isActive: true, excluidoEm: null });
  });

  it('isola os tenants: a sincronização de um não aparece, nem muda, no outro', async () => {
    expect(await ler(b)).toEqual([]);

    await sincronizarDicionario(b.tenantId, fetchFalso(respostas()).buscar);
    await sincronizarDicionario(
      a.tenantId,
      fetchFalso(respostas(semAlgo('opportunity', ['person', 'pipeContatoId']))).buscar,
    );

    expect((await campo(b, 'person', 'pipeContatoId'))).toMatchObject({
      isActive: true,
      excluidoEm: null,
    });
    expect((await campo(a, 'person', 'pipeContatoId'))?.isActive).toBe(false);
    // Nenhuma linha de B tem tenant de A, nem o contrário.
    expect((await ler(b)).map((o) => o.codigo).sort()).toEqual([
      'company',
      'messageCampaign',
      'opportunity',
      'person',
    ]);
  });

  it('tenant sem CRM é pulado sem chamar ninguém, e não é erro', async () => {
    const c = await montarCenario(`dic-c-${randomUUID().slice(0, 8)}`);
    try {
      expect(await sincronizarDicionario(c.tenantId, naoChame)).toEqual({ estado: 'sem_crm' });
    } finally {
      await c.encerrar();
    }
  });

  it('CRM que devolve zero objetos não apaga o dicionário', async () => {
    const vazio = copia(FIXTURE);
    vazio.paginas = [
      { data: { objects: { pageInfo: { hasNextPage: false, endCursor: null }, edges: [] } } },
    ];
    const erro = await sincronizarDicionario(b.tenantId, fetchFalso(respostas(vazio)).buscar).catch(
      (e: unknown) => e,
    );
    expect(String((erro as Error).message)).toContain('zero objetos');
    expect((await campo(b, 'person', 'name'))?.excluidoEm).toBeNull();
  });

  it('GET /v1/crm/dicionario exige sessão e devolve só o dicionário do tenant dela', async () => {
    const api = await subirApi(0);
    try {
      const semSessao = await fetch(`${api.url}/v1/crm/dicionario`);
      expect(semSessao.status).toBe(401);

      const novo = criarToken();
      await a.dono.execute(sql`
        insert into sessao (tenant_id, usuario_id, token_hash, expira_em, origem)
        values (${a.tenantId}, ${a.atendenteId}, ${novo.hash}, ${novo.expiraEm}, 'google')
      `);
      const r = await fetch(`${api.url}/v1/crm/dicionario`, {
        headers: { cookie: `${NOME_DO_COOKIE}=${novo.token}` },
      });
      expect(r.status).toBe(200);
      const corpo = (await r.json()) as {
        objetos: { codigo: string; campos: { codigo: string; isActive: boolean }[] }[];
      };
      // O de A: o pipeContatoId está removido lá, e ativo em B.
      const pessoa = corpo.objetos.find((o) => o.codigo === 'person');
      expect(pessoa?.campos.find((c) => c.codigo === 'pipeContatoId')?.isActive).toBe(false);
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

/** A linha do CRM caseiro, lida crua: ela não tem objeto em `dicionario_objeto`. */
async function origemDoLead(c: Cenario): Promise<{ excluido_em: Date | null } | undefined> {
  const { rows } = await c.dono.execute<{ excluido_em: Date | null }>(sql`
    select excluido_em from dicionario_campo
     where tenant_id = ${c.tenantId} and objeto_codigo = 'lead' and codigo = 'origem'
  `);
  return rows[0];
}
