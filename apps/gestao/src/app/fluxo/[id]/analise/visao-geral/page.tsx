import { notFound } from 'next/navigation';
import { fusoDoTenant, janelaDeDatas } from '../../../../../lib/banco';
import { carregarVisaoGeral } from '../../../../../lib/analise-portal';
import { UUID } from '../../barra-do-contato';
import { hojeNoFuso, periodoDaUrl, somarDias } from '../pecas';
import { VisaoGeral } from './visao-geral';
import './visao-geral.css';

/**
 * `auth.application.detail.analytics.overview` — o painel `#overviewContent`.
 *
 * Período padrão: `getDate()` com a flag de um dia desligada chama
 * `U4(7)`, que é `moment().subtract(7, 'days')` até `moment()`.
 */
export default async function PaginaDaVisaoGeral({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, busca, fuso] = await Promise.all([params, searchParams, fusoDoTenant()]);
  if (!UUID.test(id)) notFound();

  const hoje = hojeNoFuso(fuso);
  const { de, ate } = periodoDaUrl(busca, somarDias(hoje, -7), hoje);
  const dados = await carregarVisaoGeral(id, await janelaDeDatas(fuso, de, ate), fuso);

  return <VisaoGeral dados={dados} de={de} ate={ate} />;
}
