import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PipeError } from '../errors.js';
import { redirecionarClique } from '../domain/rastreador-de-cliques.js';

/**
 * `GET /l/:codigo` is the public click-tracking redirect. Deliberately omit `@ComSessao()` and `@Escopos(...)`: someone clicking an ad or message has neither a cookie nor an API key. This is public like the Meta webhook; see `sessao.ts` and its unmarked-route rule.
 */
@Controller('l')
export class RedirectController {
  @Get(':codigo')
  async redirecionar(
    @Param('codigo') codigo: string,
    @Query('origin') origem: string | undefined,
    @Req() request: Request,
    @Res() resposta: Response,
  ): Promise<void> {
    const destination = await redirecionarClique(codigo, {
      agenteUser: request.headers['user-agent'] ?? null,
      origin: origem ?? null,
      ip: enderecoDoCliente(request),
    });
    if (!destination) throw PipeError.naoEncontrado('Link');
    resposta.redirect(302, destination);
  }
}

/** `X-Forwarded-For` (proxy/CDN na frente) e, na falta dele, o socket direto. */
function enderecoDoCliente(requisicao: Request): string {
  const encaminhado = requisicao.headers['x-forwarded-for'];
  const first = Array.isArray(encaminhado) ? encaminhado[0] : encaminhado?.split(',')[0];
  return (first ?? requisicao.socket.remoteAddress ?? 'desconhecido').trim();
}
