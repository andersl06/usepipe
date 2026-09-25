import type { ItemOfConversation } from '@pipe/contracts';

/**
 * O agrupamento da thread — a regra dos `.blip-message-group` da referência:
 * mensagens seguidas do mesmo lado formam um grupo, com um horário só (o do
 * último balão); uma nota interna quebra o grupo e fica sozinha.
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
 * O sinal de entrega abaixo do grupo de saída: o do ÚLTIMO balão. Os nomes
 * são os `estado_entrega` do domínio; a referência mostra relógio para
 * pendente, um check para enviada, dois para entregue e dois azuis para lida.
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
