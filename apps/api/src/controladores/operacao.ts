import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErroPipe } from '../erros.js';
import { renderizar } from '../metricas.js';
import { verificarSaude } from '../saude.js';

/**
 * As duas rotas que não pertencem a ninguém de fora: o healthcheck do orquestrador e
 * a coleta do Prometheus. Nenhuma delas leva `@Escopos` nem `@ComSessao` — são
 * públicas de propósito, e a de métricas tem porteiro próprio, logo abaixo.
 */

/**
 * Quem pode ver `/metrics`.
 *
 * **`/metrics` aberto vaza volume de cliente**: contagem de requisição por rota e
 * profundidade de fila dizem quanto o Pipe está movimentando, e a soma disso é
 * informação comercial. Duas camadas, nesta ordem:
 *
 * 1. `PIPE_METRICS_TOKEN` definido → exige `Authorization: Bearer <token>`. É o modo
 *    de produção, e o Prometheus manda o header por `authorization` no `scrape_config`.
 * 2. Sem token → só rede interna (loopback e faixas privadas). Serve ao
 *    desenvolvimento e ao `docker compose`, onde o Prometheus é vizinho de rede.
 *
 * Atrás do Traefik o IP visto é o do proxy, que é privado — ou seja, sem token a
 * camada 2 libera qualquer um que chegue pelo proxy. Por isso: **em produção, token.**
 */
export function podeVerMetricas(requisicao: Request): boolean {
  const esperado = process.env['PIPE_METRICS_TOKEN'];
  if (esperado && esperado.length > 0) {
    const dado = (requisicao.header('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const a = Buffer.from(dado);
    const b = Buffer.from(esperado);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  return ehRedeInterna(requisicao.ip);
}

export function ehRedeInterna(ip: string | undefined): boolean {
  if (!ip) return false;
  // O Node entrega IPv4 mapeado como `::ffff:10.0.0.3` quando o socket é dual-stack.
  const limpo = ip.replace(/^::ffff:/i, '');
  if (limpo === '127.0.0.1' || limpo === '::1' || limpo === 'localhost') return true;
  if (/^10\./.test(limpo) || /^192\.168\./.test(limpo)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(limpo)) return true;
  // fc00::/7 (único local) e fe80::/10 (enlace local).
  return /^f[cd]/i.test(limpo) || /^fe[89ab]/i.test(limpo);
}

@Controller()
export class ControladorOperacao {
  @Get('saude')
  async saude(@Res() resposta: Response): Promise<void> {
    const saude = await verificarSaude();
    // 503 só quando o banco está fora: é o que tira o contêiner de rotação. Redis
    // fora degrada a fila, não a resposta — e derrubar tudo por isso é trocar uma
    // degradação por uma queda.
    resposta.status(saude.ok ? 200 : 503).json(saude);
  }

  @Get('metrics')
  async metricas(@Req() requisicao: Request, @Res() resposta: Response): Promise<void> {
    if (!podeVerMetricas(requisicao)) {
      throw ErroPipe.naoAutorizado('Métricas exigem PIPE_METRICS_TOKEN ou rede interna.');
    }
    resposta.setHeader('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    resposta.send(await renderizar());
  }
}
