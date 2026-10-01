import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';

// O modo tem que ser decidido antes de qualquer import que leia a variável.
process.env['PIPE_FILAS'] = 'memoria';
process.env['PIPE_WHATSAPP_CLIENTE'] = 'duble';
// Sem varredura automática: a retomada deste teste é sempre manual, chamando
// `executarProcessHttp` direto — reproduz o caminho de produção (BullMQ) sem
// depender de timer nem de fire-and-forget sem `.catch` (ver diagnóstico).
process.env['PIPE_PROCESS_HTTP_EM_MEMORIA'] = '1';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['DATABASE_URL_APP'] ??= 'postgres://pipe_app:pipe_app@localhost:5433/pipe';
process.env['PIPE_COOKIE_SEGURO'] = 'false';
process.env['PIPE_COOKIE_DOMINIO'] = '';

const { upApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/database.js');
const { importFlowOfBlip, executarProcessHttp, recoverStuckProcessHttp } = await import(
  '../src/domain/flow.js'
);
const { adotarFilas, assinar, montarCenario, payloadOfMessage } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * Regressão do bug diagnosticado em `.planning/debug/process-http-auto-resume.md`:
 * a retomada de um bloco `ProcessHttp` suspenso grava de novo o mesmo
 * `entrada->>'id_provedor'` da suspensão, violando `execucao_passo_entrada_uk`
 * (índice único parcial, migration 0014) e derrubando a transação inteira — a
 * execução fica presa em `process_http_execucao.estado = 'chamando'` para
 * sempre, e `rodarFluxoNaEntrada` passa a bloquear toda mensagem nova do mesmo
 * contato.
 *
 * O `ProcessHttp` entra em `$leavingCustomActions` de `boas-vindas` (não em
 * `$enteringCustomActions`, como o gerador de fixtures da 01-34 usa): é o
 * único ponto que o motor (`gerenciador.ts`) sabe retomar de verdade — o
 * `cursor` só casa de novo quando o estado é recarregado como `corrente` e
 * suas `outputActions` rodam (ver `gerenciador.teste.ts`, "suspende antes do
 * ProcessHttp e retoma depois da ação"); `$enteringCustomActions` só roda uma
 * vez, na transição de entrada, e nunca mais casa com o cursor numa retomada.
 * A chamada HTTP é interceptada (sem rede) e a retomada é chamada de
 * propósito, para provar o caminho de ponta a ponta.
 */

const FIXTURE: Record<string, unknown> = JSON.parse(
  readFileSync(
    new URL('../../../packages/core/src/flow/fixtures/editor-sintetico.json', import.meta.url),
    'utf8',
  ),
);

function fluxoComProcessHttp(): unknown {
  const clone = JSON.parse(JSON.stringify(FIXTURE)) as {
    flow: Record<string, { $leavingCustomActions: unknown[] }>;
  };
  clone.flow['boas-vindas']!.$leavingCustomActions.push({
    $id: 'ph1',
    type: 'ProcessHttp',
    settings: {
      method: 'POST',
      uri: 'https://example.com/pipe/process-http-retomada-teste',
      headers: {},
      body: { origem: 'process-http-retomada.test' },
      requestTimeout: 5,
      responseStatusVariable: 'status_http',
      responseBodyVariable: 'corpo_http',
    },
    conditions: [],
  });
  return clone;
}

const CONTATO = '5511933330001';

let cenario: Cenario;
let api: ApiNoAr;

beforeAll(async () => {
  cenario = await montarCenario(`process-http-retomada-${randomUUID().slice(0, 8)}`);
  api = await upApi(0);
  const r = await noTenant(cenario.tenantId, (tx) =>
    importFlowOfBlip(tx, {
      tenantId: cenario.tenantId,
      name: 'Retomada de ProcessHttp',
      channelId: cenario.channelId,
      json: fluxoComProcessHttp(),
      publicar: true,
    }),
  );
  expect(r.errorOfValidation).toBeNull();
  await adotarFilas(cenario, r.flowId);
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await cenario?.encerrar();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function falar(texto: string, id?: string, contato: string = CONTATO): Promise<void> {
  const corpo = JSON.stringify(payloadOfMessage(contato, texto, id ? { id } : {}));
  const resposta = await fetch(`${api.url}/webhooks/whatsapp/${cenario.channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': assinar(corpo) },
    body: corpo,
  });
  expect(resposta.status).toBe(200);
}

type ProcessoHttp = {
  id: string;
  estado: string;
  entrada: { id_provedor?: string };
  resposta: { status: number; corpo: string } | null;
  atualizado_em: string;
};

async function processoDoContato(contato: string = CONTATO): Promise<ProcessoHttp> {
  const { rows } = await cenario.dono.execute<ProcessoHttp>(sql`
    select p.id, p.estado, p.entrada, p.resposta, p.atualizado_em from process_http_execucao p
      join execucao_fluxo e on e.id = p.execucao_id
      join conversa c on c.id = e.conversa_id
      join contato ct on ct.id = c.contato_id
     where p.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${contato}`}
     order by p.criado_em desc limit 1
  `);
  expect(rows[0]).toBeDefined();
  return rows[0]!;
}

async function doBot(contato: string = CONTATO): Promise<string[]> {
  const { rows } = await cenario.dono.execute<{ conteudo: string }>(sql`
    select m.conteudo from mensagem m
      join conversa c on c.id = m.conversa_id
      join contato ct on ct.id = c.contato_id
     where c.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${contato}`}
       and m.autor_tipo = 'bot'
     order by m.criada_em
  `);
  return rows.map((r) => r.conteudo);
}

/** Ages a process_http_execucao row directly by SQL, simulating a call a crash left stuck in `chamando` past a sweep's timeout. */
async function envelhecerProcesso(id: string, estado: string, ha: string): Promise<void> {
  await cenario.dono.execute(sql`
    update process_http_execucao set estado = ${estado}, atualizado_em = now() - ${ha}::interval
     where id = ${id}::uuid
  `);
}

async function contagemDeMensagensComId(idProvedor: string): Promise<number> {
  const { rows } = await cenario.dono.execute<{ n: string }>(sql`
    select count(*)::text as n from mensagem where tenant_id = ${cenario.tenantId}::uuid and id_provedor = ${idProvedor}
  `);
  return Number(rows[0]?.n ?? 0);
}

/** Intercepta só a chamada de saída do ProcessHttp; deixa passar a chamada ao próprio `api.url`. */
function stubarHttpDeSaida(): void {
  const fetchDeVerdade = fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith(api.url)) return fetchDeVerdade(url, init);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}

describe('retomada de ProcessHttp', () => {
  it('suspende, retoma sem duplicate key, e a próxima mensagem do contato não fica travada', async () => {
    // "oi" entra em boas-vindas normalmente (sem ProcessHttp na entrada) e manda
    // a saudação — ainda não há nada para suspender.
    await falar('oi');
    expect(await doBot()).toEqual(['Olá! Qual é o seu nome?']);

    // "Ana" responde a `nome`; ao SAIR de boas-vindas o ProcessHttp roda e suspende.
    const msgAna = `wamid.PH.${randomUUID()}`;
    await falar('Ana', msgAna);

    const suspenso = await processoDoContato();
    expect(suspenso.estado).toBe('pendente');
    expect(suspenso.entrada.id_provedor).toBe(msgAna);

    stubarHttpDeSaida();

    // (a) a retomada completa sem erro — hoje derruba com duplicate key em
    // `execucao_passo_entrada_uk`, porque `rodar()` grava de novo o mesmo
    // `id_provedor` da suspensão (fluxo.ts ~484-519).
    await expect(executarProcessHttp(suspenso.id)).resolves.toBeDefined();

    // (b) process_http_execucao termina 'retomada', com a resposta guardada —
    // (o estado passa por 'respondida' e vira 'retomada' na mesma transação,
    // fluxo.ts:593-596 e 649-652) — hoje fica preso em 'chamando' porque a 2ª
    // transação faz rollback total.
    const retomado = await processoDoContato();
    expect(retomado.estado).toBe('retomada');
    expect(retomado.resposta).toEqual({ status: 200, corpo: JSON.stringify({ ok: true }) });

    // (c) o bloco seguinte ao ProcessHttp rodou: saiu de boas-vindas para o
    // menu, e a mensagem do menu foi enviada — hoje isso nunca acontece,
    // porque a transação inteira da retomada é desfeita pelo duplicate key.
    expect(await doBot()).toEqual([
      'Olá! Qual é o seu nome?',
      'Prazer, Ana. Como posso ajudar?\n1. Financeiro\n2. Suporte',
    ]);

    // (c.1) D-27: a retomada grava exatamente UM execucao_passo/mensagem por
    // id_provedor — se `idProvedorUsado` (fluxo.ts) fosse inicializado com
    // `false` numa retomada, a segunda gravação duplicaria a linha e este
    // teste falharia (verificado por mutação manual, revertida; ver SUMMARY).
    expect(await contagemDeMensagensComId(msgAna)).toBe(1);

    // (d) uma mensagem NOVA do mesmo contato é processada, não fica bloqueada —
    // hoje `rodarFluxoNaEntrada` vê `process_http_execucao` em 'chamando' e ignora
    // toda mensagem nova daquele contato para sempre.
    await falar('1'); // escolhe "Financeiro"
    expect((await doBot()).at(-1)).toBe('A segunda via está no site.');

    // (e) o MESMO webhook da Meta (mesmo id_provedor da mensagem que suspendeu)
    // reenviado continua sendo ignorado — a proteção de idempotência da
    // migration 0014 não pode quebrar com o fix.
    const antes = await contagemDeMensagensComId(msgAna);
    await falar('Ana', msgAna);
    expect(await contagemDeMensagensComId(msgAna)).toBe(antes);
  });
});

/**
 * D-26: só o modo memória tinha varredura de `process_http_execucao` presa (ver
 * `.planning/todos/pending/process-http-bullmq-sweep.md`). Em produção (BullMQ), qualquer falha
 * entre reivindicar a linha (`chamando`) e terminar a retomada — queda de rede, reinício do
 * worker — deixava a linha presa para sempre, e `rodarFluxoNaEntrada` bloqueia toda mensagem
 * nova do mesmo contato enquanto ela existir. `recoverStuckProcessHttp` fecha essa lacuna.
 */
describe('varredura de process_http_execucao presa (D-26)', () => {
  it('recupera uma linha presa em chamando além do limite e destrava a conversa', async () => {
    const contato = '5511933330002';
    await falar('oi', undefined, contato);
    expect(await doBot(contato)).toEqual(['Olá! Qual é o seu nome?']);

    const msgAna = `wamid.PH.${randomUUID()}`;
    await falar('Ana', msgAna, contato);
    const suspenso = await processoDoContato(contato);
    expect(suspenso.estado).toBe('pendente');

    // Simula uma execução que travou em 'chamando' (a chamada saiu, mas o
    // processo caiu antes de retomar) há mais tempo do que o limite da varredura.
    await envelhecerProcesso(suspenso.id, 'chamando', '1 hour');

    const novos = await recoverStuckProcessHttp(5_000);
    expect(novos).toEqual([]);

    const recuperado = await processoDoContato(contato);
    expect(recuperado.estado).toBe('retomada');
    expect(recuperado.resposta).toEqual({ status: 408, corpo: '' });

    // O bloco seguinte ao ProcessHttp rodou com a resposta sintética de timeout.
    expect(await doBot(contato)).toEqual([
      'Olá! Qual é o seu nome?',
      'Prazer, Ana. Como posso ajudar?\n1. Financeiro\n2. Suporte',
    ]);

    // A conversa não fica muda: uma mensagem nova do mesmo contato é processada.
    await falar('1', undefined, contato);
    expect((await doBot(contato)).at(-1)).toBe('A segunda via está no site.');
  });

  it('não toca uma linha em chamando dentro do limite', async () => {
    const contato = '5511933330003';
    await falar('oi', undefined, contato);
    await falar('Ana', `wamid.PH.${randomUUID()}`, contato);
    const suspenso = await processoDoContato(contato);
    expect(suspenso.estado).toBe('pendente');

    // Reivindicada agora mesmo — ainda bem dentro do limite de qualquer varredura razoável.
    await envelhecerProcesso(suspenso.id, 'chamando', '0 seconds');

    const novos = await recoverStuckProcessHttp(60_000);
    expect(novos).toEqual([]);

    const inalterado = await processoDoContato(contato);
    expect(inalterado.estado).toBe('chamando');
    expect(inalterado.resposta).toBeNull();
  });
});
