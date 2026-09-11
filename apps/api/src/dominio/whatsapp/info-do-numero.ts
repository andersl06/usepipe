import { ErroPipe } from '../../erros.js';
import { clienteGraph } from './cliente-graph.js';
import type { NumeroDaWaba } from './cliente-graph.js';

/**
 * Portado de chatwoot/chatwoot (MIT), app/services/whatsapp/phone_info_service.rb
 *
 * A regra que o original deixa escrita e que vale repetir: **identificador
 * informado é autoritativo.** Se o `phone_number_id` veio do evento do cadastro e
 * não está na WABA, é erro — nunca cair para "o primeiro número", que numa WABA
 * com vários conectaria (ou reautorizaria) o número errado em silêncio.
 */

export interface InfoDoNumero {
  numeroId: string;
  /** `+` e só dígitos, como o `phone_number` do canal no original. */
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
  if (!wabaId) throw ErroPipe.requisicao('waba_ausente', 'O WABA ID é obrigatório.');
  if (!token) throw ErroPipe.requisicao('token_ausente', 'O token de acesso é obrigatório.');

  const numeros = await clienteGraph(token).buscarTodosOsNumeros(wabaId);
  if (numeros.length === 0) {
    throw new ErroPipe(422, 'waba_sem_numero', `Nenhum número encontrado para a WABA ${wabaId}.`);
  }

  const dados = acharNumero(numeros, wabaId, numeroId, numeroEsperado ?? null);
  if (!dados) {
    throw new ErroPipe(
      422,
      'numero_nao_encontrado',
      `Nenhum número correspondente encontrado para a WABA ${wabaId}.`,
    );
  }

  return {
    numeroId: dados.id,
    numero: `+${sanitizarNumero(dados.display_phone_number)}`,
    verificado: dados.code_verification_status === 'VERIFIED',
    nomeDaEmpresa: dados.verified_name || dados.display_phone_number || '',
  };
}

function acharNumero(
  numeros: NumeroDaWaba[],
  wabaId: string,
  numeroId: string | undefined,
  esperado: string | null,
): NumeroDaWaba | undefined {
  if (numeroId) return numeros.find((n) => n.id === numeroId);
  // Coexistência pode chegar sem `phone_number_id`: na reautorização, casa pelo
  // número que o canal já tem, em vez de pegar o primeiro da WABA.
  if (esperado) {
    const alvo = `+${sanitizarNumero(esperado)}`;
    return numeros.find((n) => `+${sanitizarNumero(n.display_phone_number)}` === alvo);
  }
  // Sem identificador nenhum, só um número único é inequívoco.
  if (numeros.length > 1) {
    throw new ErroPipe(
      422,
      'numero_ambiguo',
      `Vários números encontrados para a WABA ${wabaId}; não dá para saber qual foi conectado.`,
    );
  }
  return numeros[0];
}
