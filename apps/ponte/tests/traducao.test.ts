import { describe, expect, it } from 'vitest';
import {
  comoConta,
  comoDocumento,
  comoDocumentos,
  comoTicket,
  identidade,
  numeroVisivel,
} from '../src/traducao.js';
import type { LinhaConversa, LinhaMensagem } from '../src/traducao.js';

/**
 * A tradução é a parte da ponte que erra em silêncio: um campo com nome trocado não
 * quebra nada, só faz a tela mostrar o dado errado do cliente. Por isso cada
 * mapeamento tem teste.
 */

function conversa(sobre: Partial<LinhaConversa> = {}): LinhaConversa {
  return {
    id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    estado: 'na_fila',
    prioridade: 'sem_prioridade',
    criada_em: '2026-09-12T10:00:00.000Z',
    atribuida_em: null,
    encerrada_em: null,
    ultima_mensagem_em: '2026-09-12T10:05:00.000Z',
    ultima_mensagem_de: 'contato',
    fila_id: 'f1',
    fila_nome: 'Suporte',
    atendente_id: null,
    atendente_nome: null,
    atendente_email: null,
    contato_id: 'c1',
    contato_nome: 'Maria Souza',
    contato_telefone: '+5531999998888',
    canal_tipo: 'whatsapp_cloud',
    ultima_mensagem_texto: 'oi, preciso de ajuda',
    ...sobre,
  };
}

describe('conversa → ticket', () => {
  it('na fila vira Waiting; em atendimento vira Open; encerrada vira Closed', () => {
    expect(comoTicket(conversa()).status).toBe('Waiting');
    expect(comoTicket(conversa({ estado: 'em_atendimento' })).status).toBe('Open');
    expect(comoTicket(conversa({ estado: 'atribuida' })).status).toBe('Open');
    expect(comoTicket(conversa({ estado: 'em_espera' })).status).toBe('Open');
    expect(comoTicket(conversa({ estado: 'encerrada' })).status).toBe('Closed');
  });

  it('leva nome, telefone e fila do jeito que a tela lê', () => {
    const t = comoTicket(conversa());
    expect(t['customerName']).toBe('Maria Souza');
    expect(t['customerPhoneNumber']).toBe('+5531999998888');
    expect(t['team']).toBe('Suporte');
  });

  it('a última mensagem do contato é `received`; a nossa é `sent`', () => {
    const doCliente = comoTicket(conversa()) as { lastMessage: { direction: string } };
    expect(doCliente.lastMessage.direction).toBe('received');
    const nossa = comoTicket(conversa({ ultima_mensagem_de: 'atendente' })) as {
      lastMessage: { direction: string };
    };
    expect(nossa.lastMessage.direction).toBe('sent');
  });

  it('sem atendente, `agentIdentity` é nulo — e não uma identidade inventada', () => {
    expect(comoTicket(conversa())['agentIdentity']).toBeNull();
    const comAtendente = comoTicket(
      conversa({ atendente_email: 'ana@demo.pipe.app', atendente_nome: 'Ana' }),
    );
    expect(comAtendente['agentIdentity']).toBe('ana%40demo.pipe.app@pipe.local');
  });

  it('a prioridade do Pipe viaja como está, sem traduzir por aproximação', () => {
    const t = comoTicket(conversa({ prioridade: 'maxima' })) as {
      customerAccount: { extras: Record<string, string> };
    };
    expect(t.customerAccount.extras['prioridadePipe']).toBe('maxima');
  });

  it('o número visível é estável para o mesmo id', () => {
    const a = numeroVisivel('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    const b = numeroVisivel('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(numeroVisivel('00000000-0000-0000-0000-000000000000')).toBe(0);
  });
});

describe('mensagem → documento', () => {
  const base: LinhaMensagem = {
    id: 'm1',
    criada_em: '2026-09-12T10:05:00.000Z',
    direcao: 'entrada',
    autor_tipo: 'contato',
    tipo: 'texto',
    conteudo: 'oi',
  };

  it('entrada vira received e saída vira sent', () => {
    expect(comoDocumento(base)!['direction']).toBe('received');
    expect(comoDocumento({ ...base, direcao: 'saida', autor_tipo: 'atendente' })!['direction']).toBe(
      'sent',
    );
  });

  it('nota interna não entra na conversa do cliente', () => {
    expect(comoDocumento({ ...base, direcao: 'interna', autor_tipo: 'atendente' })).toBeNull();
    const lista = comoDocumentos([base, { ...base, id: 'm2', direcao: 'interna' }]);
    expect(lista).toHaveLength(1);
  });

  it('o tipo do Pipe vira o content type que a bolha da tela entende', () => {
    expect(comoDocumento(base)!['type']).toBe('text/plain');
    expect(comoDocumento({ ...base, tipo: 'imagem' })!['type']).toBe('image/jpeg');
    expect(comoDocumento({ ...base, tipo: 'inexistente' })!['type']).toBe('text/plain');
  });

  it('quem saiu tem emissor; o que o cliente mandou, não', () => {
    const doAtendente = { ...base, direcao: 'saida', autor_tipo: 'atendente' };
    const doBot = { ...base, direcao: 'saida', autor_tipo: 'bot' };
    expect(comoDocumento(doAtendente)!['messageEmitter']).toBe('Human');
    expect(comoDocumento(doBot)!['messageEmitter']).toBe('Bot');
    // Recebida não carrega emissor: com ele, a tela rotulava o cliente como robô.
    expect(comoDocumento(base)!['messageEmitter']).toBeUndefined();
  });
});

describe('conta do atendente', () => {
  it('traduz o estado e nunca devolve status vazio', () => {
    const conta = comoConta(
      { id: 'u1', nome: 'Ana Ribeiro', email: 'ana@demo.pipe.app', estado: 'online' },
      ['Suporte'],
    );
    expect(conta['status']).toBe('Online');
    // Sem papel de administrador, a barra lateral não mostra os itens de gestão.
    expect(conta['isOwner']).toBe(false);
    const admin = comoConta(
      { id: 'u1', nome: 'Ana', email: 'ana@demo.pipe.app', estado: 'online', ehAdministrador: true },
      [],
    );
    expect(admin['isOwner']).toBe(true);
    expect(conta['identity']).toBe('ana%40demo.pipe.app@pipe.local');
    expect(conta['teams']).toEqual(['Suporte']);

    const semEstado = comoConta({ id: 'u1', nome: null, email: 'ana@demo.pipe.app' }, []);
    expect(semEstado['status']).toBe('Offline');
    expect(semEstado['fullName']).toBe('ana@demo.pipe.app');
  });

  it('pausa e invisível têm nome próprio na tela', () => {
    const pausa = comoConta({ id: 'u', nome: 'X', email: 'x@y.z', estado: 'pausa' }, []);
    const invisivel = comoConta({ id: 'u', nome: 'X', email: 'x@y.z', estado: 'invisivel' }, []);
    expect(pausa['status']).toBe('Pause');
    expect(invisivel['status']).toBe('Invisible');
  });
});

describe('identidade', () => {
  it('escapa o arroba do e-mail, como a Blip faz', () => {
    expect(identidade('ana.ribeiro@demo.pipe.app')).toBe('ana.ribeiro%40demo.pipe.app@pipe.local');
    expect(identidade(null)).toBe('desconhecido@pipe.local');
  });
});
