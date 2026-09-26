import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { noTenant } from '../database.js';
import { WithSession, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import { PipeError } from '../errors.js';
import {
  createLinkTracked,
  listarLinksRastreados,
  type LinkRastreado,
  type PeriodOfCount,
} from '../domain/rastreador-de-cliques.js';

/**
 * `/v1/gestao/fluxos/:fluxoId/links-rastreados` creates and reads short click-tracking links. It has a separate controller from `gestao-fluxo.ts` and follows the `mensagens-ativas.ts` shape.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOu404(value: string): string {
  if (!UUID.test(value)) throw PipeError.naoEncontrado('fluxo');
  return value;
}

function periodOfQuery(desde: string | undefined, ate: string | undefined): PeriodOfCount {
  const d = desde ? new Date(desde) : null;
  const a = ate ? new Date(ate) : null;
  return {
    since: d && !Number.isNaN(d.getTime()) ? d : null,
    ate: a && !Number.isNaN(a.getTime()) ? a : null,
  };
}

interface CorpoDeLink {
  name?: string;
  destination?: string;
}

@Controller('v1/management/flows/:flowId/links-tracked')
export class TrackedLinksController {
  @Get()
  @WithSession()
  async listar(
    @Req() request: RequestWithSession,
    @Param('flowId') flowId: string,
    @Query('desde') desde: string | undefined,
    @Query('to') ate: string | undefined,
  ): Promise<{ data: LinkRastreado[] }> {
    const session = sessionOf(request);
    uuidOu404(flowId);
    const data = await noTenant(session.tenantId, (tx) =>
      listarLinksRastreados(tx, session.tenantId, flowId, periodOfQuery(desde, ate)),
    );
    return { data };
  }

  @Post()
  @HttpCode(201)
  @WithSession()
  async create(
    @Req() requisicao: RequestWithSession,
    @Param('flowId') fluxoId: string,
    @Body() corpo: CorpoDeLink,
  ): Promise<LinkRastreado> {
    const sessao = sessionOf(requisicao);
    uuidOu404(fluxoId);
    if (!corpo.destination) {
      throw PipeError.request('destination_required', 'Informe a URL de destino.');
    }
    return noTenant(sessao.tenantId, (tx) =>
      createLinkTracked(tx, sessao.tenantId, fluxoId, {
        name: corpo.name ?? '',
        destination: corpo.destination!,
      }),
    );
  }
}
