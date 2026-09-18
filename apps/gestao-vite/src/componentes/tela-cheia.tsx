import { useEffect, useState } from 'react';
import { IconeGestao } from './icones-gestao';

/**
 * O segundo ícone da linha do título: tela cheia.
 *
 * Painel de monitoramento vive projetado na parede da operação, e é para isso
 * que o botão existe na tela deles. Usa a `Fullscreen API` do navegador, que
 * já resolve o caso inteiro — nenhuma biblioteca, nenhum estado global.
 */
export function TelaCheia() {
  const [cheia, setCheia] = useState(false);

  useEffect(() => {
    const aoTrocar = () => setCheia(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', aoTrocar);
    return () => document.removeEventListener('fullscreenchange', aoTrocar);
  }, []);

  function alternar() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  }

  const rotulo = cheia ? 'Sair da tela cheia' : 'Tela cheia';
  return (
    <button
      type="button"
      className="iconbtn"
      onClick={alternar}
      title={rotulo}
      aria-label={rotulo}
      aria-pressed={cheia}
    >
      <IconeGestao nome="telaCheia" />
    </button>
  );
}
