/**
 * `GET /v1/management/satisfaction-surveys/responses` — the query endpoint over the native
 * satisfaction survey answers (`packages/db/src/schema/conversations.ts`,
 * `pesquisa_satisfacao_resposta`, D-08.5). Shaped to answer the reference's own
 * "Análise de Satisfação" filters and columns (`ref/inventario-satisfacao-e-tags.md` §3), which
 * is a future Analytics screen — this contract only exposes the data, not the dashboard.
 */

export type SatisfactionSurveyState = 'completa' | 'so_nota' | 'sem_resposta' | 'abandono';

/** 1-2 / 3 / 4-5, computed from the raw `rating` at query time — never stored (D-09). */
export type SatisfactionSurveyCategory = 'insatisfeito' | 'neutro' | 'satisfeito';

export interface SatisfactionSurveyResponse {
  id: string;
  conversationId: string;
  /** The closed human attendance this answer evaluates; null when there was none. */
  attendanceConversationId: string | null;
  queueId: string | null;
  queueName: string | null;
  agentId: string | null;
  agentEmail: string | null;
  contactId: string;
  /** Raw 1-5 rating; null for `sem_resposta`/`abandono`. */
  rating: number | null;
  category: SatisfactionSurveyCategory | null;
  comment: string | null;
  status: SatisfactionSurveyState;
  createdAt: string;
  respondedAt: string | null;
}

/** Filters mirror the reference's Análise de Satisfação (§3): period, queue, agent, rating, and comment search. */
export interface SatisfactionSurveyQuery {
  from?: string;
  to?: string;
  queueId?: string;
  agentId?: string;
  rating?: number;
  /** Free-text search over `comment`; matched as literal text, wildcards escaped (T-2-22). Max 200 characters. */
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface SatisfactionSurveyPageInfo {
  has_next_page: boolean;
  end_cursor: string | null;
}

export interface SatisfactionSurveyPage {
  data: SatisfactionSurveyResponse[];
  page_info: SatisfactionSurveyPageInfo;
}
