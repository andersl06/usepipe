import type { DashboardData, Intervalo, Period } from '@pipe/core/analytics';

/** O que `GET /v1/gestao/fluxos/:id/analise/dashboard` responde (`RespostaDoDashboard` na api). */
export interface RespostaDoDashboard {
  period: Period;
  intervalo: Intervalo;
  hoje: string;
  data: DashboardData;
  lista: { type: 'interacao' | 'rejeicao'; nomes: string[] } | null;
}
