import { startTransition } from 'react';
import type { FormEvent } from 'react';

/**
 * Preserve entered values on form validation errors. React 19 `startHostTransition` calls `requestFormReset` for uncontrolled `<form action={…}>` as soon as the action starts, even if the server rejects it, making users retype fields. Call the `useActionState` dispatcher manually instead of using the form `action` attribute, so automatic reset does not run. Keep `startTransition` to drive `enviando` and the `Salvando...` button state. Each screen still calls its own `formulario.reset()` after success in `useEffect`.
 */
export function envioQuePreserva(
  despachar: (data: FormData) => void,
): (evento: FormEvent<HTMLFormElement>) => void {
  return (evento) => {
    evento.preventDefault();
    const data = new FormData(evento.currentTarget);
    startTransition(() => despachar(data));
  };
}
