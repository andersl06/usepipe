import type { ConfigurationOfMenuPersistent } from '@pipe/contracts';
import { useRead } from '../../../../lib/query';
import { useContact } from '../../contact';
import { TelaDeMenuPersistente } from './tela';

/**
 * `/configurations/persistentMenu`. The compatible channel is Messenger — the same `canalTipo`/`canalAtivo` that `fluxo/canais/canais.tsx` already reads from the contact (`GET /v1/gestao/fluxos/:id`), without inventing a separate state. The items and the "boas-vindas filled in" lock come from `GET /v1/gestao/fluxos/:id/menu-persistente`.
 */
export function PersistentMenuPage() {
  const { contact } = useContact();
  const channelCompativel = contact.channelActive === true && contact.channelTipo === 'messenger';
  const read = useRead<ConfigurationOfMenuPersistent>(
    `/v1/management/flows/${contact.id}/menu-persistent`,
  );
  if (!read.data) return null;
  return (
    <TelaDeMenuPersistente
      id={contact.id}
      channelCompativel={channelCompativel}
      inicial={read.data}
    />
  );
}
