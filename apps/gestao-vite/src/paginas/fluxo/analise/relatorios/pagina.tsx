import type { RelatorioPersonalizado } from '@pipe/core/analise';
import { useLeitura } from '../../../../lib/consulta';
import { useContato } from '../../contato';
import { RelatoriosPersonalizados } from './relatorios';
import './relatorios.css';

interface RespostaDosRelatorios {
  relatorios: RelatorioPersonalizado[];
  fuso: string;
}

/** `auth.application.detail.analytics.reports` — o painel `#reportsContent`. */
export function PaginaDosRelatorios() {
  const { contato } = useContato();
  const leitura = useLeitura<RespostaDosRelatorios>(
    `/v1/gestao/fluxos/${contato.id}/analise/relatorios`,
  );
  if (!leitura.data) return null;
  return (
    <RelatoriosPersonalizados
      relatorios={leitura.data.relatorios}
      agora={new Date()}
      fuso={leitura.data.fuso}
    />
  );
}
