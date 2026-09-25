/**
 * Last-filter memory for the D-30 screens (`std/nav-contract.md` §Gestão):
 * a filter lives in React state, and only the last valid value is
 * remembered, per screen/tenant/user, under
 * `pipe:<app>:<screen>:filters:v1:<tenantId>:<userId>`. It never survives a
 * tenant or user switch in the same browser (the key changes), and a
 * malformed or stale stored value (ids that no longer belong to the loaded
 * queue/agent options, wrong shape, wrong version) is dropped by the
 * screen's own `validate` and removed from storage instead of crashing the
 * screen or leaking another account's filter.
 */

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): StorageLike | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    // Private mode in some browsers throws just accessing the property.
    return null;
  }
}

function safeRemove(storage: StorageLike, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore: private mode / quota errors on cleanup are not actionable.
  }
}

/** `null` when tenantId or userId is missing — never read/write without both. */
export function filterStorageKey(
  app: string,
  screen: string,
  tenantId: string,
  userId: string,
): string | null {
  if (!tenantId || !userId) return null;
  return `pipe:${app}:${screen}:filters:v1:${tenantId}:${userId}`;
}

/**
 * Reads and validates the stored filter. Any failure — no storage, no key,
 * bad JSON, or a validator rejecting the shape/ids as stale — returns
 * `null`; a parse or validation failure also removes the now-useless key.
 */
export function loadFilters<T>(
  key: string | null,
  validate: (value: unknown) => T | null,
  storage: StorageLike | null = browserStorage(),
): T | null {
  if (!key || !storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    safeRemove(storage, key);
    return null;
  }
  const validated = validate(parsed);
  if (validated === null) {
    safeRemove(storage, key);
    return null;
  }
  return validated;
}

/** No-op for a `null` key (missing tenant/user) or when storage is unavailable. */
export function saveFilters(
  key: string | null,
  value: unknown,
  storage: StorageLike | null = browserStorage(),
): void {
  if (!key || !storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore: quota exceeded / private mode. The filter just won't be remembered.
  }
}
