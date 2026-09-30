import { describe, expect, it } from 'vitest';
import {
  DURATION_DEFAULT_MS,
  NOME_DO_COOKIE,
  cookieDeSaida,
  cookieOfSession,
  createToken,
  estaValida,
  hashDoToken,
  origemPermitida,
  origensPermitidas,
  tokensEqual,
} from '../src/session.js';

describe('Create and validate sessions', () => {
  it('Store the session token in the cookie and only its hash in the database', () => {
    const s = createToken();
    expect(s.hash).toHaveLength(64);
    expect(s.hash).not.toContain(s.token);
    expect(hashDoToken(s.token)).toBe(s.hash);
  });

  it('dois tokens nunca se repetem', () => {
    const vistos = new Set(Array.from({ length: 200 }, () => createToken().token));
    expect(vistos.size).toBe(200);
  });

  it('Expire sessions after eight hours by default', () => {
    const agora = new Date('2026-09-07T10:00:00Z');
    expect(createToken(DURATION_DEFAULT_MS, agora).expiraEm.toISOString()).toBe(
      '2026-09-07T18:00:00.000Z',
    );
  });

  it('Treat expired and closed sessions as invalid', () => {
    const agora = new Date('2026-09-07T12:00:00Z');
    const futuro = new Date('2026-09-07T20:00:00Z');
    const passado = new Date('2026-09-07T09:00:00Z');

    expect(estaValida({ expiraEm: futuro, encerradaEm: null }, agora)).toBe(true);
    expect(estaValida({ expiraEm: passado, encerradaEm: null }, agora)).toBe(false);
    // Ending a session manually overrides expiry: logout must take effect immediately.
    expect(estaValida({ expiraEm: futuro, encerradaEm: agora }, agora)).toBe(false);
  });

  it('o cookie leva HttpOnly, SameSite e Secure', () => {
    const c = cookieOfSession('abc', new Date('2026-09-07T18:00:00Z'));
    expect(c).toContain(`${NOME_DO_COOKIE}=abc`);
    // Without HttpOnly, XSS reads the token and steals the session.
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Secure');
  });

  it('em localhost o cookie sai sem Secure e SEM Domain', () => {
    // `Domain=localhost` invalidates cookies in several browsers, causing
    // login to appear to do nothing.
    const c = cookieOfSession('abc', new Date(), { seguro: false });
    expect(c).not.toContain('Secure');
    expect(c).not.toContain('Domain=');
  });

  it('Share the session cookie across application subdomains using the parent domain', () => {
    // The API is on `api.pipe.com.br` and the apps are on `gestao.pipe.com.br`, `app.pipe.com.br`, and `crm.pipe.com.br`.
    // Without the parent domain, each app would need a separate login.
    const c = cookieOfSession('abc', new Date(), { domain: '.pipe.com.br' });
    expect(c).toContain('Domain=.pipe.com.br');
    // Keep `SameSite=Lax`: `SameSite=None` would send the cookie on requests from any site.
    expect(c).toContain('SameSite=Lax');
  });

  it('Clear the logout cookie on the same domain', () => {
    expect(cookieDeSaida()).toContain('Max-Age=0');
    expect(cookieDeSaida({ domain: '.pipe.com.br' })).toContain('Domain=.pipe.com.br');
  });

  it('origem de fora da lista não fala com a api', () => {
    const permitidas = origensPermitidas({
      PIPE_ORIGENS: 'https://gestao.pipe.com.br, https://app.pipe.com.br/',
    } as NodeJS.ProcessEnv);
    expect(permitidas).toEqual({ fixed: ['https://gestao.pipe.com.br', 'https://app.pipe.com.br'], tenant: null });
    expect(origemPermitida('https://app.pipe.com.br', permitidas)).toBe(true);
    // A trailing slash must not cause rejection: browsers send origins without one, but environment values often include it.
    // costuma ser escrito com.
    expect(origemPermitida('https://app.pipe.com.br/', permitidas)).toBe(true);
    expect(origemPermitida('https://malicioso.example', permitidas)).toBe(false);
    expect(origemPermitida(undefined, permitidas)).toBe(false);
  });

  it('accepts only exact tenant origins with the configured scheme and port', () => {
    const allowed = origensPermitidas({
      PIPE_DOMINIO_CONTAS: 'pipe.test',
      PIPE_ORIGENS: 'https://crm.pipe.test',
    } as NodeJS.ProcessEnv);
    for (const origin of [
      'https://acme.pipe.test', 'https://acme.pipe.test/',
      'https://acme.desk.pipe.test', 'https://crm.pipe.test',
    ]) expect(origemPermitida(origin, allowed), origin).toBe(true);
    for (const origin of [
      'http://acme.pipe.test', 'https://acme.pipe.test:8443',
      'https://api.pipe.test', 'https://desk.pipe.test',
      'https://acme.pipe.test.evil.example', 'https://user@acme.pipe.test',
      'https://acme.pipe.test/caminho', '',
    ]) expect(origemPermitida(origin, allowed), origin).toBe(false);
    expect(origemPermitida(null, allowed)).toBe(false);
    expect(origemPermitida(undefined, allowed)).toBe(false);
    expect(origemPermitida('https://qualquer.example', origensPermitidas({ PIPE_ORIGENS: '*' } as NodeJS.ProcessEnv))).toBe(false);
  });

  it('Compare tokens without leaking the length of a matching prefix', () => {
    expect(tokensEqual('abc', 'abc')).toBe(true);
    expect(tokensEqual('abc', 'abd')).toBe(false);
    expect(tokensEqual('abc', 'abcd')).toBe(false);
  });
});
