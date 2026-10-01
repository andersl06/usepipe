/**
 * Contact identities in the formats Blip shows, fixed from 03.1-ENSAIOS.md (roteador.contact_identity_no_subbot,
 * roteador.tunnel_identity, roteador.tunnel_originator). Pipe has no tunnel table: the tunnel identity is
 * derived from the contact id, and a contact is never duplicated per tunnel.
 */
export const CHANNEL_DOMAIN = 'wa.gw.msging.net';
export const TUNNEL_DOMAIN = 'tunnel.msging.net';

export type KnownContact = { contactId: string; phone?: string | null };

const digits = (value: unknown): string => (typeof value === 'string' ? value.replace(/\D/g, '') : '');

/** `<phone digits>@wa.gw.msging.net`; a contact without phone carries its id in place of the phone (a GUID is valid there). */
export function channelIdentity({ contactId, phone }: KnownContact): string {
  return `${digits(phone) || contactId}@${CHANNEL_DOMAIN}`;
}

/** `<contact id>@tunnel.msging.net`: Blip's tunnel identity and, behind a router, the contact's own identity. */
export function tunnelIdentity(contactId: string): string {
  return `${contactId}@${TUNNEL_DOMAIN}`;
}

/**
 * The known contact's id when `identity` names it (bare id, tunnel identity or channel identity), else null.
 * Any other contact is refused: the caller never resolves identities of other people.
 */
export function contactIdFromIdentity(identity: string, known: KnownContact): string | null {
  const at = identity.indexOf('@');
  const local = at < 0 ? identity : identity.slice(0, at);
  // Any domain: flows spell it as they like, only the local part names the person.
  if (identity === known.contactId || local === known.contactId) return known.contactId;
  const phone = digits(known.phone);
  if (phone && digits(local) === phone && local.replace(/\D/g, '') === local) return known.contactId;
  return null;
}
