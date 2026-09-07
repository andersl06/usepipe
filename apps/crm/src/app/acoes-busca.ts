'use server';

import { buscar } from '../lib/busca';
import type { Resultado } from '../lib/busca';

/**
 * A busca do menu de comando, chamada a cada tecla.
 *
 * Server action e não rota: o menu é o único consumidor, e uma rota exigiria
 * autenticar de novo o que a sessão já resolveu. Quando o front virar Vite isto
 * vira endpoint na `api` — está registrado em
 * `docs/specs/2026-09-07-arquitetura-de-front.md`.
 *
 * Nunca lança: o menu de comando não pode derrubar a tela em que a pessoa está.
 * Falha vira lista vazia, e a pessoa fecha e continua o que fazia.
 */
export async function buscarGlobal(termo: string): Promise<Resultado[]> {
  try {
    return await buscar(termo);
  } catch {
    return [];
  }
}
