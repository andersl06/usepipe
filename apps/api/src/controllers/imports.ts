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
import { WithSession, exigirPermission, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';

/**
 * A casca HTTP da importação de contatos. A regra mora em
 * `dominio/importacao-de-contatos.ts`; o trabalho, no worker.
 *
 * O CSV sobe como CORPO CRU de texto (`servidor.ts` monta o parser só nesta
 * rota, com teto de 20 MB), e o nome do arquivo em `?nome=`. É a mesma escolha
 * do upload de anexo: um arquivo cabe inteiro no corpo, sem `multer`.
 *
 * `crm.importar` ("Importar base de outro CRM"), que é de administrador e gestor.
 * O tenant é o da sessão; nada no corpo o escolhe.
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

  /** O relatório das linhas rejeitadas, com a coluna `erros`, para baixar. */
  @Get(':id/falhas')
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
  return noTenant(tenantId, (tx) => exigirPermission(tx, userId, 'crm.importar'));
}
