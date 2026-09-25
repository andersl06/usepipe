import { Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Response } from 'express';
import { MAX_FILES_BY_MESSAGE } from '@pipe/storage';
import { KeyOrSession, atorDe } from '../authentication.js';
import type { RequestAuthenticated } from '../authentication.js';
import { databaseOwner } from '../database.js';
import { saveAttachment, readAttachmentSigned } from '../domain/attachment.js';
import { PipeError } from '../errors.js';
import type { RequestWithSession } from '../session.js';

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

@Controller('v1/attachments')
export class AttachmentsController {
  @Post()
  @HttpCode(201)
  @KeyOrSession('mensagens:escrever')
  async up(
    @Req() request: RequestAuthenticated & RequestWithSession,
    @Query('nome') nome: string | undefined,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(request);
    const corpo = request.body as unknown;
    if (!Buffer.isBuffer(corpo) || corpo.byteLength === 0) {
      throw PipeError.request('file_empty', 'Mande o arquivo no corpo da requisição.');
    }

    // O `Content-Type` é só o DECLARADO. Quem decide o tipo são os bytes, dentro de
    // `guardarAnexo` — aqui ele nem chega a ser confiado.
    const declarado = (request.header('content-type') ?? '').split(';')[0]?.trim() ?? '';

    const attachment = await saveAttachment({
      tenantId: ator.tenantId,
      nomeOriginal: nome?.slice(0, 255) ?? null,
      mimeDeclarado: declarado,
      data: new Uint8Array(corpo),
    });

    return {
      id: attachment.id,
      mime: attachment.mime,
      bytes: attachment.bytes,
      tipo: attachment.tipo,
      link: attachment.link,
      maxByMessage: MAX_FILES_BY_MESSAGE,
    };
  }

  @Get(':id')
  async baixar(
    @Param('id') id: string,
    @Query('expires') expira: string | undefined,
    @Query('signature') assinatura: string | undefined,
    @Res() resposta: Response,
  ): Promise<void> {
    const anexo = await readAttachmentSigned(
      id,
      Number(expira ?? 0),
      assinatura ?? '',
      // O tenant do anexo é resolvido pelo papel dono, porque a leitura acontece
      // ANTES de haver tenant em vigor — é a mesma lacuna do canal do webhook, e
      // devolve só o `tenant_id`, nada mais.
      async (attachmentId) => {
        if (!/^[0-9a-f-]{36}$/i.test(attachmentId)) return null;
        const { rows } = await databaseOwner().execute<{ tenant_id: string }>(
          sql`select tenant_id from anexo where id = ${attachmentId}::uuid limit 1`,
        );
        return rows[0] ? { tenantId: rows[0].tenant_id } : null;
      },
    );

    // HTML e SVG saem SEMPRE como download, nunca inline: servi-los com o próprio
    // tipo, no nosso domínio, é entregar execução de script na sessão de quem abriu.
    const layout = anexo.asAttachment ? 'attachment' : 'inline';
    const nome = (anexo.nomeOriginal ?? 'arquivo').replace(/["\r\n]/g, '');

    resposta.setHeader('content-type', anexo.asAttachment ? 'application/octet-stream' : anexo.mime);
    resposta.setHeader('content-disposition', `${layout}; filename="${nome}"`);
    resposta.setHeader('content-length', String(anexo.data.byteLength));
    // Nunca em cache compartilhado: a URL é assinada e temporária, e um proxy
    // guardando a resposta serviria o arquivo depois do link vencer.
    resposta.setHeader('cache-control', 'private, max-age=300');
    resposta.setHeader('x-content-type-options', 'nosniff');
    resposta.end(Buffer.from(anexo.data));
  }
}
