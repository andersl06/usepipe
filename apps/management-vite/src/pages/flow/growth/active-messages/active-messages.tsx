import { useRead } from '../../../../lib/query';
import type { DataOfGrowth } from '@pipe/contracts';
import { useContact } from '../../contact';
import { ActiveMessagesScreen } from './tela';

/** Growth › Mensagens ativas: the data is the account's, read from `/v1/gestao/fluxos/:id/growth`. */
export function PageActiveMessages() {
  const { contact } = useContact();
  const read = useRead<DataOfGrowth>(`/v1/management/flows/${contact.id}/growth`);
  if (!read.data) return null;
  return <ActiveMessagesScreen data={read.data} />;
}
