import type { ClienteWhatsApp } from './cliente.js';
import { dubleWhatsApp } from './duble.js';
import { ClienteWhatsAppReal } from './real.js';

export * from './cliente.js';
export * from './duble.js';
export * from './interativo.js';
export * from './midia.js';
export * from './real.js';
export * from './template.js';

let escolhido: ClienteWhatsApp | null = null;

/**
 * `PIPE_WHATSAPP_CLIENTE=real` liga a Cloud API; qualquer outro valor (ou nenhum)
 * usa o dublê. O padrão é o dublê porque hoje não há WABA: com credencial ausente,
 * o cliente real só produziria erro de autenticação em série.
 */
export function clienteWhatsApp(): ClienteWhatsApp {
  escolhido ??=
    process.env['PIPE_WHATSAPP_CLIENTE'] === 'real' ? new ClienteWhatsAppReal() : dubleWhatsApp;
  return escolhido;
}

/** Troca o cliente em tempo de execução. Existe para teste e para o modo de ensaio. */
export function definirClienteWhatsApp(cliente: ClienteWhatsApp | null): void {
  escolhido = cliente;
}
