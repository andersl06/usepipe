import type { TipoCanalBanco } from '@pipe/contracts';

/**
 * O canal de cada conversa, como a referência o mostra: um selo com o logo
 * sobre o rosto do contato (`bds-icon type="logo" name="whatsapp"` no cartão)
 * e o nome por extenso no painel ("Canal: WhatsApp").
 *
 * Os logos são os de `componentes/icones-portal.tsx` (`asset-logo-*` da
 * origem); `widget` (o chat próprio) usa o de e-mail por falta de um logo
 * de chat que não seja marca deles.
 */
export type NomeDeLogoDeCanal = 'whatsapp' | 'instagram' | 'email';

export const CANAIS: Record<TipoCanalBanco, { logo: NomeDeLogoDeCanal; nome: string }> = {
  whatsapp_cloud: { logo: 'whatsapp', nome: 'WhatsApp' },
  instagram: { logo: 'instagram', nome: 'Instagram' },
  email: { logo: 'email', nome: 'E-mail' },
  widget: { logo: 'email', nome: 'Chat' },
};

export function canalDe(tipo: TipoCanalBanco): { logo: NomeDeLogoDeCanal; nome: string } {
  return CANAIS[tipo] ?? CANAIS.widget;
}

/**
 * "#1002" — o número do ticket. O nosso domínio não tem número sequencial de
 * conversa (só o uuid); o que vai na tela são os 6 primeiros caracteres, em
 * caixa alta, estáveis por conversa. ponytail: coluna `sequencial` na
 * conversa, e o número de verdade aqui.
 */
export function numeroDoTicket(id: string): string {
  return '#' + id.replace(/-/g, '').slice(0, 6).toUpperCase();
}
