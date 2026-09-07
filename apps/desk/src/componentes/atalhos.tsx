'use client';

import { useEffect } from 'react';
import { abrirDialogoEncerrar } from './dialogo-encerrar';

/**
 * Adaptado de chatwoot (MIT) —
 * https://github.com/chatwoot/chatwoot/blob/develop/app/javascript/shared/helpers/KeyboardHelpers.js
 * e https://github.com/chatwoot/chatwoot/blob/develop/app/javascript/dashboard/components/widgets/modal/constants.js
 *
 * Os atalhos de teclado que valem com o foco FORA de um campo (spec §11). Os do
 * compositor — `#`, `/`, `@` — já existiam e continuam onde estavam; estes aqui
 * são o outro estado da tela, o de quem está lendo a conversa e ainda não
 * escreveu nada.
 *
 * Duas divergências deliberadas do Chatwoot:
 *
 * 1. **Letra solta, sem `Alt`.** O `Alt+E` deles existe porque o dashboard tem
 *    um editor rico sempre montado e o foco quase nunca está fora dele. Aqui o
 *    foco fora do campo é o estado normal, e uma tecla é mais rápida que um
 *    acorde. A trava é a mesma deles (`isActiveElementTypeable`): dentro de um
 *    campo, tecla é texto.
 * 2. **`⌘K` para a busca**, que eles não têm. É o gesto que a pessoa já traz de
 *    outra ferramenta, e é o único que precisa funcionar mesmo com o cursor
 *    dentro de um campo — daí ele ser testado antes da trava.
 *
 * Nenhum atalho envia mensagem nem fecha conversa sozinho: `E` abre o diálogo de
 * encerramento, que continua exigindo etiqueta. Atalho que executa ação
 * irreversível num toque é o que faz o atendente perder um atendimento por ter
 * apoiado a mão no teclado.
 */

/** Os eventos que o compositor escuta, no `document`. */
export const EVENTO_NOTA = 'pipe:compositor-nota';
export const EVENTO_RESPOSTA_PRONTA = 'pipe:compositor-resposta-pronta';

/** A folha de atalhos é a de Ajuda que já existe no rodapé do trilho. */
export const ID_FOLHA_ATALHOS = 'dialogo-ajuda';

/** A mesma lista que a folha mostra e que o `useEffect` executa. */
export const ATALHOS_GLOBAIS: { tecla: string; faz: string }[] = [
  { tecla: '⌘ K', faz: 'Vai para a busca de atendimento, de onde você estiver' },
  { tecla: 'J', faz: 'Abre o próximo atendimento da lista' },
  { tecla: 'K', faz: 'Abre o atendimento anterior' },
  { tecla: '/', faz: 'Foca o campo e abre as respostas prontas' },
  { tecla: 'N', faz: 'Foca o campo já em nota interna' },
  { tecla: 'E', faz: 'Abre o encerramento — a etiqueta continua obrigatória' },
  { tecla: '?', faz: 'Abre esta folha' },
];

/**
 * Adaptado de chatwoot (MIT) — `isActiveElementTypeable`. O `NINJA-KEYS` e o
 * `ProseMirror` deles saíram: não temos paleta de comandos nem editor rico.
 */
function digitando(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  return (
    alvo.tagName === 'INPUT' ||
    alvo.tagName === 'TEXTAREA' ||
    alvo.tagName === 'SELECT' ||
    alvo.isContentEditable
  );
}

/**
 * Vizinha na lista renderizada. Ler o DOM em vez de receber a lista por
 * propriedade é o que deixa este componente sem acoplamento nenhum com a
 * coluna: a ordem que ele percorre é a que está na tela, seja qual for o
 * filtro, a ordem ou a fila escolhida.
 */
function irPara(passo: 1 | -1) {
  const itens = [...document.querySelectorAll<HTMLAnchorElement>('.convs .conv')];
  if (itens.length === 0) return;
  const atual = itens.findIndex((item) => item.getAttribute('aria-current') === 'true');
  // Sem seleção, `J` abre a primeira e `K` a última — cada uma na ponta de onde
  // a pessoa está vindo.
  const destino = atual === -1 ? (passo === 1 ? 0 : itens.length - 1) : atual + passo;
  itens[Math.max(0, Math.min(itens.length - 1, destino))]?.click();
}

/** Não desenha nada: monta uma vez na raiz e escuta o teclado. */
export function AtalhosDeTeclado() {
  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      // ⌘K / Ctrl+K vem antes da trava: é o atalho para SAIR de onde se está.
      if ((evento.metaKey || evento.ctrlKey) && evento.key.toLowerCase() === 'k') {
        evento.preventDefault();
        const campo = document.querySelector<HTMLInputElement>('.busca input[name="busca"]');
        campo?.focus();
        campo?.select();
        return;
      }
      if (evento.metaKey || evento.ctrlKey || evento.altKey) return;
      if (digitando(evento.target)) return;

      switch (evento.key.toLowerCase()) {
        case 'j':
          evento.preventDefault();
          irPara(1);
          return;
        case 'k':
          evento.preventDefault();
          irPara(-1);
          return;
        case '/':
          evento.preventDefault();
          document.dispatchEvent(new CustomEvent(EVENTO_RESPOSTA_PRONTA));
          return;
        case 'n':
          evento.preventDefault();
          document.dispatchEvent(new CustomEvent(EVENTO_NOTA));
          return;
        case 'e':
          evento.preventDefault();
          abrirDialogoEncerrar();
          return;
        case '?': {
          evento.preventDefault();
          const folha = document.getElementById(ID_FOLHA_ATALHOS);
          if (folha instanceof HTMLDialogElement) folha.showModal();
          return;
        }
        default:
      }
    }

    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, []);

  return null;
}
