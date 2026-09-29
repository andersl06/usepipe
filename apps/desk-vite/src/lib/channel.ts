import type { TypeChannelDatabase } from '@pipe/contracts';

/**
 * Match the reference channel display: overlay a logo on the contact avatar (`bds-icon type="logo" name="whatsapp"` on a card) and spell out the name in the panel (`Canal: WhatsApp`). Logos come from `@pipe/ui/icones-portal` (`asset-logo-*`); `widget` uses the email logo because no unbranded chat logo is available.
 */
export type NameOfLogoOfChannel = 'whatsapp' | 'instagram' | 'email';

export const CHANNELS: Record<TypeChannelDatabase, { logo: NameOfLogoOfChannel; nome: string }> = {
  whatsapp_cloud: { logo: 'whatsapp', nome: 'WhatsApp' },
  instagram: { logo: 'instagram', nome: 'Instagram' },
  email: { logo: 'email', nome: 'E-mail' },
  widget: { logo: 'email', nome: 'Chat' },
};

export function channelOf(tipo: TypeChannelDatabase): { logo: NameOfLogoOfChannel; nome: string } {
  return CHANNELS[tipo] ?? CHANNELS.widget;
}

/**
 * Display a ticket number such as `#1002`. Our domain has only a conversation UUID, not a sequential number; display its first six characters in uppercase, stable for that conversation. Ponytail: add a `sequencial` column to the conversation and use the real number here.
 */
export function numeroDoTicket(id: string): string {
  return '#' + id.replace(/-/g, '').slice(0, 6).toUpperCase();
}
