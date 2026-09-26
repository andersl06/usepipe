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
 * `/v1/anexos` uploads files and serves them through signed links. Uploads use the raw request body, with the type in `Content-Type` and the name in `?nome=`, like S3 `PUT Object`; this avoids `multer`. Downloads require neither a session nor an API key: the URL signature proves access. Meta downloads media from our links without our cookie, so the link expires after 15 minutes, matching Blip's *file token*.
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

    // `Content-Type` is only the declared type. `guardarAnexo` determines the type from the bytes;
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
      // The attachment's tenant is resolved using the owner role because the read occurs
      // before a tenant is established, as with a webhook channel. The lookup
      // returns only `tenant_id`, and nothing else.
      async (attachmentId) => {
        if (!/^[0-9a-f-]{36}$/i.test(attachmentId)) return null;
        const { rows } = await databaseOwner().execute<{ tenant_id: string }>(
          sql`select tenant_id from anexo where id = ${attachmentId}::uuid limit 1`,
        );
        return rows[0] ? { tenantId: rows[0].tenant_id } : null;
      },
    );

    // Always serve HTML and SVG as downloads, never inline: serving them with their own
    // type on our domain would execute scripts in the opener's session.
    const layout = anexo.asAttachment ? 'attachment' : 'inline';
    const nome = (anexo.nomeOriginal ?? 'arquivo').replace(/["\r\n]/g, '');

    resposta.setHeader('content-type', anexo.asAttachment ? 'application/octet-stream' : anexo.mime);
    resposta.setHeader('content-disposition', `${layout}; filename="${nome}"`);
    resposta.setHeader('content-length', String(anexo.data.byteLength));
    // Never use a shared cache: the signed URL is temporary, and a proxy
    // guardando a resposta serviria o arquivo depois do link vencer.
    resposta.setHeader('cache-control', 'private, max-age=300');
    resposta.setHeader('x-content-type-options', 'nosniff');
    resposta.end(Buffer.from(anexo.data));
  }
}
