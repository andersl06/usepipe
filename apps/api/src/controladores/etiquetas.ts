import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { noTenant } from '../banco.js';
import { KeyOrSession, atorDe } from '../autenticacao.js';
import type { RequestAuthenticated } from '../autenticacao.js';
import { WithSession, sessionOf } from '../sessao.js';
import type { RequestWithSession } from '../sessao.js';
import {
  unlabelContact,
  unlabelConversation,
  labelContact,
  labelConversation,
  listLabelsOfContact,
  listarEtiquetasDoTenant,
} from '../dominio/etiquetas.js';
import type { LabelOfContact, EtiquetaDoTenant } from '../dominio/etiquetas.js';
import { PipeError } from '../erros.js';

/**
 * Etiquetas — o catálogo do tenant e a aplicação em conversa ABERTA e em contato.
 *
 * Três recursos pequenos num arquivo só, como `catalogo.ts`: são a mesma regra
 * (`dominio/etiquetas.ts`) vista de três URLs. O encerramento continua em
 * `POST /v1/conversas/:id/encerrar`; sua lista segue a política de tags obrigatórias.
 *
 * Conversa e contato aceitam chave OU sessão (`ChaveOuSessao`), como o envio: uma
 * integração pode etiquetar por chave com escopo; gente logada passa pela permissão
 * (`conversa.etiquetar` / `contato.editar`) e, na conversa, tem de ser o dono.
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

@Controller('v1/conversas/:id/etiquetas')
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
    return { etiqueta_id: r.etiquetaId, nome: r.nome, aplicada: r.aplicada };
  }

  @Delete(':etiquetaId')
  @HttpCode(200)
  @KeyOrSession('conversas:escrever')
  async remover(
    @Req() requisicao: RequestAuthenticated & RequestWithSession,
    @Param('id') id: string,
    @Param('etiquetaId') etiquetaId: string,
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

@Controller('v1/contatos/:id/etiquetas')
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
    return { etiqueta_id: r.etiquetaId, nome: r.nome, aplicada: r.aplicada };
  }

  @Delete(':etiquetaId')
  @HttpCode(200)
  @KeyOrSession('contatos:escrever')
  async remover(
    @Req() requisicao: RequestAuthenticated & RequestWithSession,
    @Param('id') id: string,
    @Param('etiquetaId') etiquetaId: string,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const r = await unlabelContact(ator, id, etiquetaId);
    return { removida: r.removida };
  }
}
