/**
 * Nomes de fila e conexão, num lugar só.
 *
 * A fila é o transporte, não a verdade (modelo de dados §9): o que precisa
 * sobreviver a reinício tem linha em `outbox_mensagem`, `entrega_webhook` ou
 * `execucao_workflow`. Perder um job atrasa; não perde mensagem.
 */

// O BullMQ recusa `:` no nome da fila — ele usa o caractere como separador de chave
// no Redis. Daí o hífen.
export const FILA_ENTRADA = 'pipe-entrada';
export const FILA_ENTREGA = 'pipe-entrega';
export const FILA_AGREGACAO = 'pipe-agregacao';

export interface JobEntrega {
  /** Só um empurrão: o worker varre o outbox de qualquer jeito. */
  mensagemId?: string;
  /** Valores posicionais do template — ver `parametros_perdidos` em `entrega.ts`. */
  parametros?: Record<string, string>;
}

export interface JobEntrada {
  canalId: string;
  payload: unknown;
}

export function conexaoRedis(): { url: string } {
  return { url: process.env['REDIS_URL'] ?? 'redis://localhost:6380' };
}
