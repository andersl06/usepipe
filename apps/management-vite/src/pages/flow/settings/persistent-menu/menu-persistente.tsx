import type { ChannelOfFlowInScreen, ConfigurationOfMenuPersistent } from '@pipe/contracts';
import { channelInBotState } from '../../../../lib/channel-of-flow';
import { useRead } from '../../../../lib/query';
import { useContact } from '../../contact';
import { TelaDeMenuPersistente } from './tela';

/**
 * A router may have Messenger as a secondary channel, so use the linked-channel
 * list rather than the legacy single-channel fields on the contact.
 */
export function PersistentMenuPage() {
  const { contact } = useContact();
  const linked = useRead<ChannelOfFlowInScreen>(`/v1/management/flows/${contact.id}/channel`);
  const read = useRead<ConfigurationOfMenuPersistent>(
    `/v1/management/flows/${contact.id}/menu-persistent`,
  );
  if (!read.data || !linked.data) return null;
  const channelCompatible = channelInBotState(
    linked.data.channels,
    'messenger',
    contact.tipo === 'roteador',
  ).state === 'conectado';
  return (
    <TelaDeMenuPersistente
      id={contact.id}
      channelCompatible={channelCompatible}
      inicial={read.data}
    />
  );
}
