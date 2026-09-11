import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { noTenant } from '../banco.js';
import {
  criarImportacao,
  lerFalhas,
  lerImportacao,
  listarImportacoes,
} from '../dominio/importacao-de-contatos.js';
import type { ImportacaoVisivel } from '../dominio/importacao-de-contatos.js';
import { ComSessao, exigirPermissao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';

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
@Controller('v1/contatos/importacoes')
export class ControladorImportacoesDeContatos {
  @Post()
  @HttpCode(201)
  @ComSessao()
  async importar(
    @Req() requisicao: RequisicaoComSessao,
    @Body() corpo: unknown,
    @Query('nome') nome: string | undefined,
  ): Promise<ImportacaoVisivel> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId);
    return criarImportacao(
      sessao.tenantId,
      sessao.usuarioId,
      typeof corpo === 'string' ? corpo : undefined,
      nome,
    );
  }

  @Get()
  @ComSessao()
  async listar(@Req() requisicao: RequisicaoComSessao): Promise<{ importacoes: ImportacaoVisivel[] }> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId);
    return { importacoes: await listarImportacoes(sessao.tenantId) };
  }

  @Get(':id')
  @ComSessao()
  async ler(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<ImportacaoVisivel> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId);
    return lerImportacao(sessao.tenantId, id);
  }

  /** O relatório das linhas rejeitadas, com a coluna `erros`, para baixar. */
  @Get(':id/falhas')
  @ComSessao()
  async falhas(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Res() resposta: Response,
  ): Promise<void> {
    const sessao = sessaoDe(requisicao);
    await permitido(sessao.tenantId, sessao.usuarioId);
    const csv = await lerFalhas(sessao.tenantId, id);
    resposta.setHeader('content-type', 'text/csv; charset=utf-8');
    resposta.setHeader('content-disposition', `attachment; filename="rejeitadas-${id}.csv"`);
    resposta.setHeader('x-content-type-options', 'nosniff');
    resposta.send(csv);
  }
}

function permitido(tenantId: string, usuarioId: string): Promise<void> {
  return noTenant(tenantId, (tx) => exigirPermissao(tx, usuarioId, 'crm.importar'));
}
