import { describe, expect, it } from 'vitest';
import { diferenca, registrarAuditoria } from '../src/auditoria.js';
import type { TransacaoPipe } from '../src/tenant.js';

/**
 * O log é lido por gente do suporte e sai em auditoria de contrato. Estes
 * testes protegem duas coisas: que segredo nunca chegue lá, e que o registro
 * diga o que mudou em vez de repetir o objeto inteiro.
 */
describe('auditoria', () => {
  function txFalsa() {
    const gravado: Record<string, unknown>[] = [];
    const tx = {
      insert: () => ({
        values: async (v: Record<string, unknown>) => {
          gravado.push(v);
        },
      }),
    } as unknown as TransacaoPipe;
    return { tx, gravado };
  }

  it('grava ator, ação e objeto', async () => {
    const { tx, gravado } = txFalsa();
    await registrarAuditoria(tx, 't-1', {
      ator: { tipo: 'usuario', id: 'u-1', ip: '10.0.0.1' },
      acao: 'alterou',
      objetoTipo: 'fila',
      objetoId: 'f-1',
      antes: { nome: 'Comercial' },
      depois: { nome: 'Vendas' },
    });

    expect(gravado[0]).toMatchObject({
      tenantId: 't-1',
      atorTipo: 'usuario',
      atorId: 'u-1',
      acao: 'alterou',
      objetoTipo: 'fila',
      objetoId: 'f-1',
      ip: '10.0.0.1',
    });
  });

  it('NUNCA registra segredo, mesmo quando vem no objeto', async () => {
    // Gravar token no log desfaria, num lugar mais visível, a cifra que o
    // `segredo.ts` aplica no banco.
    const { tx, gravado } = txFalsa();
    await registrarAuditoria(tx, 't-1', {
      ator: { tipo: 'usuario', id: 'u-1' },
      acao: 'alterou',
      objetoTipo: 'canal',
      objetoId: 'c-1',
      depois: { nome: 'WhatsApp', tokenAcesso: 'EAAG-secreto', appSecret: 'x', config: {} },
    });

    const depois = gravado[0]?.['depois'] as Record<string, unknown>;
    expect(depois['nome']).toBe('WhatsApp');
    expect(depois).not.toHaveProperty('tokenAcesso');
    expect(depois).not.toHaveProperty('appSecret');
    expect(depois).not.toHaveProperty('config');
  });

  it('sistema não tem id, e isso não é erro', async () => {
    const { tx, gravado } = txFalsa();
    await registrarAuditoria(tx, 't-1', {
      ator: { tipo: 'sistema' },
      acao: 'desativou',
      objetoTipo: 'canal',
      objetoId: 'c-1',
    });
    expect(gravado[0]?.['atorId']).toBeNull();
    expect(gravado[0]?.['ip']).toBeNull();
  });

  it('data vira texto, para o jsonb não guardar objeto de data', async () => {
    const { tx, gravado } = txFalsa();
    const quando = new Date('2026-09-07T12:00:00Z');
    await registrarAuditoria(tx, 't-1', {
      ator: { tipo: 'usuario', id: 'u-1' },
      acao: 'criou',
      objetoTipo: 'pausa',
      objetoId: 'p-1',
      depois: { iniciadaEm: quando },
    });
    const depois = gravado[0]?.['depois'] as Record<string, unknown>;
    expect(depois['iniciadaEm']).toBe('2026-09-07T12:00:00.000Z');
  });

  it('a diferença traz só o que mudou', () => {
    // Quem lê o log quer saber que a capacidade foi de 5 para 8, não reler as
    // quinze colunas que continuaram iguais.
    const d = diferenca(
      { nome: 'Comercial', capacidade: 5, ativa: true },
      { nome: 'Comercial', capacidade: 8, ativa: true },
    );
    expect(d.antes).toEqual({ capacidade: 5 });
    expect(d.depois).toEqual({ capacidade: 8 });
  });

  it('null e undefined são a mesma ausência, e não viram mudança falsa', () => {
    // O driver devolve `null` e o formulário manda `undefined`. Sem isto, todo
    // salvamento registraria mudança em campo vazio que ninguém tocou.
    const d = diferenca({ cor: null }, { cor: undefined });
    expect(d.antes).toEqual({});
    expect(d.depois).toEqual({});
  });

  it('data igual não vira mudança', () => {
    const d = diferenca(
      { em: new Date('2026-09-07T12:00:00Z') },
      { em: new Date('2026-09-07T12:00:00Z') },
    );
    expect(d.depois).toEqual({});
  });

  it('campo que nasce vale como mudança', () => {
    const d = diferenca({ nome: 'A' }, { nome: 'A', cor: 'grafico-1' });
    expect(d.depois).toEqual({ cor: 'grafico-1' });
  });
});
