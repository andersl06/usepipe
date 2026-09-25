import { Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { secretConfere } from '@pipe/db';
import { resolveChannel } from '../banco.js';
import type { ChannelResolved } from '../banco.js';
import { PipeError } from '../erros.js';
import { enqueueInbound } from '../filas.js';
import { assinaturaConfere } from './webhooks-whatsapp.js';
import type { RequestWithBodyRaw } from './webhooks-whatsapp.js';

/**
 * Webhook do Instagram (Direct), por canal. Reconstruído de chatwoot/chatwoot (MIT),
 * app/controllers/webhooks/instagram_controller.rb, com as regras do webhook do
 * WhatsApp da Pipe (`webhooks-whatsapp.ts`): `verify_token` em tempo constante,
 * assinatura `X-Hub-Signature-256` sobre o corpo cru com o App Secret DO APP DO
 * CLIENTE (gravado no canal), 200 imediato e o processamento na fila.
 *
 * Diferente do WhatsApp, não há segredo do ambiente como reserva: todo canal do
 * Instagram é manual, e sem o segredo do canal a recusa é fechada.
 */
@Controller('webhooks/instagram')
export class InstagramWebhookController {
  @Get(':canalId')
  async verificar(
    @Param('canalId') channelId: string,
    @Query('hub.mode') modo: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') desafio: string | undefined,
    @Res() resposta: Response,
  ): Promise<void> {
    const channel = await channelOfInstagram(channelId);
    const esperado = String(channel.config['verifyToken'] ?? '');
    if (modo !== 'subscribe' || !esperado || !secretConfere(token ?? '', esperado)) {
      throw new PipeError(403, 'verification_refused', 'hub.verify_token não confere.');
    }
    resposta.status(200).type('text/plain').send(desafio ?? '');
  }

  @Post(':canalId')
  @HttpCode(200)
  async receber(
    @Param('canalId') canalId: string,
    @Req() request: RequestWithBodyRaw,
  ): Promise<{ recebido: true }> {
    const canal = await channelOfInstagram(canalId);
    if (!canal.ativo) throw PipeError.conflito('channel_inactive', 'O canal está desativado.');

    const secret = String(canal.config['appSecret'] ?? '');
    if (!secret) {
      throw new PipeError(
        403,
        'channel_without_app_secret',
        'O canal não tem appSecret configurado: sem ele a assinatura não pode ser conferida.',
      );
    }
    const corpo = request.corpoCru;
    if (!corpo) throw new PipeError(400, 'body_missing', 'O corpo cru não chegou ao validador.');
    if (!assinaturaConfere(secret, corpo, request.header('x-hub-signature-256'))) {
      throw new PipeError(401, 'signature_invalid', 'X-Hub-Signature-256 não confere.');
    }

    await enqueueInbound(canalId, request.body);
    return { recebido: true };
  }
}

/** Canal que não é do Instagram é 404 aqui: a URL de um WhatsApp não vira porta de entrada do Direct. */
async function channelOfInstagram(canalId: string): Promise<ChannelResolved> {
  const canal = /^[0-9a-f-]{36}$/i.test(canalId) ? await resolveChannel(canalId) : null;
  if (!canal || canal.tipo !== 'instagram') throw PipeError.naoEncontrado('Canal');
  return canal;
}
