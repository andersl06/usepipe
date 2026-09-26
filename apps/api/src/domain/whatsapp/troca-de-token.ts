import { PipeError } from '../../errors.js';
import { clienteGraph } from './cliente-graph.js';

/**
 * Ported from chatwoot/chatwoot (MIT), app/services/whatsapp/token_exchange_service.rb. Embedded Signup v4 `code` lasts 30 seconds, so exchange it before any database lookup.
 */
export async function exchangeCode(codigo: string | undefined): Promise<string> {
  if (!codigo || !codigo.trim()) {
    throw PipeError.request('code_missing', 'O código de autorização é obrigatório.');
  }

  const resposta = await clienteGraph().exchangeCodeByToken(codigo);
  const token = resposta.access_token;
  // Unlike the original, do not include the entire response in the error message; see `cliente-graph.ts` for the credential-leak rationale.
  if (!token) {
    throw new PipeError(502, 'meta_without_token', 'A troca do código voltou sem access_token.');
  }
  return token;
}
