/**
 * Tradução: linha do Pipe → objeto que a tela da Blip sabe desenhar.
 *
 * Regra que vale para o arquivo inteiro: **não inventar campo**. Onde a Blip tem um
 * conceito que o Pipe não tem, ou o campo sai de fora (e fica anotado aqui), ou não
 * sai. Preencher com palpite é pior do que não preencher: a tela mostra o palpite
 * como se fosse dado do cliente.
 */

import type { EstadoConversa } from '@pipe/core';

/** Estados do Pipe → `status` que o Desk lê para separar fila de atendimento. */
const STATUS_POR_ESTADO: Record<EstadoConversa, string> = {
  na_fila: 'Waiting',
  atribuida: 'Open',
  em_atendimento: 'Open',
  em_espera: 'Open',
  encerrada: 'Closed',
};

/** `entrada` é o cliente falando; `saida` é a empresa. `interna` não é conversa. */
const DIRECAO_BLIP: Record<string, string> = {
  entrada: 'received',
  saida: 'sent',
};

/** Tipo do Pipe → content type, que é como a Blip decide o componente da bolha. */
const TIPO_BLIP: Record<string, string> = {
  texto: 'text/plain',
  imagem: 'image/jpeg',
  audio: 'audio/ogg',
  video: 'video/mp4',
  documento: 'application/pdf',
  localizacao: 'application/vnd.lime.location+json',
};

/** Estado do atendente no Pipe → o que o seletor de status do Desk espera. */
const STATUS_ATENDENTE_BLIP: Record<string, string> = {
  online: 'Online',
  pausa: 'Pause',
  invisivel: 'Invisible',
  offline: 'Offline',
};

export type LinhaConversa = {
  id: string;
  estado: string;
  prioridade: string;
  criada_em: string | Date | null;
  atribuida_em: string | Date | null;
  encerrada_em: string | Date | null;
  ultima_mensagem_em: string | Date | null;
  ultima_mensagem_de: string | null;
  fila_id: string | null;
  fila_nome: string | null;
  atendente_id: string | null;
  atendente_nome: string | null;
  atendente_email?: string | null;
  contato_id: string;
  contato_nome: string | null;
  contato_telefone: string | null;
  canal_tipo: string | null;
  nao_lidas?: number;
  ultima_mensagem_texto?: string | null;
}

export type LinhaMensagem = {
  id: string;
  criada_em: string | Date | null;
  direcao: string;
  autor_tipo: string;
  tipo: string;
  conteudo: string | null;
}

export function iso(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

/**
 * Identidade no formato da Blip: o `@` do e-mail vira `%40` e o domínio da
 * plataforma entra no fim. A tela usa isso como chave de comparação ("este ticket é
 * meu?"), então precisa ser estável e única por pessoa — o e-mail serve às duas
 * coisas.
 */
export function identidade(email: string | null | undefined, dominio = 'pipe.local'): string {
  if (!email) return `desconhecido@${dominio}`;
  return `${email.replace('@', '%40')}@${dominio}`;
}

/**
 * O Desk mostra "#" do atendimento e deixa buscar por ele. O Pipe **não tem** número
 * sequencial por tenant: a conversa é identificada por UUID.
 *
 * Enquanto a decisão não é tomada, o número sai do próprio UUID — determinístico,
 * estável e único dentro do tenant na prática. Não é sequencial de verdade: não
 * cresce com o tempo e não serve para dizer "atendimento nº 4 do dia".
 *
 * A saída definitiva é uma coluna `numero` com sequência por tenant, gravada na
 * criação da conversa. Está registrado em `docs/specs/2026-09-12-ponte-lime.md`.
 */
export function numeroVisivel(id: string): number {
  const hex = id.replace(/-/g, '').slice(0, 8);
  return parseInt(hex, 16) % 1_000_000;
}

export function comoTicket(linha: LinhaConversa, dominio?: string): Record<string, unknown> {
  const telefone = linha.contato_telefone ?? '';
  const abertura = iso(linha.criada_em);
  return {
    id: linha.id,
    sequentialId: numeroVisivel(linha.id),
    // Sem roteador no Pipe: o "dono" do atendimento é o canal por onde ele entrou.
    ownerIdentity: `${linha.canal_tipo ?? 'canal'}@pipe.local`,
    customerIdentity: telefone ? `${telefone.replace('+', '')}@wa.gw.msging.net` : linha.contato_id,
    customerName: linha.contato_nome ?? 'Sem nome',
    customerPhoneNumber: telefone,
    agentIdentity: linha.atendente_email ? identidade(linha.atendente_email, dominio) : null,
    status: STATUS_POR_ESTADO[linha.estado as EstadoConversa] ?? 'Open',
    team: linha.fila_nome ?? 'Default',
    storageDate: abertura,
    openDate: iso(linha.atribuida_em) ?? abertura,
    closeDate: iso(linha.encerrada_em),
    lastMessage: linha.ultima_mensagem_em
      ? {
          content: linha.ultima_mensagem_texto ?? '',
          direction: linha.ultima_mensagem_de === 'contato' ? 'received' : 'sent',
          date: iso(linha.ultima_mensagem_em),
        }
      : null,
    lastMessageSort: linha.ultima_mensagem_em ? new Date(iso(linha.ultima_mensagem_em)!).getTime() : 0,
    unreadMessages: Number(linha.nao_lidas ?? 0),
    isNew: linha.estado === 'na_fila',
    tags: [],
    customerAccount: {
      identity: telefone ? `${telefone.replace('+', '')}@wa.gw.msging.net` : linha.contato_id,
      name: linha.contato_nome ?? 'Sem nome',
      fullName: linha.contato_nome ?? 'Sem nome',
      phoneNumber: telefone,
      extras: {
        // A prioridade do Pipe tem cinco degraus e a Blip não usa o mesmo
        // vocabulário. Em vez de traduzir por aproximação, ela viaja como está.
        prioridadePipe: linha.prioridade,
        canal: linha.canal_tipo ?? '',
        fila: linha.fila_nome ?? '',
      },
    },
  };
}

/**
 * Mensagem → documento LIME. A mensagem **interna** (nota entre atendentes) fica de
 * fora: na Blip ela não é mensagem da conversa, é outro recurso. Entregá-la aqui
 * faria a nota aparecer como se tivesse ido para o cliente.
 */
export function comoDocumento(linha: LinhaMensagem): Record<string, unknown> | null {
  const direcao = DIRECAO_BLIP[linha.direcao];
  if (!direcao) return null;
  return {
    id: linha.id,
    direction: direcao,
    type: TIPO_BLIP[linha.tipo] ?? 'text/plain',
    content: linha.conteudo ?? '',
    date: iso(linha.criada_em),
    /* `messageEmitter` só existe para o que SAIU: ele diz se quem falou foi gente ou
       o robô. Em mensagem recebida o campo não tem sentido, e mandá-lo fazia a tela
       rotular a fala do próprio cliente como "Bot". */
    ...(direcao === 'sent'
      ? { messageEmitter: linha.autor_tipo === 'atendente' ? 'Human' : 'Bot' }
      : {}),
  };
}

export function comoDocumentos(linhas: LinhaMensagem[]): Record<string, unknown>[] {
  return linhas.map(comoDocumento).filter((m): m is Record<string, unknown> => m !== null);
}

export type LinhaAtendente = {
  id: string;
  nome: string | null;
  email: string;
  estado?: string | null;
}

/** O `/account` do Desk. Sem `status` a tela quebra em `status.toLowerCase()`. */
export function comoConta(
  usuario: LinhaAtendente,
  filas: string[],
  dominio?: string,
): Record<string, unknown> {
  return {
    identity: identidade(usuario.email, dominio),
    fullName: usuario.nome ?? usuario.email,
    email: usuario.email,
    status: STATUS_ATENDENTE_BLIP[usuario.estado ?? 'offline'] ?? 'Offline',
    isOwner: false,
    isEnabled: true,
    phoneNumber: '',
    photoUri: '',
    teams: filas,
    culture: 'pt-BR',
    extras: {},
  };
}

export function comoTime(fila: { id: string; nome: string }): Record<string, unknown> {
  return { id: fila.id, name: fila.nome };
}

export { STATUS_POR_ESTADO, STATUS_ATENDENTE_BLIP, DIRECAO_BLIP, TIPO_BLIP };
