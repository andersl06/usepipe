import express from 'express';
import { sql } from 'drizzle-orm';
import type { Server } from 'node:http';
import { noTenant, fecharDatabase } from './database.js';
import { despachar } from './rotas.js';
import type { Session } from './rotas.js';
import { falha } from './lime.js';
import type { ComandoLime } from './lime.js';

/**
 * The bridge exposes one address for LIME commands and returns Pipe data. HTTP fits the lab's existing seam: `boot-mock.js` already disconnected the copy from Blip WebSocket and constructs a fake client whose `processCommand` returns a promise. An HTTP call works there without changing the copied bundle.
 */

/**
 * Lab authentication only. The copy has no login; while it remains a copy, access is restricted to a closed network and the bridge trusts an environment key. THIS MUST NOT BE EXPOSED TO THE INTERNET. When the screen is ours, use the session issued by `apps/api`.
 */
function sessionConfigured(): { tenantId: string; email: string } {
  const tenantId = process.env['PIPE_PONTE_TENANT_ID'];
  const email = process.env['PIPE_PONTE_EMAIL'];
  if (!tenantId || !email) {
    throw new Error(
      'ponte sem tenant: defina PIPE_PONTE_TENANT_ID e PIPE_PONTE_EMAIL (o atendente que a cópia representa)',
    );
  }
  return { tenantId, email };
}

async function resolveSession(): Promise<Session> {
  const { tenantId, email } = sessionConfigured();
  const user = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ id: string; nome: string | null }>(sql`
      select id, nome from usuario where lower(email) = ${email.toLowerCase()} limit 1
    `);
    return rows[0] ?? null;
  });
  if (!user) throw new Error(`ponte: usuário ${email} não existe no tenant ${tenantId}`);
  return { tenantId, userId: user.id, email, name: user.nome };
}

export interface BridgeInAr {
  url: string;
  porta: number;
  fechar: () => Promise<void>;
}

export async function startBridge(porta = Number(process.env['PORT'] ?? 3020)): Promise<BridgeInAr> {
  const session = await resolveSession();
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  /*
   * The copy runs at 127.0.0.1:8787 (Desk) and :8790 (Management). Allowed origins come from the environment and are never wildcarded: even in a lab, wildcard origins with credentials create a dangerous production habit.
   */
  const origens = (process.env['PIPE_PONTE_ORIGENS'] ?? 'http://127.0.0.1:8787,http://127.0.0.1:8790')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use((req, res, proximo) => {
    const origem = req.headers.origin;
    if (origem && origens.includes(origem)) {
      res.setHeader('Access-Control-Allow-Origin', origem);
      res.setHeader('Access-Control-Allow-Headers', 'content-type');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    proximo();
  });

  app.get('/saude', (_req, res) => {
    res.json({ ok: true, tenant: session.tenantId, atendente: session.email });
  });

  /**
   * The command arrives exactly as the screen built it. HTTP `204` is the lab convention for "cannot answer; use the mock". Real errors return a LIME failure for the screen's existing error handling.
   */
  app.post('/comandos', (req, res) => {
    const cmd = req.body as ComandoLime;
    if (!cmd || typeof cmd.uri !== 'string') {
      res.status(400).json(falha(1, 'comando sem uri'));
      return;
    }
    void despachar(cmd, session)
      .then((resposta) => {
        if (!resposta) {
          res.status(204).end();
          return;
        }
        res.json({ id: cmd.id, method: cmd.method, ...resposta });
      })
      .catch((error: unknown) => {
        const texto = error instanceof Error ? error.message : String(error);
        console.error(`[ponte] ${cmd.method} ${cmd.uri} falhou: ${texto}`);
        res.json({ id: cmd.id, method: cmd.method, ...falha(2, texto) });
      });
  });

  const servidor: Server = await new Promise((resolver) => {
    const s = app.listen(porta, '127.0.0.1', () => resolver(s));
  });
  const endereco = servidor.address();
  const portaReal = typeof endereco === 'object' && endereco ? endereco.port : porta;

  return {
    url: `http://127.0.0.1:${portaReal}`,
    porta: portaReal,
    fechar: async () => {
      await new Promise<void>((r) => servidor.close(() => r()));
      await fecharDatabase();
    },
  };
}
