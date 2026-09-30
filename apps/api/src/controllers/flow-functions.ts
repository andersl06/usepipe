import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { FlowFunction, FlowFunctionInput, FlowFunctionUsage } from '@pipe/contracts';
import { noTenant } from '../database.js';
import { WithSession, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import {
  createFlowFunction, deleteFlowFunction, functionUsage, getFlowFunction, listFlowFunctions, updateFlowFunction,
} from '../domain/management/flow-functions.js';

/** The account's (tenant's) function library, shared by every flow (P10, D-57). */
@Controller('v1/management/flow-functions')
@WithSession()
export class FlowFunctionsController {
  @Get()
  async list(@Req() request: RequestWithSession, @Query('search') search?: string, @Query('limit') limit?: string, @Query('offset') offset?: string): Promise<FlowFunction[]> {
    const session = sessionOf(request);
    return noTenant(session.tenantId, (tx) => listFlowFunctions(tx, session.userId, {
      search, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined,
    }));
  }

  @Get(':id')
  async get(@Req() request: RequestWithSession, @Param('id') id: string): Promise<FlowFunction> {
    const session = sessionOf(request);
    return noTenant(session.tenantId, (tx) => getFlowFunction(tx, session.userId, id));
  }

  /** Flows that use the function, for the Builder's "em uso em outros bots" warning. */
  @Get(':id/usage')
  async usage(@Req() request: RequestWithSession, @Param('id') id: string): Promise<FlowFunctionUsage[]> {
    const session = sessionOf(request);
    return noTenant(session.tenantId, (tx) => functionUsage(tx, session.userId, id));
  }

  @Post()
  async create(@Req() request: RequestWithSession, @Body() body: FlowFunctionInput): Promise<FlowFunction> {
    const session = sessionOf(request);
    return noTenant(session.tenantId, (tx) => createFlowFunction(tx, session.userId, body));
  }

  @Put(':id')
  async update(@Req() request: RequestWithSession, @Param('id') id: string, @Body() body: FlowFunctionInput): Promise<FlowFunction> {
    const session = sessionOf(request);
    return noTenant(session.tenantId, (tx) => updateFlowFunction(tx, session.userId, id, body));
  }

  @Delete(':id')
  async remove(@Req() request: RequestWithSession, @Param('id') id: string): Promise<void> {
    const session = sessionOf(request);
    return noTenant(session.tenantId, (tx) => deleteFlowFunction(tx, session.userId, id));
  }
}
