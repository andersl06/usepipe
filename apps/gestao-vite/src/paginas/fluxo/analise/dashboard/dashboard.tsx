import { useSearchParams } from 'react-router-dom';
import { useRead } from '../../../../lib/consulta';
import { useContact } from '../../contato';
import type { RespostaDoDashboard } from './resposta';
import { TelaDoDashboard } from './tela';
import './dashboard.css';

/**
 * A aba Dashboard da Análise do contato — `/application/detail/{shortName}/analytics/dashboard`
 * na origem, onde o portal monta `<analytics-mfe page="dashboard">`.
 *
 * O estado que lá mora no React (o chip escolhido, o "De/Até", a barra lateral
 * aberta) aqui mora na URL: `?periodo=` com as chaves da origem (`today`,
 * `7days`, `lastWeek`…), `de`/`ate` para o personalizado, `contatos=` para a
 * barra lateral. Período inválido cai em "Hoje", que é o inicial de lá.
 */
export function DashboardPage() {
  const { contact } = useContact();
  const [search] = useSearchParams();
  const q = new URLSearchParams();
  for (const key of ['periodo', 'de', 'ate', 'contatos']) {
    const v = search.get(key);
    if (v) q.set(key, v);
  }
  const read = useRead<RespostaDoDashboard>(
    `/v1/gestao/fluxos/${contact.id}/analise/dashboard?${q.toString()}`,
  );
  if (!read.data) return null;
  const { period, intervalo, hoje, data, lista } = read.data;
  return (
    <TelaDoDashboard
      id={contact.id}
      period={period}
      intervalo={intervalo}
      hoje={hoje}
      data={data}
      lista={lista}
    />
  );
}
