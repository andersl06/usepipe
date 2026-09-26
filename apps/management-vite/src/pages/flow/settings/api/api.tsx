import { useContact } from '../../contact';
import { TelaDeConexao } from './tela';

/**
 * `/configurations/apikey` — state `auth.application.detail.configurations.apikey` (portal.js, module 83981 template, `iP` controller). The title and text come from `modules.application.detail.templates.api.pageTitle/pageDescription`.
 *
 * Real read and write via `GET/PUT /v1/gestao/fluxos/:id/conexao` (`dominio/gestao/integracoes.ts`): identifier, endpoint, active key prefix and the two HTTP form URLs.
 */
export function BotPageApi() {
  const { contact } = useContact();
  return <TelaDeConexao flowId={contact.id} />;
}
