import './interruptor.css';

/**
 * The origin's `bds-switch`: `<label class="switch switch--size-standard"> <input type="checkbox"> <span class="slider round"></span> </label>`. Measured on the copy: 42×24 track (default) and 32×18 (`size="short"`), 34 radius, 18/12 white knob 3px from the edge, sliding its own diameter when on. Off, the track is `--color-content-ghost`; on, it's the primary color. The `bds-switch` host measures 42×32: 2px above and 6px below the track (the global `label`'s `margin-bottom: .375rem`).
 *
 * Serves both Webhook (Integrações) and Log (Growth); that's why it lives here and not inside one screen. No state of its own: whoever calls it controls the toggle.
 */
export function Interruptor({
  id,
  ligado,
  desabilitado,
  curto,
  className,
  rotulo,
  aoMudar,
}: {
  id: string;
  ligado: boolean;
  desabilitado?: boolean;
  curto?: boolean;
  className?: string;
  rotulo?: string;
  aoMudar: (value: boolean) => void;
}) {
  return (
    <label
      className={['ig-interruptor', curto ? 'ig-interruptor--curto' : '', className ?? '']
        .join(' ')
        .trim()}
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-label={rotulo}
        checked={ligado}
        disabled={desabilitado}
        onChange={(evento) => aoMudar(evento.target.checked)}
      />
      <span className="ig-switch-rail" aria-hidden="true" />
    </label>
  );
}
