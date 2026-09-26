import type { Block } from './model';
import { inboundOf } from './model';

export interface BlockTag {
  rotulo: string;
  cor: string;
}

const CORES_OF_ACTIONS: Record<string, string> = {
  ExecuteScript: '#ff961e',
  ExecuteScriptV2: '#ff961e',
  TrackEvent: '#61d36f',
  SendMessage: '#ee82ee',
  UserInput: '#000000',
};

function corDaEtiqueta(rotulo: string, corDaOrigem?: unknown): string {
  const cor = typeof corDaOrigem === 'string' ? corDaOrigem : CORES_OF_ACTIONS[rotulo];
  if (!cor || ['#3f7de8', '#0096fa', '#1e6bf1', '#498bff'].includes(cor.toLowerCase())) return '#4a5d23';
  return cor;
}

/** Block card labels, in the same order as the Builder: tags, actions, and input. */
export function blockTags(block: Block): BlockTag[] {
  const tipos = new Map<string, string>();
  for (const tag of block.$tags ?? []) {
    const lida = tag as { label?: unknown; color?: unknown; background?: unknown };
    if (typeof lida.label === 'string' && lida.label) {
      tipos.set(lida.label, corDaEtiqueta(lida.label, lida.color ?? lida.background));
    }
  }
  for (const acao of [...(block.$enteringCustomActions ?? []), ...(block.$leavingCustomActions ?? [])]) {
    if (acao.type) tipos.set(acao.type, corDaEtiqueta(acao.type));
  }
  for (const item of block.$contentActions ?? []) {
    if (item.action?.type) tipos.set(item.action.type, corDaEtiqueta(item.action.type));
  }
  const inbound = inboundOf(block);
  if (inbound && !inbound.bypass) tipos.set('UserInput', corDaEtiqueta('UserInput'));
  return [...tipos].map(([rotulo, cor]) => ({ rotulo, cor }));
}
