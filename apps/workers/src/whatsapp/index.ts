import type { ClienteWhatsApp } from './cliente.js';
import { dubleWhatsApp } from './duble.js';
import { ClienteWhatsAppReal } from './real.js';

export * from './cliente.js';
export * from './duble.js';
export * from './interativo.js';
export * from './media.js';
export * from './real.js';
export * from './template.js';

let escolhido: ClienteWhatsApp | null = null;

/**
 * `PIPE_WHATSAPP_CLIENTE=real` enables Cloud API; any other or absent value selects the double. Without a WABA, the double is the default to avoid repeated authentication failures from the real client.
 */
export function clienteWhatsApp(): ClienteWhatsApp {
  escolhido ??=
    process.env['PIPE_WHATSAPP_CLIENTE'] === 'real' ? new ClienteWhatsAppReal() : dubleWhatsApp;
  return escolhido;
}

/** Replace the client at runtime for tests and rehearsal mode. */
export function definirClienteWhatsApp(cliente: ClienteWhatsApp | null): void {
  escolhido = cliente;
}
