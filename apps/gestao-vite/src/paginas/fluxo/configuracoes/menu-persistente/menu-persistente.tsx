import type { ConfigurationOfMenuPersistent } from '@pipe/contracts';
import { useRead } from '../../../../lib/consulta';
import { useContact } from '../../contato';
import { TelaDeMenuPersistente } from './tela';

/**
 * `/configurations/persistentMenu`. O canal compatível é o Messenger — o
 * mesmo `canalTipo`/`canalAtivo` que `fluxo/canais/canais.tsx` já lê do
 * contato (`GET /v1/gestao/fluxos/:id`), sem inventar um estado à parte. Os
 * itens e a trava de "boas-vindas preenchida" vêm de
 * `GET /v1/gestao/fluxos/:id/menu-persistente`.
 */
export function PersistentMenuPage() {
  const { contact } = useContact();
  const channelCompativel = contact.channelActive === true && contact.channelTipo === 'messenger';
  const read = useRead<ConfigurationOfMenuPersistent>(
    `/v1/gestao/fluxos/${contact.id}/menu-persistente`,
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
