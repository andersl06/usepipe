import { useSearchParams } from 'react-router-dom';
import { useLeitura } from '../../../../lib/consulta';
import { useContato } from '../../contato';
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
export function PaginaDoDashboard() {
  const { contato } = useContato();
  const [busca] = useSearchParams();
  const q = new URLSearchParams();
  for (const chave of ['periodo', 'de', 'ate', 'contatos']) {
    const v = busca.get(chave);
    if (v) q.set(chave, v);
  }
  const leitura = useLeitura<RespostaDoDashboard>(
    `/v1/gestao/fluxos/${contato.id}/analise/dashboard?${q.toString()}`,
  );
  if (!leitura.data) return null;
  const { periodo, intervalo, hoje, dados, lista } = leitura.data;
  return (
    <TelaDoDashboard
      id={contato.id}
      periodo={periodo}
      intervalo={intervalo}
      hoje={hoje}
      dados={dados}
      lista={lista}
    />
  );
}
