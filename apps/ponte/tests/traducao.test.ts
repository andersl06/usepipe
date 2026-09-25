import { describe, expect, it } from 'vitest';
import {
  asAccount,
  asDocument,
  asDocuments,
  comoTicket,
  identity,
  numeroVisivel,
} from '../src/traducao.js';
import type { LinhaConversation, LinhaMessage } from '../src/traducao.js';

/**
 * A tradução é a parte da ponte que erra em silêncio: um campo com nome trocado não
 * quebra nada, só faz a tela mostrar o dado errado do cliente. Por isso cada
 * mapeamento tem teste.
 */

function conversation(sobre: Partial<LinhaConversation> = {}): LinhaConversation {
  return {
    id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    state: 'na_fila',
    priority: 'sem_prioridade',
    criada_em: '2026-09-12T10:00:00.000Z',
    atribuida_em: null,
    encerrada_em: null,
    ultimaMessageIn: '2026-09-12T10:05:00.000Z',
    ultimaMessageOf: 'contato',
    queueId: 'f1',
    queueName: 'Suporte',
    agentId: null,
    agentName: null,
    agentEmail: null,
    contactId: 'c1',
    contactName: 'Maria Souza',
    contactTelefone: '+5531999998888',
    channelTipo: 'whatsapp_cloud',
    lastMessageText: 'oi, preciso de ajuda',
    ...sobre,
  };
}

describe('conversa → ticket', () => {
  it('na fila vira Waiting; em atendimento vira Open; encerrada vira Closed', () => {
    expect(comoTicket(conversation()).status).toBe('Waiting');
    expect(comoTicket(conversation({ state: 'em_atendimento' })).status).toBe('Open');
    expect(comoTicket(conversation({ state: 'atribuida' })).status).toBe('Open');
    expect(comoTicket(conversation({ state: 'em_espera' })).status).toBe('Open');
    expect(comoTicket(conversation({ state: 'encerrada' })).status).toBe('Closed');
  });

  it('leva nome, telefone e fila do jeito que a tela lê', () => {
    const t = comoTicket(conversation());
    expect(t['customerName']).toBe('Maria Souza');
    expect(t['customerPhoneNumber']).toBe('+5531999998888');
    expect(t['team']).toBe('Suporte');
  });

  it('a última mensagem do contato é `received`; a nossa é `sent`', () => {
    const doCliente = comoTicket(conversation()) as { lastMessage: { direction: string } };
    expect(doCliente.lastMessage.direction).toBe('received');
    const nossa = comoTicket(conversation({ ultimaMessageOf: 'atendente' })) as {
      lastMessage: { direction: string };
    };
    expect(nossa.lastMessage.direction).toBe('sent');
  });

  it('sem atendente, `agentIdentity` é nulo — e não uma identidade inventada', () => {
    expect(comoTicket(conversation())['agentIdentity']).toBeNull();
    const withAgent = comoTicket(
      conversation({ agentEmail: 'ana@demo.pipe.app', agentName: 'Ana' }),
    );
    expect(withAgent['agentIdentity']).toBe('ana%40demo.pipe.app@pipe.local');
  });

  it('a prioridade do Pipe viaja como está, sem traduzir por aproximação', () => {
    const t = comoTicket(conversation({ priority: 'maxima' })) as {
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
  const base: LinhaMessage = {
    id: 'm1',
    criada_em: '2026-09-12T10:05:00.000Z',
    direction: 'entrada',
    autor_tipo: 'contato',
    tipo: 'texto',
    conteudo: 'oi',
  };

  it('entrada vira received e saída vira sent', () => {
    expect(asDocument(base)!['direction']).toBe('received');
    expect(asDocument({ ...base, direction: 'saida', autor_tipo: 'atendente' })!['direction']).toBe(
      'sent',
    );
  });

  it('nota interna não entra na conversa do cliente', () => {
    expect(asDocument({ ...base, direction: 'interna', autor_tipo: 'atendente' })).toBeNull();
    const lista = asDocuments([base, { ...base, id: 'm2', direction: 'interna' }]);
    expect(lista).toHaveLength(1);
  });

  it('o tipo do Pipe vira o content type que a bolha da tela entende', () => {
    expect(asDocument(base)!['type']).toBe('text/plain');
    expect(asDocument({ ...base, tipo: 'imagem' })!['type']).toBe('image/jpeg');
    expect(asDocument({ ...base, tipo: 'inexistente' })!['type']).toBe('text/plain');
  });

  it('quem saiu tem emissor; o que o cliente mandou, não', () => {
    const ofAgent = { ...base, direcao: 'saida', autor_tipo: 'atendente' };
    const doBot = { ...base, direcao: 'saida', autor_tipo: 'bot' };
    expect(asDocument(ofAgent)!['messageEmitter']).toBe('Human');
    expect(asDocument(doBot)!['messageEmitter']).toBe('Bot');
    // Recebida não carrega emissor: com ele, a tela rotulava o cliente como robô.
    expect(asDocument(base)!['messageEmitter']).toBeUndefined();
  });
});

describe('conta do atendente', () => {
  it('traduz o estado e nunca devolve status vazio', () => {
    const account = asAccount(
      { id: 'u1', nome: 'Ana Ribeiro', email: 'ana@demo.pipe.app', state: 'online' },
      ['Suporte'],
    );
    expect(account['status']).toBe('Online');
    // Sem papel de administrador, a barra lateral não mostra os itens de gestão.
    expect(account['isOwner']).toBe(false);
    const admin = asAccount(
      { id: 'u1', nome: 'Ana', email: 'ana@demo.pipe.app', state: 'online', ehAdministrador: true },
      [],
    );
    expect(admin['isOwner']).toBe(true);
    expect(account['identity']).toBe('ana%40demo.pipe.app@pipe.local');
    expect(account['teams']).toEqual(['Suporte']);

    const withoutState = asAccount({ id: 'u1', nome: null, email: 'ana@demo.pipe.app' }, []);
    expect(withoutState['status']).toBe('Offline');
    expect(withoutState['fullName']).toBe('ana@demo.pipe.app');
  });

  it('pausa e invisível têm nome próprio na tela', () => {
    const pausa = asAccount({ id: 'u', nome: 'X', email: 'x@y.z', state: 'pausa' }, []);
    const invisivel = asAccount({ id: 'u', nome: 'X', email: 'x@y.z', state: 'invisivel' }, []);
    expect(pausa['status']).toBe('Pause');
    expect(invisivel['status']).toBe('Invisible');
  });
});

describe('identidade', () => {
  it('escapa o arroba do e-mail, como a Blip faz', () => {
    expect(identity('ana.ribeiro@demo.pipe.app')).toBe('ana.ribeiro%40demo.pipe.app@pipe.local');
    expect(identity(null)).toBe('desconhecido@pipe.local');
  });
});
