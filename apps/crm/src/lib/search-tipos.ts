/**
 * O contrato da busca global, separado da consulta.
 *
 * Existe porque `menu-de-comando.tsx` é componente de CLIENTE e precisa destes
 * tipos: importá-los de `busca.ts` arrastaria `banco.ts` e o `pg` para o
 * bundle do navegador, e o Next falha com "module not found: fs".
 *
 * Quando o front virar Vite isto migra para `packages/contracts` — é
 * exatamente o papel dele.
 */

export type TipoDeResultado = 'lead' | 'oportunidade' | 'conta' | 'contato';

export interface Resultado {
  tipo: TipoDeResultado;
  id: string;
  titulo: string;
  /** A linha de baixo: o que distingue dois registros de nome parecido. */
  detalhe: string | null;
  href: string;
}

/** Rótulo de cada grupo, na ordem em que o menu os mostra. */
export const ROTULO_DO_TIPO: Record<TipoDeResultado, string> = {
  lead: 'Leads',
  oportunidade: 'Oportunidades',
  conta: 'Contas',
  contato: 'Contatos',
};
