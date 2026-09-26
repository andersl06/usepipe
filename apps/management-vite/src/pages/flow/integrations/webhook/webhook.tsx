import { contactBase, useContact } from '../../contact';
import { TelaDoWebhook } from './tela';

/** The origin's `/integrations/webhook`: header with back button, toggle, and the tabs role. */
export function PageWebhook() {
  const { contact } = useContact();
  return <TelaDoWebhook base={contactBase(contact.tipo, contact.id)} />;
}
