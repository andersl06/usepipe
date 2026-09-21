/**
 * Rastreador de cliques (Growth) — os tipos e a regra pura de
 * `GET`/`POST /v1/gestao/fluxos/:fluxoId/links-rastreados`
 * (`apps/api/src/dominio/rastreador-de-cliques.ts`, testado em
 * `apps/api/tests/growth.test.ts`).
 *
 * NÃO é o `growth/clicktracker` que já existe (`clicktracker/clicktracker.tsx`)
 * — aquele é a medição de anúncios Click-to-WhatsApp da Meta, sem link nenhum
 * para cadastrar; o comentário no topo do domínio confirma a distinção. Esta é
 * uma tela irmã, nova, sem tela equivalente na Blip para medir a régua visual
 * — a forma segue a dos outros itens do menu Growth (`mensagens-ativas`,
 * `pagamentos`), não uma ficha capturada.
 *
 * Arquivo À PARTE de `gravar.ts` (que importa `./api`, que lê
 * `import.meta.env` e quebra fora do Vite) — mesma separação de
 * `cadastros.ts`/`cadastros-gravar.ts` e `regras.ts`/`disparo.ts`: aqui só o
 * que `node --test` consegue importar puro.
 */

export interface LinkRastreado {
  id: string;
  fluxoId: string;
  nome: string;
  destinoUrl: string;
  codigo: string;
  urlCurta: string;
  cliques: number;
  criadoEm: string;
}

export type Resultado<T> =
  | { ok: true; valor: T }
  | { ok: false; erro: string; campo?: 'nome' | 'destino' };

/**
 * O corpo do erro (`{erro:{codigo,mensagem}}`) deste endpoint não manda
 * `detalhe.campo` — só o `codigo` diz qual campo é (`criarLinkRastreado` em
 * `dominio/rastreador-de-cliques.ts` e `confirmarUrlSegura` em
 * `dominio/gestao/integracoes.ts`). Mapeado aqui, não lá: mudar de campo é
 * mudar de tela, não de domínio.
 */
export function campoDoErroDeLink(codigo: string): 'nome' | 'destino' | undefined {
  if (codigo === 'nome_obrigatorio') return 'nome';
  if (
    codigo === 'destino_obrigatorio' ||
    codigo === 'url_invalida' ||
    codigo === 'url_precisa_https' ||
    codigo === 'url_proibida'
  ) {
    return 'destino';
  }
  return undefined;
}
