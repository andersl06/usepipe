import { notFound } from 'next/navigation';
import { fusoDoTenant } from '../../../../../lib/banco';
import {
  carregarDashboard,
  carregarListaDeContatos,
  hojeNoFuso,
  intervaloDoPeriodo,
  lerPeriodo,
} from '../../../../../lib/analise';
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
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PaginaDoDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ periodo?: string; de?: string; ate?: string; contatos?: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const busca = await searchParams;

  const fuso = await fusoDoTenant();
  const hoje = hojeNoFuso(fuso);
  let periodo = lerPeriodo(busca.periodo);
  let intervalo = intervaloDoPeriodo(periodo, hoje, {
    de: busca.de,
    ate: busca.ate,
    limiteDias: 90,
  });
  if (!intervalo) {
    periodo = 'today';
    intervalo = { inicio: hoje, fim: hoje };
  }

  const tipo =
    busca.contatos === 'interacao' || busca.contatos === 'rejeicao' ? busca.contatos : null;
  const [dados, nomes] = await Promise.all([
    carregarDashboard(id, intervalo, fuso),
    tipo ? carregarListaDeContatos(id, intervalo, fuso, tipo) : null,
  ]);
  if (!dados) notFound();

  return (
    <TelaDoDashboard
      id={id}
      periodo={periodo}
      intervalo={intervalo}
      hoje={hoje}
      dados={dados}
      lista={tipo && nomes ? { tipo, nomes } : null}
    />
  );
}
