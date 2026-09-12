import express from 'express';
import { sql } from 'drizzle-orm';
import type { Server } from 'node:http';
import { noTenant, fecharBanco } from './banco.js';
import { despachar } from './rotas.js';
import type { Sessao } from './rotas.js';
import { falha } from './lime.js';
import type { ComandoLime } from './lime.js';

/**
 * A ponte: um endereço só, que recebe comando LIME e responde com dado do Pipe.
 *
 * Por que HTTP e não WebSocket: a cópia já foi desligada do WebSocket da Blip pelo
 * laboratório — `boot-mock.js` monta um cliente falso cujo `processCommand` devolve
 * promessa. Uma chamada HTTP encaixa nesse ponto sem tocar no bundle deles.
 */

/**
 * Autenticação de laboratório, e só.
 *
 * A cópia não tem login. Enquanto a tela for a cópia, o acesso é por rede fechada e
 * a ponte confia numa chave de ambiente. **Isto não vai para a internet**: no dia em
 * que a tela for nossa, quem manda é a sessão que a `apps/api` já emite.
 */
function sessaoConfigurada(): { tenantId: string; email: string } {
  const tenantId = process.env['PIPE_PONTE_TENANT_ID'];
  const email = process.env['PIPE_PONTE_EMAIL'];
  if (!tenantId || !email) {
    throw new Error(
      'ponte sem tenant: defina PIPE_PONTE_TENANT_ID e PIPE_PONTE_EMAIL (o atendente que a cópia representa)',
    );
  }
  return { tenantId, email };
}

async function resolverSessao(): Promise<Sessao> {
  const { tenantId, email } = sessaoConfigurada();
  const usuario = await noTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{ id: string; nome: string | null }>(sql`
      select id, nome from usuario where lower(email) = ${email.toLowerCase()} limit 1
    `);
    return rows[0] ?? null;
  });
  if (!usuario) throw new Error(`ponte: usuário ${email} não existe no tenant ${tenantId}`);
  return { tenantId, usuarioId: usuario.id, email, nome: usuario.nome };
}

export interface PonteNoAr {
  url: string;
  porta: number;
  fechar: () => Promise<void>;
}

export async function subirPonte(porta = Number(process.env['PORT'] ?? 3020)): Promise<PonteNoAr> {
  const sessao = await resolverSessao();
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  /* A cópia roda em 127.0.0.1:8787 (Desk) e :8790 (Gestão). A lista vem do
     ambiente e nunca é curinga: mesmo em laboratório, curinga com credencial é
     hábito que viaja para produção. */
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
    res.json({ ok: true, tenant: sessao.tenantId, atendente: sessao.email });
  });

  /**
   * O comando chega exatamente como a tela o montou. A resposta `204` é o combinado
   * com o laboratório: "não sei responder, use o mock". Erro de verdade volta como
   * falha LIME, para a tela tratar como ela já sabe tratar.
   */
  app.post('/comandos', (req, res) => {
    const cmd = req.body as ComandoLime;
    if (!cmd || typeof cmd.uri !== 'string') {
      res.status(400).json(falha(1, 'comando sem uri'));
      return;
    }
    void despachar(cmd, sessao)
      .then((resposta) => {
        if (!resposta) {
          res.status(204).end();
          return;
        }
        res.json({ id: cmd.id, method: cmd.method, ...resposta });
      })
      .catch((erro: unknown) => {
        const texto = erro instanceof Error ? erro.message : String(erro);
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
      await fecharBanco();
    },
  };
}
