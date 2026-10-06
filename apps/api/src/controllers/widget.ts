import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { PipeError } from '../errors.js';
import { withinRateLimit } from '../rate-limit.js';
import type { ChannelResolved } from '../database.js';
import {
  MAX_TEXT_LENGTH,
  resolveWidgetChannel,
  validVisitor,
  visitorSecretOf,
  visitorToken,
  widgetInbound,
  widgetMessagesSince,
  type WidgetMessage,
} from '../domain/widget.js';

/**
 * Public Pipe Chat endpoints called from customer sites. Deliberately without a session guard: visitors have no cookie and these routes never read one. The tenant is derived only from the channel key; the Origin must be in the channel allow-list; visitors prove identity with an HMAC token.
 */
export interface WidgetRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function clientIp(request: WidgetRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return (first ?? request.ip ?? request.socket?.remoteAddress ?? 'unknown').trim();
}

async function guard(key: string, request: WidgetRequest): Promise<ChannelResolved> {
  const channel = await resolveWidgetChannel(key);
  if (!channel) throw PipeError.naoEncontrado('Canal');
  const origin = request.headers['origin'];
  const allowed = channel.config['allowedOrigins'];
  if (typeof origin !== 'string' || !Array.isArray(allowed) || !allowed.includes(origin.toLowerCase())) {
    throw new PipeError(403, 'origin_not_allowed', 'Origem não permitida para este chat.');
  }
  if (!withinRateLimit(`widget:${key}:${clientIp(request)}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    throw new PipeError(429, 'limit_of_rate', 'Muitas requisições em pouco tempo. Tente de novo em instantes.');
  }
  return channel;
}

function authorizedVisitor(channel: ChannelResolved, visitorId: unknown, token: unknown): string {
  if (!validVisitor(visitorSecretOf(channel), visitorId, token)) throw PipeError.naoEncontrado('Visitante');
  return visitorId as string;
}

function cleanText(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '' || text.length > MAX_TEXT_LENGTH) {
    throw new PipeError(400, 'texto_invalido', `O texto deve ter de 1 a ${MAX_TEXT_LENGTH} caracteres.`);
  }
  return text;
}

@Controller('v1/widget/:key')
export class WidgetController {
  @Post('session')
  @HttpCode(201)
  async session(
    @Param('key') key: string,
    @Body() body: { visitorId?: string; token?: string; name?: string } | undefined,
    @Req() request: WidgetRequest,
  ): Promise<{ visitorId: string; token: string; greeting: string; channelName: string }> {
    const channel = await guard(key, request);
    const secret = visitorSecretOf(channel);
    const reuse = validVisitor(secret, body?.visitorId, body?.token);
    const visitorId = reuse ? (body!.visitorId as string) : randomUUID();
    const greeting = channel.config['greeting'];
    return {
      visitorId,
      token: reuse ? (body!.token as string) : visitorToken(secret, visitorId),
      greeting: typeof greeting === 'string' ? greeting : '',
      channelName: typeof channel.config['title'] === 'string' ? (channel.config['title'] as string) : 'Pipe Chat',
    };
  }

  @Post('messages')
  @HttpCode(202)
  async send(
    @Param('key') key: string,
    @Body() body: { visitorId?: string; token?: string; text?: string; name?: string } | undefined,
    @Req() request: WidgetRequest,
  ): Promise<{ accepted: true }> {
    const channel = await guard(key, request);
    const visitorId = authorizedVisitor(channel, body?.visitorId, body?.token);
    const text = cleanText(body?.text);
    const name = typeof body?.name === 'string' && body.name.trim() !== '' ? body.name.trim().slice(0, 80) : null;
    await widgetInbound(channel, visitorId, name, text);
    return { accepted: true };
  }

  @Get('messages')
  async poll(
    @Param('key') key: string,
    @Query('visitorId') visitorId: string | undefined,
    @Query('token') token: string | undefined,
    @Query('since') since: string | undefined,
    @Req() request: WidgetRequest,
  ): Promise<{ data: WidgetMessage[] }> {
    const channel = await guard(key, request);
    const visitor = authorizedVisitor(channel, visitorId, token);
    return { data: await widgetMessagesSince(channel, visitor, since ?? null) };
  }
}
