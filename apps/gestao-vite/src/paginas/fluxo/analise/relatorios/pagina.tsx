import type { ReportCustom } from '@pipe/core/analise';
import { useRead } from '../../../../lib/consulta';
import { useContact } from '../../contato';
import { ReportsCustom } from './relatorios';
import './relatorios.css';

interface ReportsResposta {
  reports: ReportCustom[];
  fuso: string;
}

/** `auth.application.detail.analytics.reports` — o painel `#reportsContent`. */
export function ReportsPage() {
  const { contact } = useContact();
  const read = useRead<ReportsResposta>(
    `/v1/gestao/fluxos/${contact.id}/analise/relatorios`,
  );
  if (!read.data) return null;
  return (
    <ReportsCustom
      reports={read.data.reports}
      agora={new Date()}
      fuso={read.data.fuso}
    />
  );
}
