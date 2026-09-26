import { useState } from 'react';

/**
 * The copy button on the summary card — the icon with a "Copiar" tooltip that sits next to the address and the ID on their screen. It's the ONLY client piece on this route; the rest of the panel is a Server Component. The clipboard only exists in the browser. Here it's a WORD, not an icon: there's no "copy" icon in either `icones-portal.tsx` or `@pipe/ui`, and borrowing an icon with a different meaning (a checkmark, a building) would say the wrong thing. The word matches their tooltip. When `navigator.clipboard` doesn't exist (HTTP without TLS, an old browser) the click does nothing — which is why the value next to it is real, selectable text, not a hidden attribute.
 */
export function BotaoCopiar({ value, oQue }: { value: string; oQue: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <button
      type="button"
      className="ct-copiar"
      title="Copiar"
      aria-label={`Copiar ${oQue}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopiado(true);
        });
      }}
    >
      {copiado ? 'Copiado' : 'Copiar'}
    </button>
  );
}
