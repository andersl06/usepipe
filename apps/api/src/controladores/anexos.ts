import { Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Response } from 'express';
import { MAX_ARQUIVOS_POR_MENSAGEM } from '@pipe/armazenamento';
import { ChaveOuSessao, atorDe } from '../autenticacao.js';
import type { RequisicaoAutenticada } from '../autenticacao.js';
import { bancoDono } from '../banco.js';
import { guardarAnexo, lerAnexoAssinado } from '../dominio/anexo.js';
import { ErroPipe } from '../erros.js';
import type { RequisicaoComSessao } from '../sessao.js';

/**
 * `/v1/anexos` — subir arquivo e servi-lo por link assinado.
 *
 * O upload é **corpo cru**, com o tipo no `Content-Type` e o nome em `?nome=`. É a
 * forma do `PUT Object` do S3 e dispensa `multer`.
 *
 * A leitura **não exige credencial de sessão nem chave**: quem prova o direito é a
 * assinatura na própria URL. Tem de ser assim porque a Meta baixa a mídia do nosso
 * link e não tem cookie nosso — e é por isso que a validade é curta (15 minutos, o
 * mesmo *file token* da Blip).
 */

@Controller('v1/anexos')
export class ControladorAnexos {
  @Post()
  @HttpCode(201)
  @ChaveOuSessao('mensagens:escrever')
  async subir(
    @Req() requisicao: RequisicaoAutenticada & RequisicaoComSessao,
    @Query('nome') nome: string | undefined,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const corpo = requisicao.body as unknown;
    if (!Buffer.isBuffer(corpo) || corpo.byteLength === 0) {
      throw ErroPipe.requisicao('arquivo_vazio', 'Mande o arquivo no corpo da requisição.');
    }

    // O `Content-Type` é só o DECLARADO. Quem decide o tipo são os bytes, dentro de
    // `guardarAnexo` — aqui ele nem chega a ser confiado.
    const declarado = (requisicao.header('content-type') ?? '').split(';')[0]?.trim() ?? '';

    const anexo = await guardarAnexo({
      tenantId: ator.tenantId,
      nomeOriginal: nome?.slice(0, 255) ?? null,
      mimeDeclarado: declarado,
      dados: new Uint8Array(corpo),
    });

    return {
      id: anexo.id,
      mime: anexo.mime,
      bytes: anexo.bytes,
      tipo: anexo.tipo,
      link: anexo.link,
      max_por_mensagem: MAX_ARQUIVOS_POR_MENSAGEM,
    };
  }

  @Get(':id')
  async baixar(
    @Param('id') id: string,
    @Query('expira') expira: string | undefined,
    @Query('assinatura') assinatura: string | undefined,
    @Res() resposta: Response,
  ): Promise<void> {
    const anexo = await lerAnexoAssinado(
      id,
      Number(expira ?? 0),
      assinatura ?? '',
      // O tenant do anexo é resolvido pelo papel dono, porque a leitura acontece
      // ANTES de haver tenant em vigor — é a mesma lacuna do canal do webhook, e
      // devolve só o `tenant_id`, nada mais.
      async (anexoId) => {
        if (!/^[0-9a-f-]{36}$/i.test(anexoId)) return null;
        const { rows } = await bancoDono().execute<{ tenant_id: string }>(
          sql`select tenant_id from anexo where id = ${anexoId}::uuid limit 1`,
        );
        return rows[0] ? { tenantId: rows[0].tenant_id } : null;
      },
    );

    // HTML e SVG saem SEMPRE como download, nunca inline: servi-los com o próprio
    // tipo, no nosso domínio, é entregar execução de script na sessão de quem abriu.
    const disposicao = anexo.comoAnexo ? 'attachment' : 'inline';
    const nome = (anexo.nomeOriginal ?? 'arquivo').replace(/["\r\n]/g, '');

    resposta.setHeader('content-type', anexo.comoAnexo ? 'application/octet-stream' : anexo.mime);
    resposta.setHeader('content-disposition', `${disposicao}; filename="${nome}"`);
    resposta.setHeader('content-length', String(anexo.dados.byteLength));
    // Nunca em cache compartilhado: a URL é assinada e temporária, e um proxy
    // guardando a resposta serviria o arquivo depois do link vencer.
    resposta.setHeader('cache-control', 'private, max-age=300');
    resposta.setHeader('x-content-type-options', 'nosniff');
    resposta.end(Buffer.from(anexo.dados));
  }
}
