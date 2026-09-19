import type { Conteudo } from './cliente.js';

/**
 * Pergunta do fluxo (o `select` da Blip) como mensagem interativa do WhatsApp.
 *
 * A régua é a da aba "Configurações" do canal na origem
 * (`docs/capturas/blip/canais/FICHA-canal-whatsapp.md` §3): com quick reply
 * ligado, até 3 opções saem como botões; com menu ligado, até 10 saem como
 * lista; o resto continua em texto numerado — que é também o que fica gravado
 * em `mensagem.conteudo` e o que o Desk mostra.
 *
 * Limites da Cloud API: título de botão até 20 caracteres, título de linha de
 * lista até 24, texto do corpo até 1024. Opção que não cabe NÃO é cortada — o
 * cliente leria outra coisa e a resposta dele não casaria com a opção do fluxo;
 * a pergunta inteira cai para texto.
 */

export const LIMITE_QUICK_REPLY = 3;
export const LIMITE_MENU = 10;
const TITULO_BOTAO_MAX = 20;
const TITULO_LINHA_MAX = 24;
const CORPO_MAX = 1024;
/** Texto do botão que abre a lista. A Meta exige um, até 20 caracteres. */
export const ROTULO_DA_LISTA = 'Ver opções';

export interface PreferenciasInterativas {
  quickReply: boolean;
  menu: boolean;
}

/** O que o fluxo guarda em `mensagem.dados.pergunta`. */
export interface PerguntaDoFluxo {
  texto: string;
  opcoes: string[];
}

export function formatoDaPergunta(
  opcoes: number,
  preferencias: PreferenciasInterativas,
): 'botoes' | 'lista' | 'texto' {
  if (opcoes < 1) return 'texto';
  if (preferencias.quickReply && opcoes <= LIMITE_QUICK_REPLY) return 'botoes';
  if (preferencias.menu && opcoes <= LIMITE_MENU) return 'lista';
  return 'texto';
}

/** Os dois interruptores nascem ligados, que é o estado observado na origem. */
export function preferenciasInterativasDe(config: Record<string, unknown> | null): PreferenciasInterativas {
  const guardado = (config?.['preferencias'] ?? {}) as Partial<PreferenciasInterativas>;
  return { quickReply: guardado.quickReply ?? true, menu: guardado.menu ?? true };
}

/** `null` = sai como texto (formato desligado, opção longa demais, corpo vazio ou grande). */
export function conteudoDaPergunta(
  pergunta: PerguntaDoFluxo,
  preferencias: PreferenciasInterativas,
): Conteudo | null {
  const formato = formatoDaPergunta(pergunta.opcoes.length, preferencias);
  if (formato === 'texto') return null;
  const texto = pergunta.texto.trim();
  if (!texto || texto.length > CORPO_MAX) return null;
  const limite = formato === 'botoes' ? TITULO_BOTAO_MAX : TITULO_LINHA_MAX;
  if (pergunta.opcoes.some((o) => !o.trim() || o.length > limite)) return null;
  // A Meta recusa títulos repetidos, e a resposta seria ambígua para o fluxo.
  if (new Set(pergunta.opcoes).size !== pergunta.opcoes.length) return null;
  return { tipo: 'interativo', formato, texto, opcoes: pergunta.opcoes };
}
