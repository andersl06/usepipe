import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PipeError } from '../errors.js';
import { renderizar } from '../metrics.js';
import { verificarSaude } from '../saude.js';

/**
 * The orchestrator health check and Prometheus collection are deliberately unmarked by `@Escopos` or `@ComSessao`. Both routes are public at the guard layer; `/metrics` applies its own access check below.
 */

/**
 * Control access to `/metrics`. An open endpoint exposes customer activity: request counts by route and queue depth reveal Pipe's commercial volume. With `PIPE_METRICS_TOKEN`, require `Authorization: Bearer <token>`; production Prometheus sends it through `authorization` in `scrape_config`. Without the token, allow only loopback or private networks for development and neighboring `docker compose` Prometheus. Behind Traefik, the visible proxy IP is private, so that fallback admits anyone who can reach the proxy. Production therefore requires the token.
 */
export function canViewMetrics(request: Request): boolean {
  const esperado = process.env['PIPE_METRICS_TOKEN'];
  if (esperado && esperado.length > 0) {
    const dado = (request.header('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const a = Buffer.from(dado);
    const b = Buffer.from(esperado);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  return ehRedeInterna(request.ip);
}

export function ehRedeInterna(ip: string | undefined): boolean {
  if (!ip) return false;
  // On dual-stack sockets, Node represents mapped IPv4 as `::ffff:10.0.0.3`.
  const limpo = ip.replace(/^::ffff:/i, '');
  if (limpo === '127.0.0.1' || limpo === '::1' || limpo === 'localhost') return true;
  if (/^10\./.test(limpo) || /^192\.168\./.test(limpo)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(limpo)) return true;
  // `fc00::/7` is unique-local and `fe80::/10` is link-local.
  return /^f[cd]/i.test(limpo) || /^fe[89ab]/i.test(limpo);
}

@Controller()
export class OperationsController {
  @Get('saude')
  async saude(@Res() resposta: Response): Promise<void> {
    const saude = await verificarSaude();
    // Return 503 only when the database is down, so the container leaves rotation. Redis
    // failure degrades queue processing, not responses; bringing down everything would turn
    // degraded service into a full outage.
    resposta.status(saude.ok ? 200 : 503).json(saude);
  }

  @Get('metrics')
  async metrics(@Req() requisicao: Request, @Res() resposta: Response): Promise<void> {
    if (!canViewMetrics(requisicao)) {
      throw PipeError.naoAutorizado('Métricas exigem PIPE_METRICS_TOKEN ou rede interna.');
    }
    resposta.setHeader('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    resposta.send(await renderizar());
  }
}
