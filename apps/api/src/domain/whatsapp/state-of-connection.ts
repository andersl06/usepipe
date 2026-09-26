import { randomBytes } from 'node:crypto';
import { cifrar, decifrar } from '@pipe/db';
import { keyring } from '../../database.js';
import { PipeError } from '../../errors.js';

/**
 * Embedded signup `state` is a Pipe addition. Chatwoot's `FB.login` SDK returns `code` to its own JavaScript and sends an authenticated POST; Blip uses redirect with random per-opening `state`. Pipe also binds `state` to prevent an attacker from making an administrator's browser submit a code for the attacker's WABA, causing the tenant to serve someone else's number. The server issues a ten-minute `state` bound to session user and tenant, encrypted and authenticated by the Meta-token keyring (AES-256-GCM); tampering makes decryption fail without a new table. ponytail: it is not single-use; replay within ten minutes is bound to the same user and tenant, and Meta's `code` is single-use for 30 seconds. Add a spent-state table if single-use state becomes required.
 */

const VALIDITY_MS = 10 * 60 * 1000;

interface ContentOfState {
  t: string;
  u: string;
  e: number;
  n: string;
}

export function issueState(tenantId: string, userId: string, agora = Date.now()): string {
  const conteudo: ContentOfState = {
    t: tenantId,
    u: userId,
    e: agora + VALIDITY_MS,
    n: randomBytes(8).toString('hex'),
  };
  return cifrar(JSON.stringify(conteudo), keyring());
}

export function checkState(
  state: string | undefined,
  tenantId: string,
  usuarioId: string,
  agora = Date.now(),
): void {
  let conteudo: ContentOfState | null = null;
  try {
    conteudo = state ? (JSON.parse(decifrar(state, keyring())) as ContentOfState) : null;
  } catch {
    conteudo = null;
  }
  // Missing, forged, expired, or other-session `state` values all return the same response to avoid revealing which check failed.
  if (!conteudo || conteudo.t !== tenantId || conteudo.u !== usuarioId || !(conteudo.e > agora)) {
    throw new PipeError(
      403,
      'state_invalid',
      'A conexão com a Meta não partiu desta sessão, ou demorou demais. Abra o cadastro de novo.',
    );
  }
}
