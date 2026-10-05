import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { logRequests } from '../src/request-log.js';
import type { LinhaDeRequisicao } from '../src/request-log.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const USUARIO = '22222222-2222-4222-8222-222222222222';
const CONVERSA = '33333333-3333-4333-8333-333333333333';

const linhas: string[] = [];
let servidor: Server;
let base: string;
const ENV_ORIGINAL = process.env['PIPE_LOG_REQUISICOES'];

beforeAll(async () => {
  const app = express();
  app.use(logRequests((linha) => linhas.push(linha)));
  app.use(express.json());
  // Stand-in for the session/API-key guards: they set these fields on the request.
  app.use((requisicao, _resposta, seguir) => {
    if (requisicao.header('x-teste-sessao')) {
      (requisicao as unknown as Record<string, unknown>)['session'] = { tenantId: TENANT, userId: USUARIO };
    }
    if (requisicao.header('x-teste-chave')) {
      (requisicao as unknown as Record<string, unknown>)['context'] = { tenantId: TENANT };
    }
    seguir();
  });
  app.get('/saude', (_req, res) => void res.json({ ok: true }));
  app.get('/health', (_req, res) => void res.json({ ok: true }));
  app.post('/v1/conversas/:id/espera', (_req, res) => void res.status(202).json({ ok: true }));
  app.get('/v1/falha', (_req, res) => void res.status(500).json({ erro: 'x' }));
  app.get('/v1/lento', (_req, res) => {
    setTimeout(() => res.json({ ok: true }), 60);
  });
  servidor = await new Promise<Server>((resolver) => {
    const s = app.listen(0, '127.0.0.1', () => resolver(s));
  });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolver) => servidor.close(resolver));
});

beforeEach(() => {
  linhas.length = 0;
  delete process.env['PIPE_LOG_REQUISICOES'];
});

afterEach(() => {
  if (ENV_ORIGINAL === undefined) delete process.env['PIPE_LOG_REQUISICOES'];
  else process.env['PIPE_LOG_REQUISICOES'] = ENV_ORIGINAL;
});

async function aguardarLinhas(quantas: number): Promise<LinhaDeRequisicao[]> {
  for (let i = 0; i < 50 && linhas.length < quantas; i++) await new Promise((r) => setTimeout(r, 10));
  return linhas.map((linha) => JSON.parse(linha) as LinhaDeRequisicao);
}

describe('Log de requisições da API', () => {
  it('escreve uma linha JSON por requisição com método, rota, status, duração, tenant e usuário', async () => {
    const resposta = await fetch(`${base}/v1/conversas/${CONVERSA}/espera`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-teste-sessao': '1' },
      body: JSON.stringify({ minutos: 5 }),
    });
    expect(resposta.status).toBe(202);

    const registros = await aguardarLinhas(1);
    expect(registros).toHaveLength(1);
    expect(linhas[0]!.endsWith('\n')).toBe(true);
    expect(registros[0]).toMatchObject({
      evento: 'requisicao',
      metodo: 'POST',
      rota: '/v1/conversas/:id/espera',
      status: 202,
      tenantId: TENANT,
      usuarioId: USUARIO,
    });
    expect(registros[0]!.ms).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(registros[0]!.ts))).toBe(false);
  });

  it('usa o padrão da rota e não o identificador que veio na URL', async () => {
    await fetch(`${base}/v1/conversas/${CONVERSA}/espera`, { method: 'POST' });
    const [registro] = await aguardarLinhas(1);
    expect(registro!.rota).toBe('/v1/conversas/:id/espera');
    expect(linhas[0]).not.toContain(CONVERSA);
  });

  it('registra o tenant de uma chave de API, sem usuário', async () => {
    await fetch(`${base}/v1/falha`, { headers: { 'x-teste-chave': '1' } });
    const [registro] = await aguardarLinhas(1);
    expect(registro).toMatchObject({ rota: '/v1/falha', status: 500, tenantId: TENANT });
    expect(registro).not.toHaveProperty('usuarioId');
  });

  it('omite tenant e usuário quando a requisição não está autenticada', async () => {
    await fetch(`${base}/v1/falha`);
    const [registro] = await aguardarLinhas(1);
    expect(registro).not.toHaveProperty('tenantId');
    expect(registro).not.toHaveProperty('usuarioId');
  });

  it('em rota inexistente usa o caminho sem query string', async () => {
    const resposta = await fetch(`${base}/v1/nao-existe?token=segredo&x=1`);
    expect(resposta.status).toBe(404);
    const [registro] = await aguardarLinhas(1);
    expect(registro).toMatchObject({ rota: '/v1/nao-existe', status: 404 });
  });

  it('não grava query string, corpo, cookie nem Authorization', async () => {
    await fetch(`${base}/v1/conversas/${CONVERSA}/espera?signature=ASSINATURA-SECRETA&expires=123`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer pipe_abc_TOKEN-SECRETO',
        cookie: 'pipe_session=COOKIE-SECRETO',
        'x-teste-sessao': '1',
      },
      body: JSON.stringify({ mensagem: 'CORPO-SECRETO', senha: 'SENHA-SECRETA' }),
    });
    await aguardarLinhas(1);
    const linha = linhas[0]!;
    for (const segredo of [
      'ASSINATURA-SECRETA',
      'signature',
      'expires',
      'TOKEN-SECRETO',
      'Bearer',
      'COOKIE-SECRETO',
      'CORPO-SECRETO',
      'SENHA-SECRETA',
      '?',
    ]) {
      expect(linha).not.toContain(segredo);
    }
    expect(Object.keys(JSON.parse(linha) as object).sort()).toEqual(
      ['evento', 'metodo', 'ms', 'rota', 'status', 'tenantId', 'ts', 'usuarioId'].sort(),
    );
  });

  it('pula as sondas de saúde', async () => {
    await fetch(`${base}/saude`);
    await fetch(`${base}/health`);
    await fetch(`${base}/v1/falha`);
    const registros = await aguardarLinhas(1);
    expect(registros.map((r) => r.rota)).toEqual(['/v1/falha']);
  });

  it('mede a duração em milissegundos', async () => {
    await fetch(`${base}/v1/lento`);
    const [registro] = await aguardarLinhas(1);
    expect(registro!.ms).toBeGreaterThanOrEqual(50);
    expect(registro!.ms).toBeLessThan(5_000);
  });

  it('PIPE_LOG_REQUISICOES=0 desliga o log', async () => {
    process.env['PIPE_LOG_REQUISICOES'] = '0';
    await fetch(`${base}/v1/falha`);
    await new Promise((r) => setTimeout(r, 100));
    expect(linhas).toHaveLength(0);
  });
});
