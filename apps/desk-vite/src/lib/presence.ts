/**
 * Tells F5 from a new tab: `sessionStorage` survives a reload and vanishes with the tab.
 * Both helpers tolerate unavailable storage (private mode, blocked cookies) and then report a new tab.
 */
const KEY = 'desk.aberto';

export function isReload(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    return storage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markOpened(storage: Pick<Storage, 'setItem'>): void {
  try {
    storage.setItem(KEY, '1');
  } catch {
    // Nothing to do: the next opening just reads as a new tab.
  }
}
