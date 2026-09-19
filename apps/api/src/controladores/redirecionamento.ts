import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErroPipe } from '../erros.js';
import { redirecionarClique } from '../dominio/rastreador-de-cliques.js';

/**
 * `GET /l/:codigo` — a rota PÚBLICA do rastreador de cliques. Sem `@ComSessao()`
 * nem `@Escopos(...)` de propósito: quem clica no anúncio/mensagem não tem
 * cookie nem chave — é público como o webhook da Meta (`sessao.ts`, "rota sem
 * marca nenhuma é pública de propósito").
 */
@Controller('l')
export class ControladorRedirecionamento {
  @Get(':codigo')
  async redirecionar(
    @Param('codigo') codigo: string,
    @Query('origem') origem: string | undefined,
    @Req() requisicao: Request,
    @Res() resposta: Response,
  ): Promise<void> {
    const destino = await redirecionarClique(codigo, {
      agenteUsuario: requisicao.headers['user-agent'] ?? null,
      origem: origem ?? null,
      ip: enderecoDoCliente(requisicao),
    });
    if (!destino) throw ErroPipe.naoEncontrado('Link');
    resposta.redirect(302, destino);
  }
}

/** `X-Forwarded-For` (proxy/CDN na frente) e, na falta dele, o socket direto. */
function enderecoDoCliente(requisicao: Request): string {
  const encaminhado = requisicao.headers['x-forwarded-for'];
  const primeiro = Array.isArray(encaminhado) ? encaminhado[0] : encaminhado?.split(',')[0];
  return (primeiro ?? requisicao.socket.remoteAddress ?? 'desconhecido').trim();
}
