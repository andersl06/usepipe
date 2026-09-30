import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { noTenant } from '../database.js';
import { WithSession, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import {
  createKnowledgeBase,
  createKnowledgeDocument,
  deleteKnowledgeBase,
  deleteKnowledgeDocument,
  getKnowledgeDocument,
  listKnowledgeBases,
  listKnowledgeDocuments,
  updateKnowledgeBase,
  updateKnowledgeDocument,
  type KnowledgeBase,
  type KnowledgeBaseInput,
  type KnowledgeDocument,
  type KnowledgeDocumentDetail,
  type KnowledgeDocumentInput,
} from '../domain/knowledge/bases.js';

/**
 * The account's knowledge bases (P15): bases, their documents (text ingestion) and passages. Rules
 * live in `domain/knowledge/bases.ts`; the AI agent's `KnowledgeBaseConsult` and the
 * `ProcessContentAssistant` action search them (`domain/knowledge/search.ts`).
 */
@Controller('v1/management/knowledge-bases')
@WithSession()
export class ManagementKnowledgeController {
  @Get()
  async list(@Req() request: RequestWithSession): Promise<KnowledgeBase[]> {
    const session = sessionOf(request);
    return noTenant(session.tenantId, (tx) => listKnowledgeBases(tx, session.userId, session.tenantId));
  }

  @Post()
  async create(@Req() request: RequestWithSession, @Body() body: KnowledgeBaseInput): Promise<KnowledgeBase> {
    const session = sessionOf(request);
    return noTenant(session.tenantId, (tx) => createKnowledgeBase(tx, session.userId, session.tenantId, body ?? {}));
  }

  @Patch(':baseId')
  async update(@Req() request: RequestWithSession, @Param('baseId') baseId: string, @Body() body: KnowledgeBaseInput): Promise<KnowledgeBase> {
    const session = sessionOf(request);
    return noTenant(session.tenantId, (tx) => updateKnowledgeBase(tx, session.userId, session.tenantId, baseId, body ?? {}));
  }

  @Delete(':baseId')
  @HttpCode(204)
  async remove(@Req() request: RequestWithSession, @Param('baseId') baseId: string): Promise<void> {
    const session = sessionOf(request);
    await noTenant(session.tenantId, (tx) => deleteKnowledgeBase(tx, session.userId, session.tenantId, baseId));
  }

  @Get(':baseId/documents')
  async documents(@Req() request: RequestWithSession, @Param('baseId') baseId: string): Promise<KnowledgeDocument[]> {
    const session = sessionOf(request);
    return noTenant(session.tenantId, (tx) => listKnowledgeDocuments(tx, session.userId, session.tenantId, baseId));
  }

  @Get(':baseId/documents/:documentId')
  async document(
    @Req() request: RequestWithSession,
    @Param('baseId') baseId: string,
    @Param('documentId') documentId: string,
  ): Promise<KnowledgeDocumentDetail> {
    const session = sessionOf(request);
    return noTenant(session.tenantId, (tx) => getKnowledgeDocument(tx, session.userId, session.tenantId, baseId, documentId));
  }

  /** Ingestion: `{title, body, tags?}`; the body is plain text (a .txt/.md file's content). */
  @Post(':baseId/documents')
  async createDocument(
    @Req() request: RequestWithSession,
    @Param('baseId') baseId: string,
    @Body() body: KnowledgeDocumentInput,
  ): Promise<KnowledgeDocument> {
    const session = sessionOf(request);
    return noTenant(session.tenantId, (tx) => createKnowledgeDocument(tx, session.userId, session.tenantId, baseId, body ?? {}));
  }

  @Patch(':baseId/documents/:documentId')
  async updateDocument(
    @Req() request: RequestWithSession,
    @Param('baseId') baseId: string,
    @Param('documentId') documentId: string,
    @Body() body: KnowledgeDocumentInput,
  ): Promise<KnowledgeDocument> {
    const session = sessionOf(request);
    return noTenant(session.tenantId, (tx) =>
      updateKnowledgeDocument(tx, session.userId, session.tenantId, baseId, documentId, body ?? {}),
    );
  }

  @Delete(':baseId/documents/:documentId')
  @HttpCode(204)
  async removeDocument(
    @Req() request: RequestWithSession,
    @Param('baseId') baseId: string,
    @Param('documentId') documentId: string,
  ): Promise<void> {
    const session = sessionOf(request);
    await noTenant(session.tenantId, (tx) => deleteKnowledgeDocument(tx, session.userId, session.tenantId, baseId, documentId));
  }
}
