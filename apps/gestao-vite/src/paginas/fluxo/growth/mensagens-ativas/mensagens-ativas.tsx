import { useRead } from '../../../../lib/consulta';
import type { DataOfGrowth } from '@pipe/contracts';
import { useContact } from '../../contato';
import { ActiveMessagesTela } from './tela';

/** Growth › Mensagens ativas: os dados são da conta, lidos em `/v1/gestao/fluxos/:id/growth`. */
export function PageActiveMessages() {
  const { contact } = useContact();
  const read = useRead<DataOfGrowth>(`/v1/management/flows/${contact.id}/growth`);
  if (!read.data) return null;
  return <ActiveMessagesTela data={read.data} />;
}
