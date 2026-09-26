import type { ItemOfConversation } from '@pipe/contracts';

/**
 * Group consecutive messages on the same side like reference `.blip-message-group`, showing only the last bubble's time. An internal note interrupts the group and stands alone.
 */
export type Message = Extract<ItemOfConversation, { genero: 'mensagem' }>;
export type Nota = Extract<ItemOfConversation, { genero: 'nota' }>;

export type Grupo =
  | { genero: 'grupo'; direction: 'entrada' | 'saida'; messages: Message[] }
  | { genero: 'nota'; nota: Nota };

export function agrupar(itens: readonly ItemOfConversation[]): Grupo[] {
  const groups: Grupo[] = [];
  for (const item of itens) {
    if (item.genero === 'nota') {
      groups.push({ genero: 'nota', nota: item });
      continue;
    }
    const ultimo = groups[groups.length - 1];
    if (ultimo && ultimo.genero === 'grupo' && ultimo.direction === item.direction) {
      ultimo.messages.push(item);
    } else {
      groups.push({ genero: 'grupo', direction: item.direction, messages: [item] });
    }
  }
  return groups;
}

/**
 * Show delivery state below an outgoing group using its last bubble. Domain values are `estado_entrega`; the reference shows a clock for pending, one check for sent, two for delivered, and two blue checks for read.
 */
export type DeliverySignal = 'relogio' | 'check' | 'duplo-check' | 'lida' | 'erro' | null;

export function deliverySignal(messages: readonly Message[]): DeliverySignal {
  const ultima = messages[messages.length - 1];
  if (!ultima) return null;
  switch (ultima.stateDelivery) {
    case 'pendente':
    case 'enviando':
      return 'relogio';
    case 'enviada':
      return 'check';
    case 'entregue':
      return 'duplo-check';
    case 'lida':
      return 'lida';
    case 'falhou':
      return 'erro';
    default:
      return null;
  }
}
