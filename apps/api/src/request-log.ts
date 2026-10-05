import type { NextFunction, Request, Response } from 'express';

/**
 * One JSON line per HTTP request, written to stdout when the response ends.
 *
 * Neither the API nor the reverse proxy kept an access log, so "did the Desk call this endpoint?" had no answer. This line is that answer, and it is deliberately narrow: method, route pattern, status, duration, tenant and user when authentication has set them. It never carries the body, the query string, cookies, `Authorization` or any other header, because those hold session tokens, API keys and signed-link signatures.
 *
 * The route is the Express pattern (`/v1/attachments/:id`), not the raw path: it keeps lines groupable and keeps identifiers out of the route field. Only a request that matched no route falls back to its path, with the query string cut off.
 *
 * `PIPE_LOG_REQUISICOES=0` turns it off. Probes (`/saude`, `/health`) and the metrics scrape are skipped: they fire every few seconds and would bury the real traffic.
 */

const IGNORADAS = new Set(['/saude', '/health', '/metrics']);

export interface LinhaDeRequisicao {
  ts: string;
  evento: 'requisicao';
  metodo: string;
  rota: string;
  status: number;
  ms: number;
  tenantId?: string;
  usuarioId?: string;
  /** `true` when the client closed the connection before the response finished (for example a long poll). */
  abortada?: true;
}

type RequestAutenticada = Request & {
  route?: { path?: unknown };
  session?: { tenantId?: string; userId?: string };
  context?: { tenantId?: string };
};

function caminhoSemQuery(requisicao: Request): string {
  const bruto = requisicao.originalUrl || requisicao.url || '';
  const corte = bruto.search(/[?#]/);
  return corte === -1 ? bruto : bruto.slice(0, corte);
}

/** Pattern of the matched route (`/v1/x/:id`), else the path without its query string. */
export function rotaDaRequisicao(requisicao: Request): string {
  const padrao = (requisicao as RequestAutenticada).route?.path;
  if (typeof padrao === 'string' && padrao) {
    // A route mounted under a prefix (`app.use('/v1', router)`) only knows its own part.
    return `${requisicao.baseUrl ?? ''}${padrao}`;
  }
  return caminhoSemQuery(requisicao);
}

export function linhaDaRequisicao(
  requisicao: Request,
  resposta: Response,
  ms: number,
  abortada = false,
  agora = new Date(),
): LinhaDeRequisicao {
  const autenticada = requisicao as RequestAutenticada;
  const tenantId = autenticada.session?.tenantId ?? autenticada.context?.tenantId;
  const usuarioId = autenticada.session?.userId;
  return {
    ts: agora.toISOString(),
    evento: 'requisicao',
    metodo: requisicao.method,
    rota: rotaDaRequisicao(requisicao),
    status: resposta.statusCode,
    ms: Math.round(ms * 10) / 10,
    ...(tenantId ? { tenantId } : {}),
    ...(usuarioId ? { usuarioId } : {}),
    ...(abortada ? { abortada: true as const } : {}),
  };
}

export function requestLogEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['PIPE_LOG_REQUISICOES'] !== '0';
}

export function logRequests(
  escrever: (linha: string) => void = (linha) => void process.stdout.write(linha),
) {
  return function requestLog(requisicao: Request, resposta: Response, seguir: NextFunction): void {
    if (!requestLogEnabled() || IGNORADAS.has(caminhoSemQuery(requisicao))) {
      seguir();
      return;
    }
    const inicio = process.hrtime.bigint();
    let registrada = false;
    const registrar = (abortada: boolean): void => {
      if (registrada) return;
      registrada = true;
      const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
      escrever(`${JSON.stringify(linhaDaRequisicao(requisicao, resposta, ms, abortada))}\n`);
    };
    resposta.on('finish', () => registrar(false));
    // `close` without `finish` means the client gave up before the response ended.
    resposta.on('close', () => registrar(!resposta.writableFinished));
    seguir();
  };
}
