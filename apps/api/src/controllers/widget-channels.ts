import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { noTenant } from '../database.js';
import { WithSession, requirePermission, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import {
  createWidgetChannel,
  listWidgetChannels,
  updateWidgetChannel,
  type WidgetChannelVisible,
} from '../domain/widget.js';

/**
 * Pipe Chat channel provisioning for tenant admins. Responses expose the public key but never the visitor-token secret.
 */
interface WidgetChannelBody {
  name?: string;
  allowedOrigins?: unknown;
  greeting?: string;
  rotateKey?: boolean;
}

@Controller('v1/management/widget-channels')
export class WidgetChannelsController {
  @Get()
  @WithSession()
  async list(@Req() request: RequestWithSession): Promise<{ data: WidgetChannelVisible[] }> {
    const session = sessionOf(request);
    await allowed(session.tenantId, session.userId);
    return { data: await listWidgetChannels(session.tenantId) };
  }

  @Post()
  @HttpCode(201)
  @WithSession()
  async create(@Req() request: RequestWithSession, @Body() body: WidgetChannelBody): Promise<WidgetChannelVisible> {
    const session = sessionOf(request);
    await allowed(session.tenantId, session.userId);
    return createWidgetChannel(session.tenantId, session.userId, {
      name: body?.name,
      allowedOrigins: body?.allowedOrigins,
      greeting: body?.greeting,
    });
  }

  @Patch(':id')
  @WithSession()
  async update(
    @Req() request: RequestWithSession,
    @Param('id') id: string,
    @Body() body: WidgetChannelBody,
  ): Promise<WidgetChannelVisible> {
    const session = sessionOf(request);
    await allowed(session.tenantId, session.userId);
    return updateWidgetChannel(session.tenantId, session.userId, id, {
      name: body?.name,
      allowedOrigins: body?.allowedOrigins,
      greeting: body?.greeting,
      rotateKey: body?.rotateKey === true,
    });
  }
}

function allowed(tenantId: string, userId: string): Promise<void> {
  return noTenant(tenantId, (tx) => requirePermission(tx, userId, 'canal.gerenciar'));
}
