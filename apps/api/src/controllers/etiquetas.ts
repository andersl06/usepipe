import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { noTenant } from '../database.js';
import { KeyOrSession, atorDe } from '../authentication.js';
import type { RequestAuthenticated } from '../authentication.js';
import { WithSession, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import {
  unlabelContact,
  unlabelConversation,
  labelContact,
  labelConversation,
  listLabelsOfContact,
  listarEtiquetasDoTenant,
} from '../domain/etiquetas.js';
import type { LabelOfContact, EtiquetaDoTenant } from '../domain/etiquetas.js';
import { PipeError } from '../errors.js';

/**
 * Tenant tag catalog and application to open conversations and contacts. Three small resources share one file, as in `catalogo.ts`, because they expose the same `dominio/etiquetas.ts` rule through three URLs. Closure stays at `POST /v1/conversas/:id/encerrar` with required-tag policy. Conversation and contact tagging accept a key or session (`ChaveOuSessao`): an integration needs a key with scope; a signed-in person needs `conversa.etiquetar` or `contato.editar`, and must own the conversation.
 */

interface CorpoDeEtiqueta {
  etiqueta_id?: string;
}

function etiquetaIdDe(corpo: CorpoDeEtiqueta | undefined): string {
  const id = corpo?.etiqueta_id;
  if (!id || typeof id !== 'string') {
    throw PipeError.request('label_required', 'Informe `etiqueta_id`.');
  }
  return id;
}

@Controller('v1/etiquetas')
export class LabelsController {
  /** `?escopo=conversa|contato` filtra pelas que cabem no alvo (`ambos` entra nos dois). */
  @Get()
  @WithSession()
  listar(
    @Req() requisicao: RequestWithSession,
    @Query('escopo') scope?: string,
  ): Promise<{ etiquetas: EtiquetaDoTenant[] }> {
    const session = sessionOf(requisicao);
    if (scope !== undefined && scope !== 'conversa' && scope !== 'contato') {
      throw PipeError.request('scope_invalid', 'Escopo aceito: conversa ou contato.');
    }
    return noTenant(session.tenantId, async (tx) => ({
      etiquetas: await listarEtiquetasDoTenant(tx, scope ?? null),
    }));
  }
}

@Controller('v1/conversations/:id/labels')
export class ConversationLabelsController {
  @Post()
  @HttpCode(201)
  @KeyOrSession('conversas:escrever')
  async aplicar(
    @Req() requisicao: RequestAuthenticated & RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: CorpoDeEtiqueta,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const r = await labelConversation(
      { tenantId: ator.tenantId, agentId: ator.userId, exigirAssignment: ator.viaSession },
      id,
      etiquetaIdDe(corpo),
    );
    return { etiqueta_id: r.etiquetaId, nome: r.name, aplicada: r.aplicada };
  }

  @Delete(':labelId')
  @HttpCode(200)
  @KeyOrSession('conversas:escrever')
  async remover(
    @Req() requisicao: RequestAuthenticated & RequestWithSession,
    @Param('id') id: string,
    @Param('labelId') etiquetaId: string,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const r = await unlabelConversation(
      { tenantId: ator.tenantId, agentId: ator.userId, exigirAssignment: ator.viaSession },
      id,
      etiquetaId,
    );
    return { removida: r.removida };
  }
}

@Controller('v1/contacts/:id/labels')
export class ContactLabelsController {
  @Get()
  @KeyOrSession('contatos:ler')
  listar(
    @Req() request: RequestAuthenticated & RequestWithSession,
    @Param('id') id: string,
  ): Promise<{ etiquetas: LabelOfContact[] }> {
    const ator = atorDe(request);
    return noTenant(ator.tenantId, async (tx) => ({
      etiquetas: await listLabelsOfContact(tx, id),
    }));
  }

  @Post()
  @HttpCode(201)
  @KeyOrSession('contatos:escrever')
  async aplicar(
    @Req() requisicao: RequestAuthenticated & RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: CorpoDeEtiqueta,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const r = await labelContact(ator, id, etiquetaIdDe(corpo));
    return { etiqueta_id: r.etiquetaId, nome: r.name, aplicada: r.aplicada };
  }

  @Delete(':labelId')
  @HttpCode(200)
  @KeyOrSession('contatos:escrever')
  async remover(
    @Req() requisicao: RequestAuthenticated & RequestWithSession,
    @Param('id') id: string,
    @Param('labelId') etiquetaId: string,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const r = await unlabelContact(ator, id, etiquetaId);
    return { removida: r.removida };
  }
}
