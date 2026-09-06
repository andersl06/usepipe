'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconeGestao } from './icones-gestao';

/**
 * Recarrega os Server Components da rota a cada N segundos.
 *
 * Na linha do título, a Blip mostra só dois ícones: atualizar e tela cheia. O
 * "atualizar" daqui é o primeiro deles. O controle da recarga automática e a
 * hora da última atualização ficam à esquerda dos dois, em texto — a função
 * não se perde e a linha continua sendo a deles.
 *
 * **Ponto de extensão do realtime.** Fora do escopo desta entrega, o WebSocket
 * por tenant (§3 do desenho) entra exatamente aqui: em vez do `setInterval`,
 * assina o canal e chama `router.refresh()` quando chegar evento de conversa.
 * O resto da tela não muda — os dados continuam vindo do servidor.
 */
export function RecargaPeriodica({ segundos = 30 }: { segundos?: number }) {
  const router = useRouter();
  const [ligado, setLigado] = useState(true);
  const [ultima, setUltima] = useState<string>('');

  useEffect(() => {
    if (!ligado) return;
    const id = setInterval(() => {
      router.refresh();
      setUltima(new Date().toLocaleTimeString('pt-BR'));
    }, segundos * 1000);
    return () => clearInterval(id);
  }, [ligado, segundos, router]);

  return (
    <>
      <button
        type="button"
        className="btn-sutil"
        aria-pressed={ligado}
        title={`Recarga automática a cada ${segundos} segundos`}
        onClick={() => setLigado((v) => !v)}
      >
        {ligado ? `Auto ${segundos}s` : 'Auto pausado'}
      </button>
      <span className="sub">{ultima ? `atualizado ${ultima}` : 'aguardando'}</span>
      <button
        type="button"
        className="iconbtn"
        title="Atualizar agora"
        aria-label="Atualizar agora"
        onClick={() => {
          router.refresh();
          setUltima(new Date().toLocaleTimeString('pt-BR'));
        }}
      >
        <IconeGestao nome="atualizar" />
      </button>
    </>
  );
}
