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

