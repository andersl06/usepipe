/**
 * As preferências do atendente — as que a tela de referência oferece na aba de
 * Preferências (`docs/pesquisa/blip-desk-preferencias.md`), com os mesmos
 * rótulos em português.
 *
 * **Elas moram no navegador, e isso é decisão, não atalho.** As cinco dizem
 * respeito à MÁQUINA em que a pessoa está sentada, não à pessoa: se sai som,
 * se o sistema operacional deixa notificar, se o corretor do navegador está
 * carregado, se esta aba deve segurar o status. A mesma pessoa no computador do
 * escritório e no de casa quer respostas diferentes para as cinco, e uma
 * preferência guardada no banco daria a mesma resposta nas duas — que é o
 * defeito, não a virtude.
 *
 * ponytail: `localStorage`, uma chave por preferência. Se um dia aparecer uma
 * preferência que é da PESSOA e não da máquina (idioma, fuso, assinatura), aí
 * sim nasce a tabela com tenant e usuário sob RLS, e esta camada passa a ler
 * dos dois lugares — o da máquina continua aqui.
 *
 * Este arquivo é puro de propósito: ele não toca `window`. Quem toca é
 * `componentes/preferencias.tsx`. Assim as regras (padrão, leitura de valor
 * estragado, serialização) têm teste sem precisar de navegador.
 */

export const PREFERENCIAS = [
  {
    chave: 'somTicket',
    secao: 'Alertas sonoros',
    rotulo: 'Alertas sonoros para novos tickets',
    ajuda: 'Receba alertas sonoros quando novos atendimentos forem atribuídos a você.',
    padrao: true,
  },
  {
    chave: 'somMensagem',
    secao: 'Alertas sonoros',
    rotulo: 'Alertas sonoros na aba ativa do navegador',
    ajuda: 'Receba alertas sonoros enquanto a aba do navegador estiver ativa.',
    padrao: false,
  },
  {
    chave: 'notificacaoNavegador',
    secao: 'Notificações do navegador',
    rotulo: 'Notificações do navegador',
    ajuda: 'Avisa fora da aba do Desk. Precisa da permissão do navegador.',
    padrao: false,
  },
  {
    chave: 'manterOnline',
    secao: 'Ao fechar',
    rotulo: 'Continuar online ao fechar o Pipe Desk',
    ajuda: 'Sem isto, vinte minutos parado derrubam o seu status para Offline.',
    padrao: false,
  },
  {
    chave: 'corretor',
    secao: 'Corretor de textos',
    rotulo: 'Corretor ortográfico',
    ajuda:
      'O corretor pode levar alguns instantes para carregar, variando conforme o desempenho do seu computador.',
    padrao: true,
  },
] as const;

export type ChaveDePreferencia = (typeof PREFERENCIAS)[number]['chave'];

export type Preferencias = Record<ChaveDePreferencia, boolean>;

/** O prefixo evita colidir com o que outra aplicação do Pipe guardar no mesmo domínio. */
export const PREFIXO = 'pipe.desk.pref.';

/** Disparado a cada gravação, para as telas abertas reagirem sem recarregar. */
export const EVENTO_PREFERENCIA = 'pipe:preferencia';

export function padroes(): Preferencias {
  return Object.fromEntries(PREFERENCIAS.map((p) => [p.chave, p.padrao])) as Preferencias;
}

/**
 * Interpreta o que estava guardado.
 *
 * Só `'sim'` e `'nao'` são respostas; **qualquer outra coisa cai no padrão**, e
 * isso inclui `null`, texto de outra versão e o que alguém digitou à mão no
 * console. Preferência estragada que vira `false` silenciosamente é como um
 * atendente perde o alerta de ticket novo sem nunca ter desligado nada.
 */
export function lerValor(chave: ChaveDePreferencia, guardado: string | null): boolean {
  if (guardado === 'sim') return true;
  if (guardado === 'nao') return false;
  return PREFERENCIAS.find((p) => p.chave === chave)?.padrao ?? false;
}

export function comoTexto(ligada: boolean): string {
  return ligada ? 'sim' : 'nao';
}

export function nomeDaChave(chave: ChaveDePreferencia): string {
  return `${PREFIXO}${chave}`;
}

/** As seções, na ordem em que aparecem, sem repetir. A ordem é regra. */
export function secoes(): string[] {
  return [...new Set(PREFERENCIAS.map((p) => p.secao))];
}
