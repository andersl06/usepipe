import type { Bloco } from './modelo';
import { entradaDe } from './modelo';

export interface EtiquetaDoBloco {
  rotulo: string;
  cor: string;
}

const CORES_DAS_ACOES: Record<string, string> = {
  ExecuteScript: '#ff961e',
  ExecuteScriptV2: '#ff961e',
  TrackEvent: '#61d36f',
  SendMessage: '#ee82ee',
  UserInput: '#000000',
};

function corDaEtiqueta(rotulo: string, corDaOrigem?: unknown): string {
  const cor = typeof corDaOrigem === 'string' ? corDaOrigem : CORES_DAS_ACOES[rotulo];
  if (!cor || ['#3f7de8', '#0096fa', '#1e6bf1', '#498bff'].includes(cor.toLowerCase())) return '#4a5d23';
  return cor;
}

/** Etiquetas do card, na mesma ordem do Builder: tags, ações e entrada. */
export function etiquetasDoBloco(bloco: Bloco): EtiquetaDoBloco[] {
  const tipos = new Map<string, string>();
  for (const tag of bloco.$tags ?? []) {
    const lida = tag as { label?: unknown; color?: unknown; background?: unknown };
    if (typeof lida.label === 'string' && lida.label) {
      tipos.set(lida.label, corDaEtiqueta(lida.label, lida.color ?? lida.background));
    }
  }
  for (const acao of [...(bloco.$enteringCustomActions ?? []), ...(bloco.$leavingCustomActions ?? [])]) {
    if (acao.type) tipos.set(acao.type, corDaEtiqueta(acao.type));
  }
  for (const item of bloco.$contentActions ?? []) {
    if (item.action?.type) tipos.set(item.action.type, corDaEtiqueta(item.action.type));
  }
  const entrada = entradaDe(bloco);
  if (entrada && !entrada.bypass) tipos.set('UserInput', corDaEtiqueta('UserInput'));
  return [...tipos].map(([rotulo, cor]) => ({ rotulo, cor }));
}
