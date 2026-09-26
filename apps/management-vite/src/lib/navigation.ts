import { useEffect } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';

/**
 * Module-level navigation replaces former Server Action `redirect()` in the browser. Form actions remain module functions for `useActionState` and `<form action>`, so they cannot use a hook. `App` registers router `navigate` once; `irPara` uses the latest registration, falling back to `location` outside the router or before registration, with a page reload.
 */
let navegar: NavigateFunction | null = null;

export function irPara(url: string, options: { substituir?: boolean } = {}): void {
  if (navegar) navegar(url, { replace: options.substituir ?? false });
  else if (options.substituir) window.location.replace(url);
  else window.location.assign(url);
}


export function useRegisterNavigation(): void {
  const navigate = useNavigate();
  useEffect(() => {
    navegar = navigate;
    return () => {
      if (navegar === navigate) navegar = null;
    };
  }, [navigate]);
}
