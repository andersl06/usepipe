import { describe, expect, it } from 'vitest';
import {
  DURACAO_PADRAO_MS,
  NOME_DO_COOKIE,
  cookieDeSaida,
  cookieDeSessao,
  criarToken,
  estaValida,
  hashDoToken,
  origemPermitida,
  origensPermitidas,
  tokensIguais,
} from '../src/sessao.js';

describe('sessão', () => {
  it('o token vai para o cookie e só o hash para o banco', () => {
    const s = criarToken();
    expect(s.hash).toHaveLength(64);
    expect(s.hash).not.toContain(s.token);
    expect(hashDoToken(s.token)).toBe(s.hash);
  });

  it('dois tokens nunca se repetem', () => {
    const vistos = new Set(Array.from({ length: 200 }, () => criarToken().token));
    expect(vistos.size).toBe(200);
  });

  it('expira em 8 horas por padrão', () => {
    const agora = new Date('2026-09-07T10:00:00Z');
    expect(criarToken(DURACAO_PADRAO_MS, agora).expiraEm.toISOString()).toBe(
      '2026-09-07T18:00:00.000Z',
    );
  });

  it('sessão expirada e sessão encerrada dão a mesma resposta: inválida', () => {
    const agora = new Date('2026-09-07T12:00:00Z');
    const futuro = new Date('2026-09-07T20:00:00Z');
    const passado = new Date('2026-09-07T09:00:00Z');

    expect(estaValida({ expiraEm: futuro, encerradaEm: null }, agora)).toBe(true);
    expect(estaValida({ expiraEm: passado, encerradaEm: null }, agora)).toBe(false);
    // Encerrada à mão vale menos que o prazo: sair tem de valer na hora.
    expect(estaValida({ expiraEm: futuro, encerradaEm: agora }, agora)).toBe(false);
  });

  it('o cookie leva HttpOnly, SameSite e Secure', () => {
    const c = cookieDeSessao('abc', new Date('2026-09-07T18:00:00Z'));
    expect(c).toContain(`${NOME_DO_COOKIE}=abc`);
    // Sem HttpOnly, um XSS lê o token e vira sequestro de sessão.
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Secure');
  });

  it('em localhost o cookie sai sem Secure e SEM Domain', () => {
    //  invalida o cookie em vários navegadores, e o sintoma é
    // login que "não faz nada".
    const c = cookieDeSessao('abc', new Date(), { seguro: false });
    expect(c).not.toContain('Secure');
    expect(c).not.toContain('Domain=');
  });

  it('com domínio-pai o cookie viaja entre os subdomínios dos aplicativos', () => {
    // A api mora em api.pipe.com.br e as telas em gestao/app/crm.pipe.com.br.
    // Sem o domínio-pai, cada uma precisaria do próprio login.
    const c = cookieDeSessao('abc', new Date(), { dominio: '.pipe.com.br' });
    expect(c).toContain('Domain=.pipe.com.br');
    // E continua Lax:  mandaria o cookie em requisição de qualquer site.
    expect(c).toContain('SameSite=Lax');
  });

  it('o cookie de saída apaga o valor no mesmo domínio', () => {
    expect(cookieDeSaida()).toContain('Max-Age=0');
    expect(cookieDeSaida({ dominio: '.pipe.com.br' })).toContain('Domain=.pipe.com.br');
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

  it('comparação de token não vaza tamanho de acerto', () => {
    expect(tokensIguais('abc', 'abc')).toBe(true);
    expect(tokensIguais('abc', 'abd')).toBe(false);
    expect(tokensIguais('abc', 'abcd')).toBe(false);
  });
});
