import { fusoDoTenant } from '../../../../../lib/banco';
import { carregarRelatorios } from '../../../../../lib/analise-portal';
import { RelatoriosPersonalizados } from './relatorios';
import './relatorios.css';

/** `auth.application.detail.analytics.reports` — o painel `#reportsContent`. */
export default async function PaginaDosRelatorios() {
  const [relatorios, fuso] = await Promise.all([carregarRelatorios(), fusoDoTenant()]);
  return <RelatoriosPersonalizados relatorios={relatorios} agora={new Date()} fuso={fuso} />;
}
