'use client';

import { useEffect, useRef } from 'react';
import { usePreferencia } from './preferencias';

/**
 * Os avisos de atendimento novo e de mensagem nova — som e notificação do
 * navegador —, que são o que dá função aos interruptores da aba de
 * Preferências.
 *
 * Como ele sabe que chegou coisa nova, sem tempo real: a fila é recarregada a
 * cada 15 segundos (`recarga-fila.tsx`), e a recarga entrega props novas a este
 * componente **sem apagar o estado dele**. Então basta guardar o que já foi
 * visto e comparar. É sondagem, e o atraso é de até 15 segundos; quando o
 * WebSocket entrar, o gatilho muda e o resto daqui fica igual.
 *
 * Nada dispara no primeiro desenho. Sem essa trava, abrir o Desk com dez
 * conversas na fila tocaria dez vezes e abriria dez notificações — que é o modo
 * mais rápido de fazer o atendente desligar os dois interruptores para sempre.
 *
 * O som é gerado na hora, com um oscilador do próprio navegador. Não há arquivo
 * de áudio no repositório: som de terceiro não entra, e um bipe de duas notas
 * não justifica um binário.
 */

export interface ConversaVigiada {
  id: string;
  contatoNome: string | null;
  /** Em milissegundos, para comparar sem recriar `Date` a cada volta. */
  ultimaMensagemEm: number | null;
  ultimaMensagemDe: string | null;
}

/**
 * Um bipe curto. Duas alturas: a de ticket novo sobe, a de mensagem é mais
 * baixa e mais curta — quem atende reconhece qual é sem olhar a tela.
 */
function bipe(alto: boolean): void {
  try {
    const Audio = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) return;
    const ctx = new Audio();
    const nota = ctx.createOscillator();
    const volume = ctx.createGain();
    nota.type = 'sine';
    nota.frequency.value = alto ? 880 : 520;
    volume.gain.setValueAtTime(0.0001, ctx.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    volume.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (alto ? 0.28 : 0.16));
    nota.connect(volume).connect(ctx.destination);
    nota.start();
    nota.stop(ctx.currentTime + (alto ? 0.3 : 0.18));
    nota.onended = () => void ctx.close();
  } catch {
    // Navegador que ainda não teve interação do usuário bloqueia o áudio. Não
    // é erro nosso e não vale um aviso na tela.
  }
}

function notificar(titulo: string, corpo: string): void {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const aviso = new Notification(titulo, { body: corpo, tag: 'pipe-desk' });
    // A referência fecha o aviso sozinha em 5 segundos; o mesmo aqui, para não
    // empilhar cartão em cima de cartão em quem deixou o Desk aberto.
    window.setTimeout(() => aviso.close(), 5000);
  } catch {
    // Notificação recusada pelo sistema operacional. Silêncio é o certo.
  }
}

export function Avisos({ conversas }: { conversas: ConversaVigiada[] }) {
  const [somTicket] = usePreferencia('somTicket');
  const [somMensagem] = usePreferencia('somMensagem');
  const [notificacao] = usePreferencia('notificacaoNavegador');

  /** O que já foi visto: id → instante da última mensagem. */
  const visto = useRef<Map<string, number> | null>(null);

  useEffect(() => {
    const anterior = visto.current;
    const atual = new Map(conversas.map((c) => [c.id, c.ultimaMensagemEm ?? 0]));
    visto.current = atual;
    // Primeira volta: só memoriza. Nada toca.
    if (anterior === null) return;

    let ticketNovo: ConversaVigiada | null = null;
    let mensagemNova: ConversaVigiada | null = null;

    for (const conversa of conversas) {
      const antes = anterior.get(conversa.id);
      if (antes === undefined) {
        ticketNovo ??= conversa;
        continue;
      }
      // Mensagem nova só conta quando a última palavra é do CLIENTE: a
      // conversa também se mexe quando o próprio atendente responde, e avisar
      // alguém do que ele mesmo acabou de escrever é ruído puro.
      if ((conversa.ultimaMensagemEm ?? 0) > antes && conversa.ultimaMensagemDe === 'contato') {
        mensagemNova ??= conversa;
      }
    }

    // Um aviso por rodada, e o atendimento novo ganha do resto: se dez coisas
    // aconteceram nos últimos quinze segundos, dez bipes não dizem mais do que
    // um, e a fila na tela já mostra o quanto chegou.
    if (ticketNovo) {
      if (somTicket) bipe(true);
      if (notificacao) {
        notificar('Novo atendimento', `${ticketNovo.contatoNome ?? 'Sem nome'} entrou na sua fila.`);
      }
      return;
    }
    if (mensagemNova) {
      // O alerta de mensagem é o "da aba ativa": com a aba escondida quem
      // avisa é a notificação, que aparece por cima de qualquer janela.
      if (somMensagem && document.visibilityState === 'visible') bipe(false);
      if (notificacao && document.visibilityState !== 'visible') {
        notificar('Nova mensagem', `${mensagemNova.contatoNome ?? 'Sem nome'} respondeu.`);
      }
    }
  }, [conversas, somTicket, somMensagem, notificacao]);

  return null;
}
