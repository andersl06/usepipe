import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Erro estruturado, sempre.
 *
 * `apis.md` §5.6: nunca "HTTP 200 com `status: failure` dentro", que é a armadilha
 * nº 1 da Blip. Toda falha sai com status HTTP correto e corpo
 * `{ "erro": { "codigo", "mensagem" } }`, para o cliente distinguir sucesso de
 * falha sem inspecionar o corpo.
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
    return new PipeError(401, 'nao_autorizado', mensagem);
  }

  static withoutScope(scope: string): PipeError {
    return new PipeError(403, 'sem_escopo', `A chave não tem o escopo "${scope}".`, { scope });
  }

  /** Irmã de `semEscopo`, para gente logada: escopo é chave de API, permissão é pessoa. */
  static withoutPermission(codigo: string): PipeError {
    return new PipeError(403, 'sem_permissao', `Você não tem a permissão "${codigo}".`, {
      permissao: codigo,
    });
  }

  static naoEncontrado(oQue: string): PipeError {
    return new PipeError(404, 'nao_encontrado', `${oQue} não encontrado.`);
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
        erro: {
          codigo: exception.codigo,
          mensagem: exception.message,
          ...(exception.detalhe ? { detalhe: exception.detalhe } : {}),
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const corpo = exception.getResponse();
      resposta.status(exception.getStatus()).json({
        erro: {
          codigo: 'http',
          mensagem: typeof corpo === 'string' ? corpo : exception.message,
        },
      });
      return;
    }

    // O `body-parser` recusa corpo grande antes do Nest: culpa de quem mandou, não 500.
    if ((exception as { type?: string } | null)?.type === 'entity.too.large') {
      resposta.status(413).json({ erro: { codigo: 'corpo_grande', mensagem: 'O corpo da requisição é grande demais.' } });
      return;
    }

    // Erro não previsto não vaza stack para o cliente, mas vai inteiro para o log.
    console.error('[api] erro não tratado', exception);
    resposta.status(500).json({
      erro: { codigo: 'erro_interno', mensagem: 'Erro interno.' },
    });
  }
}
