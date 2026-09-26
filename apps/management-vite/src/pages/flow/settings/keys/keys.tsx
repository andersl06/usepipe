import { useContact } from '../../contact';
import { TelaDeChaves } from './tela';

/**
 * `/configurations/keys` — state `auth.application.detail.configurations.accessToken` (portal.js, module 76179 template, `lP` controller). Only exists with `isTokenManagementEnable`; without the flag the source sends you to the bot list.
 *
 * On Pipe the key belongs to the FLOW (`chave_api.fluxo_id`, migration 0032): the table always belonged to the account, and the screen became real, issuing/revoking one key per flow — `GET/POST/DELETE /v1/gestao/fluxos/:id/chaves`.
 */
export function BotPageKeys() {
  const { contact } = useContact();
  return <TelaDeChaves flowId={contact.id} />;
}
