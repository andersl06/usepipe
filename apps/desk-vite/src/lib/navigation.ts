import { useEffect } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';

/**
 * Module-level navigation replaces the former Server Action `redirect()` in the browser. Form actions remain module functions for `useActionState` and `<form action>`, so they cannot call a hook. `App` registers React Router's `navigate` once; `irPara` uses the most recently registered one. Before registration or outside the router, fall back to `location`, which reaches the same destination with a reload.
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
