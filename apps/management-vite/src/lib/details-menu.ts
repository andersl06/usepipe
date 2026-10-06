import { useEffect, useRef } from 'react';

/** Index to focus after `key` inside a menu of `count` items; -1 when the menu is empty. */
export function nextMenuIndex(current: number, count: number, key: string): number {
  if (count <= 0) return -1;
  if (key === 'ArrowDown') return (current + 1) % count;
  if (key === 'ArrowUp') return current <= 0 ? count - 1 : current - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return current;
}

/**
 * Makes a `<details>` menu behave like a menu: Escape and outside clicks close it (Escape returns focus to
 * the summary), and arrow keys/Home/End move focus across its enabled buttons and links.
 */
export function useDetailsMenu() {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = ref.current;
    if (!details) return;

    const onPointerDown = (event: PointerEvent) => {
      if (details.open && !details.contains(event.target as Node)) details.open = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!details.open) return;
        details.open = false;
        details.querySelector<HTMLElement>('summary')?.focus();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !details.open) return;
      const items = [...details.querySelectorAll<HTMLElement>('.g-panel button:not(:disabled), .g-panel a[href]')];
      const next = nextMenuIndex(items.indexOf(document.activeElement as HTMLElement), items.length, event.key);
      if (next < 0) return;
      event.preventDefault();
      items[next]?.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    details.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      details.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return ref;
}
