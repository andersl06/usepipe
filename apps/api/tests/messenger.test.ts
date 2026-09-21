import { describe, expect, it, beforeEach } from 'vitest';
process.env['PIPE_WHATSAPP_CONEXAO'] = 'duble';
const { ClienteGraphMessengerDuble, clienteGraphMessenger, definirFabricaGraphMessenger } = await import('../src/dominio/messenger/cliente-graph.js');
const { payloadDoMessenger, valoresDoMessenger } = await import('../src/dominio/messenger/entrada.js');

describe('Messenger', () => {
  beforeEach(() => { definirFabricaGraphMessenger(null); ClienteGraphMessengerDuble.reiniciar(); });
  it('identifica a Página de forma determinística e confere o segredo', async () => {
    const cliente = clienteGraphMessenger('pagina-teste');
    expect((await cliente.buscarPagina()).id).toBe(ClienteGraphMessengerDuble.idDaPagina('pagina-teste'));
    expect(await cliente.conferirSegredoDoApp('ab'.repeat(16))).toBe(true);
    expect(await cliente.conferirSegredoDoApp(`bad${'0'.repeat(29)}`)).toBe(false);
  });
  it('traduz PSID, postback e mídia, mas ignora echo', () => {
    const payload = { object: 'page', entry: [{ id: 'pagina', messaging: [
      { sender: { id: 'psid' }, timestamp: 1_700_000_000_000, message: { mid: 'mid-1', text: 'Olá' } },
      { sender: { id: 'psid' }, timestamp: 1_700_000_000_000, postback: { mid: 'mid-2', title: 'Começar' } },
      { sender: { id: 'pagina' }, message: { mid: 'eco', text: 'não entra', is_echo: true } },
      { sender: { id: 'psid' }, message: { mid: 'mid-3', attachments: [{ type: 'image', payload: { url: 'https://imagem.teste/a.jpg' } }] } },
    ] }] };
    expect(payloadDoMessenger(payload)).toBe(true);
    expect(valoresDoMessenger(payload, 'pagina')[0]?.messages).toMatchObject([
      { from: 'psid', id: 'mid-1', text: { body: 'Olá' } }, { id: 'mid-2', text: { body: 'Começar' } }, { id: 'mid-3', image: { url: 'https://imagem.teste/a.jpg' } },
    ]);
  });
  it('descarta eventos de outra Página', () => expect(valoresDoMessenger({ object: 'page', entry: [{ id: 'outra', messaging: [] }] }, 'pagina')).toEqual([]));
});
