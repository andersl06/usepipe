import type { ReportCustom } from '@pipe/core/analytics';
import { useRead } from '../../../../lib/query';
import { useContact } from '../../contact';
import { ReportsCustom } from './reports';
import './reports.css';

interface ReportsResponse {
  reports: ReportCustom[];
  fuso: string;
}

/** `auth.application.detail.analytics.reports` — o painel `#reportsContent`. */
export function ReportsPage() {
  const { contact } = useContact();
  const read = useRead<ReportsResponse>(
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
