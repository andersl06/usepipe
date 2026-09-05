'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Recarrega os Server Components da rota a cada N segundos.
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
        className="btn"
        onClick={() => {
          router.refresh();
          setUltima(new Date().toLocaleTimeString('pt-BR'));
        }}
      >
        Atualizar
      </button>
      <button
        type="button"
        className="btn"
        aria-pressed={ligado}
        onClick={() => setLigado((v) => !v)}
      >
        {ligado ? `Auto ${segundos}s: ligado` : `Auto ${segundos}s: pausado`}
      </button>
      <span className="lbl">{ultima ? `atualizado ${ultima}` : 'aguardando'}</span>
    </>
  );
}
