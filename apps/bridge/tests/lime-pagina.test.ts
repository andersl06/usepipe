import { describe, expect, it } from 'vitest';
import { collection, pagina, statusEncerra } from '../src/lime.js';

describe('pagina', () => {
  it('defaults to skip 0 / take 100', () => {
    expect(pagina(new URLSearchParams(''))).toEqual({ skip: 0, take: 100 });
  });
  it('honours $skip and caps $take at 100', () => {
    expect(pagina(new URLSearchParams('$skip=20&$take=500'))).toEqual({ skip: 20, take: 100 });
    expect(pagina(new URLSearchParams('$skip=5&$take=10'))).toEqual({ skip: 5, take: 10 });
  });
  it('ignores garbage', () => {
    expect(pagina(new URLSearchParams('$skip=-1&$take=x'))).toEqual({ skip: 0, take: 100 });
  });
});

describe('collection total', () => {
  it('uses the query total, not the page size', () => {
    const r = collection([1, 2], undefined, 250) as { resource: { total: number } };
    expect(r.resource.total).toBe(250);
  });
});

describe('statusEncerra', () => {
  it('only Closed* statuses close', () => {
    expect(statusEncerra('ClosedAttendant')).toBe(true);
    expect(statusEncerra('Open')).toBe(false);
    expect(statusEncerra(undefined)).toBe(false);
  });
});
