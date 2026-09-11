import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { cadastroDeContaHabilitado, construirConta } from '../dominio/construtor-de-conta.js';
import { ErroPipe } from '../erros.js';

/**
 * Portado de chatwoot/chatwoot (MIT), a action `create` de
 * app/controllers/api/v1/accounts_controller.rb, com `check_signup_enabled` e
 * `ensure_account_name`.
 *
 * Pública de propósito, como a de lá — e por isso fechada por padrão:
 * `ENABLE_ACCOUNT_SIGNUP=false` responde 404, o `RoutingError 'Not Found'` do
 * original. A spec decide venda assistida (`2026-09-07-implantacao.md` §6.1); o
 * que falta para ligar está no cabeçalho de `dominio/construtor-de-conta.ts`.
 *
 * Resposta igual à do cadastro web não autenticado do original: só o e-mail. Não
 * há sessão aqui — a pessoa entra depois, pelo Google, com aquele e-mail.
 */
@Controller('v1/contas')
export class ControladorContas {
  @Post()
  @HttpCode(200)
  async criar(
    @Body() corpo: { account_name?: string; user_full_name?: string; email?: string },
  ): Promise<{ email: string }> {
    if (!cadastroDeContaHabilitado()) throw new ErroPipe(404, 'nao_encontrado', 'Não encontrado.');

    // `ensure_account_name`
    if (!corpo.account_name?.trim() && !corpo.user_full_name?.trim()) {
      throw ErroPipe.requisicao(
        'parametros_invalidos',
        'Inválido, por favor, verifique os parâmetros de inscrição e tente novamente',
      );
    }

    const conta = await construirConta({
      nomeDaConta: corpo.account_name,
      nomeDoUsuario: corpo.user_full_name,
      email: corpo.email,
    });
    return { email: conta.email };
  }
}
