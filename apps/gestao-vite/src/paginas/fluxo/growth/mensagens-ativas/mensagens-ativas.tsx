import { useLeitura } from '../../../../lib/consulta';
import type { DadosDeGrowth } from '@pipe/contracts';
import { useContato } from '../../contato';
import { TelaDeMensagensAtivas } from './tela';

/** Growth › Mensagens ativas: os dados são da conta, lidos em `/v1/gestao/fluxos/:id/growth`. */
export function PaginaMensagensAtivas() {
  const { contato } = useContato();
  const leitura = useLeitura<DadosDeGrowth>(`/v1/gestao/fluxos/${contato.id}/growth`);
  if (!leitura.data) return null;
  return <TelaDeMensagensAtivas dados={leitura.data} />;
}
