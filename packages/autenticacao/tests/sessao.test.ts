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
} from '../src/sessao.js';

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
    // Encerrada à mão vale menos que o prazo: sair tem de valer na hora.
    expect(estaValida({ expiraEm: futuro, encerradaEm: agora }, agora)).toBe(false);
  });

  it('o cookie leva HttpOnly, SameSite e Secure', () => {
    const c = cookieOfSession('abc', new Date('2026-09-07T18:00:00Z'));
    expect(c).toContain(`${NOME_DO_COOKIE}=abc`);
    // Sem HttpOnly, um XSS lê o token e vira sequestro de sessão.
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Secure');
  });

  it('em localhost o cookie sai sem Secure e SEM Domain', () => {
    //  invalida o cookie em vários navegadores, e o sintoma é
    // login que "não faz nada".
    const c = cookieOfSession('abc', new Date(), { seguro: false });
    expect(c).not.toContain('Secure');
    expect(c).not.toContain('Domain=');
  });

  it('Share the session cookie across application subdomains using the parent domain', () => {
    // A api mora em api.pipe.com.br e as telas em gestao/app/crm.pipe.com.br.
    // Sem o domínio-pai, cada uma precisaria do próprio login.
    const c = cookieOfSession('abc', new Date(), { domain: '.pipe.com.br' });
    expect(c).toContain('Domain=.pipe.com.br');
    // E continua Lax:  mandaria o cookie em requisição de qualquer site.
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
    expect(permitidas).toEqual(['https://gestao.pipe.com.br', 'https://app.pipe.com.br']);
    expect(origemPermitida('https://app.pipe.com.br', permitidas)).toBe(true);
    // Barra final não pode virar recusa: o navegador manda sem, mas o ambiente
    // costuma ser escrito com.
    expect(origemPermitida('https://app.pipe.com.br/', permitidas)).toBe(true);
    expect(origemPermitida('https://malicioso.example', permitidas)).toBe(false);
    expect(origemPermitida(undefined, permitidas)).toBe(false);
  });

  it('Compare tokens without leaking the length of a matching prefix', () => {
    expect(tokensEqual('abc', 'abc')).toBe(true);
    expect(tokensEqual('abc', 'abd')).toBe(false);
    expect(tokensEqual('abc', 'abcd')).toBe(false);
  });
});
