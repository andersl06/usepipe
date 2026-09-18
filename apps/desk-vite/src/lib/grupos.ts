import type { ItemDaConversa } from '@pipe/contracts';

/**
 * O agrupamento da thread — a regra dos `.blip-message-group` da referência:
 * mensagens seguidas do mesmo lado formam um grupo, com um horário só (o do
 * último balão); uma nota interna quebra o grupo e fica sozinha.
 */
export type Mensagem = Extract<ItemDaConversa, { genero: 'mensagem' }>;
export type Nota = Extract<ItemDaConversa, { genero: 'nota' }>;

export type Grupo =
  | { genero: 'grupo'; direcao: 'entrada' | 'saida'; mensagens: Mensagem[] }
  | { genero: 'nota'; nota: Nota };

export function agrupar(itens: readonly ItemDaConversa[]): Grupo[] {
  const grupos: Grupo[] = [];
  for (const item of itens) {
    if (item.genero === 'nota') {
      grupos.push({ genero: 'nota', nota: item });
      continue;
    }
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.genero === 'grupo' && ultimo.direcao === item.direcao) {
      ultimo.mensagens.push(item);
    } else {
      grupos.push({ genero: 'grupo', direcao: item.direcao, mensagens: [item] });
    }
  }
  return grupos;
}

/**
 * O sinal de entrega abaixo do grupo de saída: o do ÚLTIMO balão. Os nomes
 * são os `estado_entrega` do domínio; a referência mostra relógio para
 * pendente, um check para enviada, dois para entregue e dois azuis para lida.
 */
export type SinalDeEntrega = 'relogio' | 'check' | 'duplo-check' | 'lida' | 'erro' | null;

export function sinalDeEntrega(mensagens: readonly Mensagem[]): SinalDeEntrega {
  const ultima = mensagens[mensagens.length - 1];
  if (!ultima) return null;
  switch (ultima.estadoEntrega) {
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
