'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RECARGA_FILA_MS } from '../lib/operacao';

/**
 * Recarrega a fila a cada 15 segundos, que é a régua medida na tela de
 * referência e registrada em `docs/pesquisa/blip-desk-medidas.md`, §9.
 *
 * Até aqui o Desk só atualizava quando o atendente navegava ou quando uma ação
 * dele revalidava a rota. Na prática isso significa que uma conversa nova
 * podia ficar invisível por meia hora se ninguém clicasse em nada — e o
 * atendente descobria pelo cliente reclamando, não pela tela.
 *
 * `router.refresh()` e não `location.reload()`: o primeiro refaz só os
 * componentes de servidor e **preserva o estado do cliente**, ou seja, o texto
 * meio escrito no compositor, a rolagem da conversa e o diálogo aberto
 * sobrevivem à recarga. O segundo jogaria tudo fora a cada quinze segundos, que
 * é o modo mais rápido de fazer um atendente odiar a ferramenta.
 *
 * Com a aba em segundo plano o relógio para, e a volta para a aba recarrega na
 * hora. O resultado que o atendente vê é o mesmo — a fila está fresca sempre
 * que ele olha — sem manter uma consulta de banco por atendente por aba
 * esquecida.
 *
 * Isto é a etapa intermediária, e assumidamente uma sondagem: quando o tempo
 * real por WebSocket entrar, este componente sai inteiro e a fila passa a ser
 * empurrada pelo servidor, sem espera de até 15 segundos.
 */
export function RecargaDaFila() {
  const router = useRouter();

  useEffect(() => {
    function agora(): void {
      router.refresh();
    }

    const relogio = window.setInterval(() => {
      if (document.visibilityState === 'visible') agora();
    }, RECARGA_FILA_MS);

    function aoVoltar(): void {
      if (document.visibilityState === 'visible') agora();
    }

    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      window.clearInterval(relogio);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [router]);

  return null;
}
