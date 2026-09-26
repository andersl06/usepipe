import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { registrationOfAccountEnabled, buildAccount } from '../domain/builder-of-account.js';
import { PipeError } from '../errors.js';

/**
 * Ported from chatwoot/chatwoot (MIT), `app/controllers/api/v1/accounts_controller.rb`'s `create` action, including `check_signup_enabled` and `ensure_account_name`. Deliberately public like the original, but disabled by default: `ENABLE_ACCOUNT_SIGNUP=false` returns 404, corresponding to the original `RoutingError 'Not Found'`. Assisted sales is specified in `2026-09-07-implantacao.md` §6.1; the remaining enablement work is documented in `dominio/construtor-de-conta.ts`. As with the original unauthenticated web signup, the response contains only the email. This creates no session; the person later signs in with Google using that email.
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
