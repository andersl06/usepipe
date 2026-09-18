import { useSearchParams } from 'react-router-dom';
import type { VisaoGeral as DadosDaVisaoGeral } from '@pipe/core/analise';
import { useLeitura } from '../../../../lib/consulta';
import { useContato } from '../../contato';
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
  dados: DadosDaVisaoGeral;
  de: string;
  ate: string;
}

export function PaginaDaVisaoGeral() {
  const { contato } = useContato();
  const [busca] = useSearchParams();
  const q = new URLSearchParams();
  for (const chave of ['de', 'ate']) {
    const v = busca.get(chave);
    if (v) q.set(chave, v);
  }
  const leitura = useLeitura<RespostaDaVisaoGeral>(
    `/v1/gestao/fluxos/${contato.id}/analise/visao-geral?${q.toString()}`,
  );
  if (!leitura.data) return null;
  const { dados, de, ate } = leitura.data;
  return <VisaoGeral dados={dados} de={de} ate={ate} />;
}
