import { useContact } from '../../contato';
import { ReportsManager } from './tela';
import './gerenciador.css';

/** `auth.application.detail.analytics.reportManager` — o "hoje" é o do fuso da conta. */
export function ManagerPage() {
  const { contact, fuso } = useContact();
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(new Date());
  return <ReportsManager bot={contact.nome} hoje={hoje} />;
}
