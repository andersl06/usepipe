import { contactBase, useContact } from '../../contato';
import { TelaDoWebhook } from './tela';

/** `/integrations/webhook` da origem: cabeçalho com volta, interruptor e o papel de abas. */
export function PageWebhook() {
  const { contact } = useContact();
  return <TelaDoWebhook base={contactBase(contact.tipo, contact.id)} />;
}
