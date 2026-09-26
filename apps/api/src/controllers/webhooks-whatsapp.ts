import { createHmac, timingSafeEqual } from 'node:crypto';
import { Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { resolveChannel, resolveChannelByIdentifier } from '../database.js';
import { PipeError } from '../errors.js';
import { enqueueInbound } from '../queues.js';

/** The JSON parser's `verify` hook saves the raw body; the signature covers those bytes. */
export type RequestWithBodyRaw = Request & { corpoCru?: Buffer };

/**
 * Meta webhook invariants: verify `X-Hub-Signature-256` against the raw body because JSON reserialization changes whitespace or key order and breaks the signature. Return 200 promptly because Meta retries delayed deliveries and duplicates messages; queue processing instead. Compare the subscription challenge `verify_token` in constant time, as with the signature, because both are shared secrets.
 */
@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  /** Subscription verification: Meta calls once with `hub.challenge`. */
  @Get(':canalId')
  async verificar(
    @Param('canalId') channelId: string,
    @Query('hub.mode') modo: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') desafio: string | undefined,
    @Res() resposta: Response,
  ): Promise<void> {
    const canal = await resolveChannel(channelId);
    if (!canal) throw PipeError.naoEncontrado('Canal');

    const esperado = String(canal.config['verifyToken'] ?? process.env['WHATSAPP_VERIFY_TOKEN'] ?? '');
    if (modo !== 'subscribe' || !esperado || !igual(token ?? '', esperado)) {
      throw new PipeError(403, 'verification_refused', 'hub.verify_token não confere.');
    }
    // Meta expects the raw challenge as text, not JSON.
    resposta.status(200).type('text/plain').send(desafio ?? '');
  }

  @Post(':canalId')
  @HttpCode(200)
  async receber(
    @Param('canalId') canalId: string,
    @Req() requisicao: RequestWithBodyRaw,
  ): Promise<{ recebido: true }> {
    const canal = await resolveChannel(canalId);
    if (!canal) throw PipeError.naoEncontrado('Canal');
    if (!canal.active) throw PipeError.conflito('channel_inactive', 'O canal está desativado.');

    const segredo = String(canal.config['appSecret'] ?? process.env['WHATSAPP_APP_SECRET'] ?? '');
    if (!segredo) {
      // Without a secret, we cannot distinguish Meta from anyone else. Fail closed.
      throw new PipeError(
        403,
        'channel_without_app_secret',
        'O canal não tem appSecret configurado: sem ele a assinatura não pode ser conferida.',
      );
    }

    const corpo = requisicao.corpoCru;
    if (!corpo) {
      throw new PipeError(400, 'body_missing', 'O corpo cru não chegou ao validador.');
    }
    if (!assinaturaConfere(segredo, corpo, requisicao.header('x-hub-signature-256'))) {
      throw new PipeError(401, 'signature_invalid', 'X-Hub-Signature-256 não confere.');
    }

    // Enqueue and respond. Processing inside the request would cause Meta to retry.
    await enqueueInbound(canalId, requisicao.body);
    return { recebido: true };
  }

  /**
   * The umbrella route handles Meta events that cannot use customer-specific URLs. Template approval or rejection, number quality, limit changes and ban alerts do not accept `override_callback_uri`; all customers reach this route. See `docs/specs/2026-09-07-webhook-por-cliente.md`. Unlike the per-channel route, verify the signature with our app's single `appSecret`: that proves Meta sent the event, not which customer owns it. Resolve the tenant from the payload, and discard any payload with no matching channel rather than guessing.
   */
  /**
   * Subscription challenge for the umbrella route. Meta calls this URL once when registering the webhook on the app. The token comes from the environment, not a channel, because there is no channel in the path and the app has one webhook. Without this route, app webhook registration fails and rejected templates or quality drops never arrive.
   */
  @Get()
  async checkOfAccount(
    @Query('hub.mode') modo: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') desafio: string | undefined,
    @Res() resposta: Response,
  ): Promise<void> {
    const esperado = process.env['WHATSAPP_VERIFY_TOKEN'] ?? '';
    if (modo !== 'subscribe' || !esperado || !igual(token ?? '', esperado)) {
      throw new PipeError(403, 'verification_refused', 'hub.verify_token não confere.');
    }
    resposta.status(200).type('text/plain').send(desafio ?? '');
  }

  @Post()
  @HttpCode(200)
  async receiveOfAccount(@Req() request: RequestWithBodyRaw): Promise<{ recebido: true }> {
    const secret = process.env['WHATSAPP_APP_SECRET'] ?? '';
    if (!secret) {
      throw new PipeError(
        403,
        'app_without_secret',
        'WHATSAPP_APP_SECRET não está definida: sem ela a assinatura não pode ser conferida.',
      );
    }

    const corpo = request.corpoCru;
    if (!corpo) throw new PipeError(400, 'body_missing', 'O corpo cru não chegou ao validador.');
    if (!assinaturaConfere(secret, corpo, request.header('x-hub-signature-256'))) {
      throw new PipeError(401, 'signature_invalid', 'X-Hub-Signature-256 não confere.');
    }

    for (const inbound of identificarEntradas(request.body)) {
      const channel = await resolveChannelByIdentifier(inbound.numberId, inbound.wabaId);
      if (!channel) {
        // No owner means another app or a removed channel. Log and discard the event here.
        console.warn(
          `[webhook] evento de conta sem canal correspondente (waba=${inbound.wabaId ?? '—'}, numero=${inbound.numberId ?? '—'})`,
        );
        continue;
      }
      await enqueueInbound(channel.id, inbound.body);
    }
    return { recebido: true };
  }
}

interface InboundIdentified {
  wabaId: string | undefined;
  numberId: string | undefined;
  body: unknown;
}

/**
 * Split a Meta payload into one item per `entry`, each carrying an identifier to find its owner. One POST can contain entries from several customers on this route. Treating the batch as one would enqueue one customer's event for another, a cross-tenant leak that the per-channel route avoids.
 */
export function identificarEntradas(corpo: unknown): InboundIdentified[] {
  const raiz = corpo as { entry?: unknown[] } | undefined;
  if (!Array.isArray(raiz?.entry)) return [];

  return raiz.entry.map((entrada) => {
    const e = entrada as {
      id?: string;
      changes?: { value?: { metadata?: { phone_number_id?: string } } }[];
    };
    const numeroId = e.changes?.find((c) => c.value?.metadata?.phone_number_id)?.value?.metadata
      ?.phone_number_id;
    return {
      wabaId: e.id,
      numberId: numeroId,
      // Rewrap with exactly one `entry`; downstream processing expects Meta's payload shape.
      body: { object: 'whatsapp_business_account', entry: [entrada] },
    };
  });
}

export function assinaturaConfere(
  secret: string,
  corpo: Buffer,
  cabecalho: string | undefined,
): boolean {
  if (!cabecalho?.startsWith('sha256=')) return false;
  const calculada = createHmac('sha256', secret).update(corpo).digest('hex');
  return igual(cabecalho.slice('sha256='.length), calculada);
}

/** Signing is straightforward; compare without leaking the matched length through timing to avoid an oracle. */
function igual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
