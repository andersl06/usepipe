/**
 * Status de encerramento — §4 da spec de métricas.
 *
 * A fronteira entre perdida e abandonada é a existência de `atribuida_em`:
 * perdida é problema de capacidade ou de fila, abandonada é problema de
 * atendimento. Separá-las é o que torna o número acionável.
 */

import { derivarMarcos, type ConversaEventos, type Marcos } from './eventos.js';

export type StatusEncerramento = 'perdida' | 'abandonada' | 'finalizada';

export interface ContagemEncerramento {
  perdida: number;
  abandonada: number;
  finalizada: number;
  /** Soma das três — o "fechada" da spec. */
  fechada: number;
  /** Conversas ainda abertas no conjunto avaliado. */
  abertas: number;
}

/**
 * Classifica o encerramento de uma conversa. `null` quando ainda está aberta.
 *
 * - `atendente` ou `transferencia` → finalizada, tenha sido atribuída ou não
 *   (gestor também fecha em lote pela tela de monitoramento).
 * - `cliente` ou `inatividade` → perdida se nunca foi atribuída, abandonada se foi.
 * - Encerramento sem `encerradaPor` cai na mesma regra de atribuição, porque a
 *   origem desconhecida não pode virar "finalizada" por otimismo.
 */
export function classificarEncerramento(marcos: Marcos): StatusEncerramento | null {
  if (!marcos.encerradaEm) return null;
  if (marcos.encerradaPor === 'atendente' || marcos.encerradaPor === 'transferencia') {
    return 'finalizada';
  }
  return marcos.atribuidaEm ? 'abandonada' : 'perdida';
}

export function classificarConversa(conversa: ConversaEventos): StatusEncerramento | null {
  return classificarEncerramento(derivarMarcos(conversa));
}

export function contarEncerramentos(
  conversas: readonly ConversaEventos[],
): ContagemEncerramento {
  const contagem: ContagemEncerramento = {
    perdida: 0,
    abandonada: 0,
    finalizada: 0,
    fechada: 0,
    abertas: 0,
  };

  for (const conversa of conversas) {
    const status = classificarConversa(conversa);
    if (status === null) {
      contagem.abertas += 1;
      continue;
    }
    contagem[status] += 1;
    contagem.fechada += 1;
  }

  return contagem;
}
