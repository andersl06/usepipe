import { Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { secretConfere } from '@pipe/db';
import { resolveChannel } from '../database.js';
import type { ChannelResolved } from '../database.js';
import { PipeError } from '../errors.js';
import { enqueueInbound } from '../queues.js';
import { assinaturaConfere } from './webhooks-whatsapp.js';
import type { RequestWithBodyRaw } from './webhooks-whatsapp.js';

/**
 * Per-channel Instagram Direct webhook, reconstructed from chatwoot/chatwoot (MIT), `app/controllers/webhooks/instagram_controller.rb`, with Pipe's WhatsApp webhook rules (`webhooks-whatsapp.ts`): constant-time `verify_token` comparison, `X-Hub-Signature-256` over the raw body using the customer app's App Secret stored on the channel, immediate 200, then queued processing. Unlike WhatsApp there is no environment-secret fallback: every Instagram channel is manual, so a missing channel secret fails closed.
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
    if (!canal.active) throw PipeError.conflito('channel_inactive', 'O canal está desativado.');

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

/** Return 404 for a channel that is not Instagram; a WhatsApp URL must not accept Direct traffic. */
async function channelOfInstagram(canalId: string): Promise<ChannelResolved> {
  const canal = /^[0-9a-f-]{36}$/i.test(canalId) ? await resolveChannel(canalId) : null;
  if (!canal || canal.type !== 'instagram') throw PipeError.naoEncontrado('Canal');
  return canal;
}
