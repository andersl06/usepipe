import { useContact } from '../../contact';
import { ReportsManager } from './tela';
import './manager.css';

/** `auth.application.detail.analytics.reportManager` — "today" is in the account's timezone. */
export function ManagerPage() {
  const { contact, fuso } = useContact();
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(new Date());
  return <ReportsManager bot={contact.nome} hoje={hoje} />;
}
