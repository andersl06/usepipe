import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Always return structured errors (`apis.md` §5.6): never HTTP 200 with `status: failure` in the body, a common Blip trap. Use the correct HTTP status and `{ "erro": { "codigo", "mensagem" } }` so clients can distinguish failure without inspecting success bodies.
 */
export class PipeError extends Error {
  readonly codigo: string;
  readonly status: number;
  readonly detalhe: Record<string, unknown> | undefined;

  constructor(
    status: number,
    codigo: string,
    message: string,
    detalhe?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ErroPipe';
    this.codigo = codigo;
    this.status = status;
    this.detalhe = detalhe;
  }

  static request(codigo: string, mensagem: string, detalhe?: Record<string, unknown>): PipeError {
    return new PipeError(400, codigo, mensagem, detalhe);
  }

  static naoAutorizado(mensagem = 'Chave de API ausente ou inválida.'): PipeError {
    return new PipeError(401, 'not_authorized', mensagem);
  }

  static withoutScope(scope: string): PipeError {
    return new PipeError(403, 'without_scope', `A chave não tem o escopo "${scope}".`, { scope });
  }

  /** Companion to `semEscopo` for logged-in people: scope belongs to API keys, permission to people. */
  static withoutPermission(codigo: string): PipeError {
    return new PipeError(403, 'without_permission', `Você não tem a permissão "${codigo}".`, {
      permissao: codigo,
    });
  }

  static naoEncontrado(oQue: string): PipeError {
    return new PipeError(404, 'not_found', `${oQue} não encontrado.`);
  }

  static conflito(codigo: string, mensagem: string, detalhe?: Record<string, unknown>): PipeError {
    return new PipeError(409, codigo, mensagem, detalhe);
  }
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const resposta = host.switchToHttp().getResponse<Response>();

    if (exception instanceof PipeError) {
      resposta.status(exception.status).json({
        error: {
          code: exception.codigo,
          message: exception.message,
          ...(exception.detalhe ? { detalhe: exception.detalhe } : {}),
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const corpo = exception.getResponse();
      resposta.status(exception.getStatus()).json({
        error: {
          code: 'http',
          message: typeof corpo === 'string' ? corpo : exception.message,
        },
      });
      return;
    }

    // `body-parser` rejects oversized bodies before Nest; report a client error, not 500.
    if ((exception as { type?: string } | null)?.type === 'entity.too.large') {
      resposta.status(413).json({ error: { code: 'corpo_grande', message: 'O corpo da requisição é grande demais.' } });
      return;
    }

    // Do not expose unexpected stack traces to clients; log the full error internally.
    console.error('[api] erro não tratado', exception);
    resposta.status(500).json({
      error: { code: 'erro_interno', message: 'Erro interno.' },
    });
  }
}
