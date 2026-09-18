import { useContato } from '../../contato';
import { GerenciadorDeRelatorios } from './tela';
import './gerenciador.css';

/** `auth.application.detail.analytics.reportManager` — o "hoje" é o do fuso da conta. */
export function PaginaDoGerenciador() {
  const { contato, fuso } = useContato();
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(new Date());
  return <GerenciadorDeRelatorios bot={contato.nome} hoje={hoje} />;
}
