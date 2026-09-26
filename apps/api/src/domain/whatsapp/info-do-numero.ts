import { PipeError } from '../../errors.js';
import { clienteGraph } from './cliente-graph.js';
import type { NumeroDaWaba } from './cliente-graph.js';

/**
 * Ported from chatwoot/chatwoot (MIT), app/services/whatsapp/phone_info_service.rb. A supplied identifier is authoritative: if signup's `phone_number_id` is absent from the WABA, fail. Never fall back to its first number, which could silently connect or reauthorize the wrong number in a multi-number WABA.
 */

export interface InfoDoNumero {
  numeroId: string;
  /** `+` followed only by digits, as in the original channel `phone_number`. */
  numero: string;
  verificado: boolean;
  nomeDaEmpresa: string;
}

export function sanitizarNumero(numero: string | undefined | null): string {
  return (numero ?? '').replace(/[\s\-().+]/g, '').trim();
}

export async function buscarInfoDoNumero(
  wabaId: string | undefined,
  numeroId: string | undefined,
  token: string | undefined,
  numeroEsperado?: string | null,
): Promise<InfoDoNumero> {
  if (!wabaId) throw PipeError.request('waba_missing', 'O WABA ID é obrigatório.');
  if (!token) throw PipeError.request('token_missing', 'O token de acesso é obrigatório.');

  const numeros = await clienteGraph(token).buscarTodosOsNumeros(wabaId);
  if (numeros.length === 0) {
    throw new PipeError(422, 'waba_without_number', `Nenhum número encontrado para a WABA ${wabaId}.`);
  }

  const data = acharNumero(numeros, wabaId, numeroId, numeroEsperado ?? null);
  if (!data) {
    throw new PipeError(
      422,
      'number_not_found',
      `Nenhum número correspondente encontrado para a WABA ${wabaId}.`,
    );
  }

  return {
    numeroId: data.id,
    numero: `+${sanitizarNumero(data.display_phone_number)}`,
    verificado: data.code_verification_status === 'VERIFIED',
    nomeDaEmpresa: data.verified_name || data.display_phone_number || '',
  };
}

function acharNumero(
  numeros: NumeroDaWaba[],
  wabaId: string,
  numeroId: string | undefined,
  esperado: string | null,
): NumeroDaWaba | undefined {
  if (numeroId) return numeros.find((n) => n.id === numeroId);
  // Coexistence may omit `phone_number_id`; on reauthorization match the channel's existing number instead of the WABA's first number.
  if (esperado) {
    const alvo = `+${sanitizarNumero(esperado)}`;
    return numeros.find((n) => `+${sanitizarNumero(n.display_phone_number)}` === alvo);
  }
  // Without any identifier, only a single number is unambiguous.
  if (numeros.length > 1) {
    throw new PipeError(
      422,
      'number_ambiguous',
      `Vários números encontrados para a WABA ${wabaId}; não dá para saber qual foi conectado.`,
    );
  }
  return numeros[0];
}
