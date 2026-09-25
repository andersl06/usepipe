import { useSearchParams } from 'react-router-dom';
import type { VisaoGeral as DadosDaVisaoGeral } from '@pipe/core/analise';
import { useRead } from '../../../../lib/consulta';
import { useContact } from '../../contato';
import { VisaoGeral } from './visao-geral';
import './visao-geral.css';

/**
 * `auth.application.detail.analytics.overview` — o painel `#overviewContent`.
 *
 * Período padrão: `getDate()` com a flag de um dia desligada chama
 * `U4(7)`, que é `moment().subtract(7, 'days')` até `moment()`. A conta é da
 * `api`, no fuso da conta.
 */
interface RespostaDaVisaoGeral {
  data: DadosDaVisaoGeral;
  de: string;
  ate: string;
}

export function OverviewPage() {
  const { contact } = useContact();
  const [search] = useSearchParams();
  const q = new URLSearchParams();
  for (const key of ['de', 'ate']) {
    const v = search.get(key);
    if (v) q.set(key, v);
  }
  const read = useRead<RespostaDaVisaoGeral>(
    `/v1/gestao/fluxos/${contact.id}/analise/visao-geral?${q.toString()}`,
  );
  if (!read.data) return null;
  const { data, de, ate } = read.data;
  return <VisaoGeral data={data} de={de} ate={ate} />;
}
