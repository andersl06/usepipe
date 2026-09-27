import type { Block } from './model';
import { inboundOf } from './model';

export interface BlockTag {
  rotulo: string;
  cor: string;
}

/** Reference blues (D-13/D-32): any tag color imported with one of these becomes brand green. */
export const LEGACY_BLUES = ['#3f7de8', '#0096fa', '#1e6bf1', '#498bff'];

export function isLegacyBlue(cor: string): boolean {
  return LEGACY_BLUES.includes(cor.toLowerCase());
}

export interface TagPaletteEntry {
  label: string;
  /** CSS color for the swatch button — a token for the brand entry, a literal hex for the rest. */
  value: string;
}

/** Colors offered by the block tag editor's picker (`panel.tsx`), brand first. */
export const TAG_PALETTE: TagPaletteEntry[] = [
  { label: 'Marca', value: 'var(--p-builder-marca)' },
  { label: 'Laranja', value: '#ff961e' },
  { label: 'Verde', value: '#61d36f' },
  { label: 'Violeta', value: '#ee82ee' },
  { label: 'Preto', value: '#000000' },
  { label: 'Vermelho', value: '#ff4c4c' },
];

/** Suggested tag labels, offered by the entry field alongside free typing (D-11a). */
export const TAG_SUGGESTIONS = ['Importante', 'VIP', 'Erro', 'Em revisão', 'Pronto'];

/**
 * `$tags` persists a literal color — Blip reads it from the exported flow (STD-06), not
 * a CSS custom property — so the brand swatch (`TAG_PALETTE`'s `var(--p-builder-marca)`)
 * resolves to this hex before being saved. The Builder always renders dark (D-31), so
 * this is the dark `--p-marca`/`--p-builder-marca` value from `estilos/tokens.css` —
 * keep both in sync.
 */
const BRAND_TAG_HEX = '#a3b76a';

export function resolveTagColor(cor: string): string {
  return cor === 'var(--p-builder-marca)' ? BRAND_TAG_HEX : cor;
}

const COLORS_OF_ACTIONS: Record<string, string> = {
  ExecuteScript: '#ff961e',
  ExecuteScriptV2: '#ff961e',
  TrackEvent: '#61d36f',
  SendMessage: '#ee82ee',
  UserInput: '#000000',
};

function corDaEtiqueta(rotulo: string, corDaOrigem?: unknown): string {
  const cor = typeof corDaOrigem === 'string' ? corDaOrigem : COLORS_OF_ACTIONS[rotulo];
  // Live canvas badge, not a persisted value: renders the theme-aware brand token (D-32).
  if (!cor || isLegacyBlue(cor)) return 'var(--p-builder-marca)';
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
