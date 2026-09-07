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
export class ErroPipe extends Error {
  readonly codigo: string;
  readonly status: number;
  readonly detalhe: Record<string, unknown> | undefined;

  constructor(
    status: number,
    codigo: string,
    mensagem: string,
    detalhe?: Record<string, unknown>,
  ) {
    super(mensagem);
    this.name = 'ErroPipe';
    this.codigo = codigo;
    this.status = status;
    this.detalhe = detalhe;
  }

  static requisicao(codigo: string, mensagem: string, detalhe?: Record<string, unknown>): ErroPipe {
    return new ErroPipe(400, codigo, mensagem, detalhe);
  }

  static naoAutorizado(mensagem = 'Chave de API ausente ou inválida.'): ErroPipe {
    return new ErroPipe(401, 'nao_autorizado', mensagem);
  }

  static semEscopo(escopo: string): ErroPipe {
    return new ErroPipe(403, 'sem_escopo', `A chave não tem o escopo "${escopo}".`, { escopo });
  }

  /** Irmã de `semEscopo`, para gente logada: escopo é chave de API, permissão é pessoa. */
  static semPermissao(codigo: string): ErroPipe {
    return new ErroPipe(403, 'sem_permissao', `Você não tem a permissão "${codigo}".`, {
      permissao: codigo,
    });
  }

  static naoEncontrado(oQue: string): ErroPipe {
    return new ErroPipe(404, 'nao_encontrado', `${oQue} não encontrado.`);
  }

  static conflito(codigo: string, mensagem: string, detalhe?: Record<string, unknown>): ErroPipe {
    return new ErroPipe(409, codigo, mensagem, detalhe);
  }
}

@Catch()
export class FiltroDeErro implements ExceptionFilter {
  catch(excecao: unknown, host: ArgumentsHost): void {
    const resposta = host.switchToHttp().getResponse<Response>();

    if (excecao instanceof ErroPipe) {
      resposta.status(excecao.status).json({
        erro: {
          codigo: excecao.codigo,
          mensagem: excecao.message,
          ...(excecao.detalhe ? { detalhe: excecao.detalhe } : {}),
        },
      });
      return;
    }

    if (excecao instanceof HttpException) {
      const corpo = excecao.getResponse();
      resposta.status(excecao.getStatus()).json({
        erro: {
          codigo: 'http',
          mensagem: typeof corpo === 'string' ? corpo : excecao.message,
        },
      });
      return;
    }

    // Erro não previsto não vaza stack para o cliente, mas vai inteiro para o log.
    console.error('[api] erro não tratado', excecao);
    resposta.status(500).json({
      erro: { codigo: 'erro_interno', mensagem: 'Erro interno.' },
    });
  }
}
