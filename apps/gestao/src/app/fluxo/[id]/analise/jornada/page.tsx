import { notFound } from 'next/navigation';
import { fusoDoTenant, janelaDeDatas } from '../../../../../lib/banco';
import { carregarJornada } from '../../../../../lib/analise-portal';
import { UUID, carregarContato } from '../../barra-do-contato';
import { hojeNoFuso, periodoDaUrl, somarDias } from '../pecas';
import { JornadaDosContatos } from './jornada';
import './jornada.css';

/**
 * `auth.application.detail.analytics.contactsJourney` — o painel
 * `#contactsJourneyContent`.
 *
 * Período: `initAndApplyFilter()` passa ao `UT` `defaultStartFromToday: -1`,
 * `defaultEndFromToday: 0`, `validStartFromToday: -30`, `validEndFromToday: 1`
 * — de ontem a hoje, dentro dos últimos 30 dias.
 */
export default async function PaginaDaJornada({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, busca, fuso] = await Promise.all([params, searchParams, fusoDoTenant()]);
  if (!UUID.test(id)) notFound();

  const hoje = hojeNoFuso(fuso);
  const { de, ate } = periodoDaUrl(busca, somarDias(hoje, -1), hoje);
  const [contato, janela] = await Promise.all([carregarContato(id), janelaDeDatas(fuso, de, ate)]);
  if (!contato) notFound();
  const arestas = await carregarJornada(id, janela);

  return (
    <JornadaDosContatos
      arestas={arestas}
      de={de}
      ate={ate}
      min={somarDias(hoje, -30)}
      max={somarDias(hoje, 1)}
      roteador={contato.tipo === 'roteador'}
    />
  );
}
