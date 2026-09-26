import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Nothing listens on port 1: it simulates the database being down without needing to stop the
// container. This must be decided BEFORE the import — `banco.ts` reads the URL on load.
process.env['PIPE_FILAS'] = 'memoria';
process.env['DATABASE_URL_APP'] = 'postgres://pipe_app:pipe_app@127.0.0.1:1/pipe';
process.env['DATABASE_URL'] ??= 'postgres://pipe:pipe@localhost:5433/pipe';
process.env['PIPE_VERSAO'] = '9.9.9-teste';
process.env['PIPE_SAUDE_TIMEOUT_MS'] = '2000';

const { upApi } = await import('../src/servidor.js');

type ApiNoAr = Awaited<ReturnType<typeof upApi>>;

/**
 * `/saude` with the database down. Kept in a separate file on purpose: `banco.ts` holds the pool in a singleton read from the environment at module load, and Vitest isolates the module graph per file. Without this separation, pointing the database at nothing would contaminate the rest of the suite.
 */

let api: ApiNoAr;

beforeAll(async () => {
  api = await upApi(0);
}, 60_000);

afterAll(async () => {
  await api?.fechar();
});

describe('Return 503 from GET `/saude` and identify the unavailable database', () => {
  it('responde 503 e diz qual peça caiu', async () => {
    const comecou = Date.now();
    const resposta = await fetch(`${api.url}/saude`);
    const demorou = Date.now() - comecou;

    expect(resposta.status).toBe(503);
    const corpo = (await resposta.json()) as {
      ok: boolean;
      version: string;
      database: string;
      redis: string;
    };
    expect(corpo.ok).toBe(false);
    expect(corpo.database).toBe('falha');
    expect(corpo.versao).toBe('9.9.9-teste');

    // The point of the timeout: respond quickly. A healthcheck that hangs leaves the
    // orchestrator waiting instead of taking the container out of rotation.
    expect(demorou).toBeLessThan(5_000);
  }, 30_000);
});
