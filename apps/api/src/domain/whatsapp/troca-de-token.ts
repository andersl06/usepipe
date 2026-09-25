import { PipeError } from '../../errors.js';
import { clienteGraph } from './cliente-graph.js';

/**
 * Portado de chatwoot/chatwoot (MIT), app/services/whatsapp/token_exchange_service.rb
 *
 * O `code` do cadastro embutido vive 30 segundos (documentação do Embedded Signup
 * v4). Por isso a troca é a primeira coisa que o cadastro faz, antes de qualquer
 * consulta ao banco.
 */
export async function exchangeCode(codigo: string | undefined): Promise<string> {
  if (!codigo || !codigo.trim()) {
    throw PipeError.request('code_missing', 'O código de autorização é obrigatório.');
  }

  const resposta = await clienteGraph().exchangeCodeByToken(codigo);
  const token = resposta.access_token;
  // O original põe a resposta inteira na mensagem; aqui ela não entra — ver o
  // cabeçalho de `cliente-graph.ts`.
  if (!token) {
    throw new PipeError(502, 'meta_without_token', 'A troca do código voltou sem access_token.');
  }
  return token;
}
