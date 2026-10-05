import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { keyringOfEnvironment } from '@pipe/db';
import { VALIDITY_LINK_MS, assinaturaValida, segredoDeLink } from '@pipe/storage';
import { montarConteudo } from '../src/delivery.js';
import type { LinhaDeEnvio } from '../src/delivery.js';

const ANEXO_ID = '5b0c1f0e-3c1d-4f6e-9d57-0f8d3f1a2b3c';
const CHAVE_STORAGE = 'tenant-1/2026/09/foto-secreta.png';

const ENV_ORIGINAL = { ...process.env };

function linhaDeImagem(sobrescrever: Partial<LinhaDeEnvio> = {}): LinhaDeEnvio {
  return {
    tipo: 'imagem',
    conteudo: 'olha isso',
    dados: null,
    template_id: null,
    telefone_e164: '+5511999999999',
    identificador: null,
    canal_config: null,
    canal_tipo: 'whatsapp_cloud',
    template_nome: null,
    template_idioma: null,
    template_cabecalho: null,
    template_variaveis: null,
    template_status: null,
    anexo_mime: 'image/png',
    anexo_bytes: 2048,
    anexo_id: ANEXO_ID,
    anexo_nome: 'foto.png',
    ...sobrescrever,
  } as LinhaDeEnvio;
}

beforeEach(() => {
  process.env['PIPE_CHAVES_SEGREDO'] = `teste:${Buffer.alloc(32, 7).toString('base64')}`;
  process.env['PIPE_CHAVE_SEGREDO_ATUAL'] = 'teste';
  process.env['PIPE_URL_API'] = 'https://api.exemplo.test/';
  process.env['PIPE_STORAGE_URL_BASE'] = 'https://site.exemplo.test';
});

afterEach(() => {
  process.env = { ...ENV_ORIGINAL };
});

/**
 * Media uploaded by the agent must reach Meta through the API's signed link, which the API serves without a session. The old storage-base + key URL pointed at the public site and returned 404.
 */
describe('Link do anexo enviado ao provedor', () => {
  it('aponta para a API com expiração e assinatura, nunca para a base do storage nem para a chave', () => {
    const antes = Date.now();
    const resultado = montarConteudo(linhaDeImagem(), undefined);
    expect('conteudo' in resultado).toBe(true);
    if (!('conteudo' in resultado) || resultado.conteudo.tipo === 'texto') throw new Error('esperava mídia');
    const conteudo = resultado.conteudo as { link: string };

    const url = new URL(conteudo.link);
    expect(`${url.origin}${url.pathname}`).toBe(`https://api.exemplo.test/v1/attachments/${ANEXO_ID}`);
    expect(conteudo.link).not.toContain('site.exemplo.test');
    expect(conteudo.link).not.toContain(CHAVE_STORAGE);

    const expira = Number(url.searchParams.get('expires'));
    expect(expira).toBeGreaterThanOrEqual(antes + VALIDITY_LINK_MS);
    expect(expira).toBeLessThanOrEqual(Date.now() + VALIDITY_LINK_MS);
  });

  it('gera assinatura que a API aceita com o mesmo segredo e recusa com outro id ou segredo', () => {
    const resultado = montarConteudo(linhaDeImagem(), undefined);
    if (!('conteudo' in resultado)) throw new Error('esperava conteúdo');
    const url = new URL((resultado.conteudo as { link: string }).link);
    const expira = Number(url.searchParams.get('expires'));
    const assinatura = url.searchParams.get('signature') ?? '';
    const segredo = segredoDeLink(keyringOfEnvironment());

    expect(assinaturaValida(ANEXO_ID, expira, assinatura, segredo)).toBe(true);
    expect(assinaturaValida('outro-anexo', expira, assinatura, segredo)).toBe(false);
    expect(assinaturaValida(ANEXO_ID, expira, assinatura, 'segredo-diferente')).toBe(false);
    // Expired link: the API refuses it, which is why the link is rebuilt on every delivery attempt.
    expect(assinaturaValida(ANEXO_ID, expira, assinatura, segredo, expira + 1)).toBe(false);
  });

  it('mantém a URL absoluta de mídia declarada no fluxo', () => {
    const resultado = montarConteudo(
      linhaDeImagem({
        anexo_id: null,
        anexo_mime: null,
        anexo_bytes: null,
        dados: { midia: { url: 'https://cdn.exemplo.test/banner.png', titulo: 'Oferta' } },
      }),
      undefined,
    );
    expect(resultado).toMatchObject({
      conteudo: { tipo: 'imagem', link: 'https://cdn.exemplo.test/banner.png', legenda: 'Oferta' },
    });
  });

  it('falha com erro claro, sem lançar, quando o chaveiro não está configurado', () => {
    delete process.env['PIPE_CHAVES_SEGREDO'];
    const resultado = montarConteudo(linhaDeImagem(), undefined);
    expect(resultado).toMatchObject({ erro: { codigo: 'anexo_link_indisponivel' } });
  });
});
