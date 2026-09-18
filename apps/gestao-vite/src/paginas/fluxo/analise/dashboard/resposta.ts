import type { DadosDoDashboard, Intervalo, Periodo } from '@pipe/core/analise';

/** O que `GET /v1/gestao/fluxos/:id/analise/dashboard` responde (`RespostaDoDashboard` na api). */
export interface RespostaDoDashboard {
  periodo: Periodo;
  intervalo: Intervalo;
  hoje: string;
  dados: DadosDoDashboard;
  lista: { tipo: 'interacao' | 'rejeicao'; nomes: string[] } | null;
}
