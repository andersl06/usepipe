import { useContato } from '../../contato';
import { TelaDoWebhook } from './tela';

/** `/integrations/webhook` da origem: cabeçalho com volta, interruptor e o papel de abas. */
export function PaginaWebhook() {
  const { contato } = useContato();
  return <TelaDoWebhook fluxoId={contato.id} />;
}
