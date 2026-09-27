import { Controller, Get, Query, Req } from '@nestjs/common';
import type { SatisfactionSurveyPage, SatisfactionSurveyQuery } from '@pipe/contracts';
import { noTenant } from '../database.js';
import { WithSession, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import { listSatisfactionResponses } from '../domain/management/satisfaction-surveys.js';

/**
 * Query endpoint for BUILDER-03's native satisfaction survey (`relatorio.ver`), so the future
 * Analytics screen has a Pipe-native contract to read (D-08.5). Tenant always comes from the
 * session, never the URL.
 */
@Controller('v1/management/satisfaction-surveys')
export class SatisfactionSurveysController {
  @Get('responses')
  @WithSession()
  async responses(
    @Req() request: RequestWithSession,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('queueId') queueId?: string,
    @Query('agentId') agentId?: string,
    @Query('rating') rating?: string,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<SatisfactionSurveyPage> {
    const session = sessionOf(request);
    const query: SatisfactionSurveyQuery = {
      from,
      to,
      queueId,
      agentId,
      rating: rating !== undefined ? Number(rating) : undefined,
      search,
      cursor,
      limit: limit !== undefined ? Number(limit) : undefined,
    };
    return noTenant(session.tenantId, (tx) => listSatisfactionResponses(tx, session.userId, query));
  }
}
