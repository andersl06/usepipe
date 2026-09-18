'use client';

import './interruptor.css';

/**
 * O `bds-switch` da origem: `<label class="switch switch--size-standard">
 * <input type="checkbox"> <span class="slider round"></span> </label>`.
 * Medido na cópia: trilho 42×24 (padrão) e 32×18 (`size="short"`), raio 34,
 * bolinha branca de 18/12 a 3px da borda, deslocando o próprio diâmetro
 * quando ligado. Desligado o trilho é `--color-content-ghost`, ligado é a
 * primária. O host `bds-switch` mede 42×32: 2px acima e 6px abaixo do trilho
 * (é o `margin-bottom: .375rem` do `label` global).
 *
 * Serve o Webhook (Integrações) e o Log (Growth); por isso mora aqui e não
 * dentro de uma tela. Sem estado próprio: quem liga é quem chama.
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
  aoMudar: (valor: boolean) => void;
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
      <span className="ig-interruptor-trilho" aria-hidden="true" />
    </label>
  );
}
