import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { noTenant } from '../database.js';
import {
  createImport,
  lerFalhas,
  readImport,
  listImports,
} from '../domain/import-of-contacts.js';
import type { ImportVisible } from '../domain/import-of-contacts.js';
import { WithSession, requirePermission, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';

/**
 * HTTP adapter for contact import. The rule lives in `dominio/importacao-de-contatos.ts`; the worker performs the job. Upload CSV as a raw text body: `servidor.ts` installs the parser only on this route, with a 20 MB limit; pass the filename in `?nome=`. As with attachment uploads, one file fits in the request body without `multer`. Require `crm.importar` ("Importar base de outro CRM") for administrators and managers. The tenant comes from the session, never the body.
 */
@Controller('v1/contacts/imports')
export class ContactImportsController {
  @Post()
  @HttpCode(201)
  @WithSession()
  async import(
    @Req() request: RequestWithSession,
    @Body() corpo: unknown,
    @Query('nome') nome: string | undefined,
  ): Promise<ImportVisible> {
    const session = sessionOf(request);
    await permitido(session.tenantId, session.userId);
    return createImport(
      session.tenantId,
      session.userId,
      typeof corpo === 'string' ? corpo : undefined,
      nome,
    );
  }

  @Get()
  @WithSession()
  async listar(@Req() requisicao: RequestWithSession): Promise<{ imports: ImportVisible[] }> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId);
    return { imports: await listImports(sessao.tenantId) };
  }

  @Get(':id')
  @WithSession()
  async ler(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<ImportVisible> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId);
    return readImport(sessao.tenantId, id);
  }

  /** Download the rejected-row report with its `erros` column. */
  @Get(':id/failures')
  @WithSession()
  async falhas(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Res() resposta: Response,
  ): Promise<void> {
    const sessao = sessionOf(requisicao);
    await permitido(sessao.tenantId, sessao.userId);
    const csv = await lerFalhas(sessao.tenantId, id);
    resposta.setHeader('content-type', 'text/csv; charset=utf-8');
    resposta.setHeader('content-disposition', `attachment; filename="rejeitadas-${id}.csv"`);
    resposta.setHeader('x-content-type-options', 'nosniff');
    resposta.send(csv);
  }
}

function permitido(tenantId: string, userId: string): Promise<void> {
  return noTenant(tenantId, (tx) => requirePermission(tx, userId, 'crm.importar'));
}
