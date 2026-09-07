import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// A porta 1 não tem ninguém escutando: é banco fora do ar sem precisar derrubar o
// contêiner. Tem que ser decidido ANTES do import — `banco.ts` lê a URL ao carregar.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL_APP'] = 'postgres://pipe_app:pipe_app@127.0.0.1:1/pipe';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['PIPE_VERSAO'] = '9.9.9-teste';
process.env['PIPE_SAUDE_TIMEOUT_MS'] = '2000';

const { subirApi } = await import('../src/servidor.js');

type ApiNoAr = Awaited<ReturnType<typeof subirApi>>;

/**
 * `/saude` com o banco fora.
 *
 * Arquivo separado de propósito: `banco.ts` guarda o pool num singleton lido do
 * ambiente na carga do módulo, e o Vitest isola o grafo de módulos por arquivo. Sem
 * a separação, apontar o banco para o vazio contaminaria todo o resto da suíte.
 */

let api: ApiNoAr;

beforeAll(async () => {
  api = await subirApi(0);
}, 60_000);

afterAll(async () => {
  await api?.fechar();
});

describe('GET /saude com o banco fora', () => {
  it('responde 503 e diz qual peça caiu', async () => {
    const comecou = Date.now();
    const resposta = await fetch(`${api.url}/saude`);
    const demorou = Date.now() - comecou;

    expect(resposta.status).toBe(503);
    const corpo = (await resposta.json()) as {
      ok: boolean;
      versao: string;
      banco: string;
      redis: string;
    };
    expect(corpo.ok).toBe(false);
    expect(corpo.banco).toBe('falha');
    expect(corpo.versao).toBe('9.9.9-teste');

    // O ponto do tempo-limite: responder rápido. Healthcheck que pendura deixa o
    // orquestrador esperando em vez de tirar o contêiner de rotação.
    expect(demorou).toBeLessThan(5_000);
  }, 30_000);
});
