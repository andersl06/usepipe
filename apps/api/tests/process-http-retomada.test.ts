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

const { subirApi } = await import('../src/servidor.js');
const { noTenant } = await import('../src/banco.js');
const { importarFluxoDaBlip, executarProcessHttp } = await import('../src/dominio/fluxo.js');
const { assinar, montarCenario, payloadDeMensagem } = await import('./ajuda.js');

type Cenario = Awaited<ReturnType<typeof montarCenario>>;
type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

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
    new URL('../../../packages/core/src/fluxo/fixtures/editor-sintetico.json', import.meta.url),
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
  api = await subirApi(0);
  const r = await noTenant(cenario.tenantId, (tx) =>
    importarFluxoDaBlip(tx, {
      tenantId: cenario.tenantId,
      nome: 'Retomada de ProcessHttp',
      canalId: cenario.canalId,
      json: fluxoComProcessHttp(),
      publicar: true,
    }),
  );
  expect(r.erroDeValidacao).toBeNull();
}, 180_000);

afterAll(async () => {
  await api?.fechar();
  await cenario?.encerrar();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function falar(texto: string, id?: string): Promise<void> {
  const corpo = JSON.stringify(payloadDeMensagem(CONTATO, texto, id ? { id } : {}));
  const resposta = await fetch(`${api.url}/webhooks/whatsapp/${cenario.canalId}`, {
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
};

async function processoDoContato(): Promise<ProcessoHttp> {
  const { rows } = await cenario.dono.execute<ProcessoHttp>(sql`
    select p.id, p.estado, p.entrada, p.resposta from process_http_execucao p
      join execucao_fluxo e on e.id = p.execucao_id
      join conversa c on c.id = e.conversa_id
      join contato ct on ct.id = c.contato_id
     where p.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${CONTATO}`}
     order by p.criado_em desc limit 1
  `);
  expect(rows[0]).toBeDefined();
  return rows[0]!;
}

async function doBot(): Promise<string[]> {
  const { rows } = await cenario.dono.execute<{ conteudo: string }>(sql`
    select m.conteudo from mensagem m
      join conversa c on c.id = m.conversa_id
      join contato ct on ct.id = c.contato_id
     where c.tenant_id = ${cenario.tenantId}::uuid and ct.telefone_e164 = ${`+${CONTATO}`}
       and m.autor_tipo = 'bot'
     order by m.criada_em
  `);
  return rows.map((r) => r.conteudo);
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
