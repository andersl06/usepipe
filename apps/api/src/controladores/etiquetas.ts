import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { noTenant } from '../banco.js';
import { ChaveOuSessao, atorDe } from '../autenticacao.js';
import type { RequisicaoAutenticada } from '../autenticacao.js';
import { ComSessao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';
import {
  desetiquetarContato,
  desetiquetarConversa,
  etiquetarContato,
  etiquetarConversa,
  listarEtiquetasDoContato,
  listarEtiquetasDoTenant,
} from '../dominio/etiquetas.js';
import type { EtiquetaDoContato, EtiquetaDoTenant } from '../dominio/etiquetas.js';
import { ErroPipe } from '../erros.js';

/**
 * Etiquetas — o catálogo do tenant e a aplicação em conversa ABERTA e em contato.
 *
 * Três recursos pequenos num arquivo só, como `catalogo.ts`: são a mesma regra
 * (`dominio/etiquetas.ts`) vista de três URLs. Encerrar com etiqueta continua em
 * `POST /v1/conversas/:id/encerrar` — a etiqueta de encerramento é obrigatória lá e
 * opcional aqui, e é a única diferença entre os dois gestos.
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
    throw ErroPipe.requisicao('etiqueta_obrigatoria', 'Informe `etiqueta_id`.');
  }
  return id;
}

@Controller('v1/etiquetas')
export class ControladorEtiquetas {
  /** `?escopo=conversa|contato` filtra pelas que cabem no alvo (`ambos` entra nos dois). */
  @Get()
  @ComSessao()
  listar(
    @Req() requisicao: RequisicaoComSessao,
    @Query('escopo') escopo?: string,
  ): Promise<{ etiquetas: EtiquetaDoTenant[] }> {
    const sessao = sessaoDe(requisicao);
    if (escopo !== undefined && escopo !== 'conversa' && escopo !== 'contato') {
      throw ErroPipe.requisicao('escopo_invalido', 'Escopo aceito: conversa ou contato.');
    }
    return noTenant(sessao.tenantId, async (tx) => ({
      etiquetas: await listarEtiquetasDoTenant(tx, escopo ?? null),
    }));
  }
}

@Controller('v1/conversas/:id/etiquetas')
export class ControladorEtiquetasDaConversa {
  @Post()
  @HttpCode(201)
  @ChaveOuSessao('conversas:escrever')
  async aplicar(
    @Req() requisicao: RequisicaoAutenticada & RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: CorpoDeEtiqueta,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const r = await etiquetarConversa(
      { tenantId: ator.tenantId, atendenteId: ator.usuarioId, exigirAtribuicao: ator.viaSessao },
      id,
      etiquetaIdDe(corpo),
    );
    return { etiqueta_id: r.etiquetaId, nome: r.nome, aplicada: r.aplicada };
  }

  @Delete(':etiquetaId')
  @HttpCode(200)
  @ChaveOuSessao('conversas:escrever')
  async remover(
    @Req() requisicao: RequisicaoAutenticada & RequisicaoComSessao,
    @Param('id') id: string,
    @Param('etiquetaId') etiquetaId: string,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const r = await desetiquetarConversa(
      { tenantId: ator.tenantId, atendenteId: ator.usuarioId, exigirAtribuicao: ator.viaSessao },
      id,
      etiquetaId,
    );
    return { removida: r.removida };
  }
}

@Controller('v1/contatos/:id/etiquetas')
export class ControladorEtiquetasDoContato {
  @Get()
  @ChaveOuSessao('contatos:ler')
  listar(
    @Req() requisicao: RequisicaoAutenticada & RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<{ etiquetas: EtiquetaDoContato[] }> {
    const ator = atorDe(requisicao);
    return noTenant(ator.tenantId, async (tx) => ({
      etiquetas: await listarEtiquetasDoContato(tx, id),
    }));
  }

  @Post()
  @HttpCode(201)
  @ChaveOuSessao('contatos:escrever')
  async aplicar(
    @Req() requisicao: RequisicaoAutenticada & RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: CorpoDeEtiqueta,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const r = await etiquetarContato(ator, id, etiquetaIdDe(corpo));
    return { etiqueta_id: r.etiquetaId, nome: r.nome, aplicada: r.aplicada };
  }

  @Delete(':etiquetaId')
  @HttpCode(200)
  @ChaveOuSessao('contatos:escrever')
  async remover(
    @Req() requisicao: RequisicaoAutenticada & RequisicaoComSessao,
    @Param('id') id: string,
    @Param('etiquetaId') etiquetaId: string,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const r = await desetiquetarContato(ator, id, etiquetaId);
    return { removida: r.removida };
  }
}
