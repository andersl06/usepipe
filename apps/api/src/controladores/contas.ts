import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { registrationOfAccountEnabled, buildAccount } from '../dominio/construtor-de-conta.js';
import { PipeError } from '../erros.js';

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
@Controller('v1/accounts')
export class AccountsController {
  @Post()
  @HttpCode(200)
  async create(
    @Body() corpo: { account_name?: string; user_full_name?: string; email?: string },
  ): Promise<{ email: string }> {
    if (!registrationOfAccountEnabled()) throw new PipeError(404, 'not_found', 'Não encontrado.');

    // `ensure_account_name`
    if (!corpo.account_name?.trim() && !corpo.user_full_name?.trim()) {
      throw PipeError.request(
        'parameters_invalid',
        'Inválido, por favor, verifique os parâmetros de inscrição e tente novamente',
      );
    }

    const account = await buildAccount({
      nameOfAccount: corpo.account_name,
      nameOfUser: corpo.user_full_name,
      email: corpo.email,
    });
    return { email: account.email };
  }
}
