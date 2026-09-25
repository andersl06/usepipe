import type { ReportCustom } from '@pipe/core/analytics';
import { useRead } from '../../../../lib/query';
import { useContact } from '../../contact';
import { ReportsCustom } from './reports';
import './reports.css';

interface ReportsResposta {
  reports: ReportCustom[];
  fuso: string;
}

/** `auth.application.detail.analytics.reports` — o painel `#reportsContent`. */
export function ReportsPage() {
  const { contact } = useContact();
  const read = useRead<ReportsResposta>(
    `/v1/management/flows/${contact.id}/analytics/reports`,
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
