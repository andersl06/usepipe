/**
 * Os eventos que o servidor empurra pelo WebSocket.
 *
 * **O evento diz O QUE mudou, nunca O QUE É.** O cliente recebe "a conversa X
 * mudou" e busca de novo pela API, sob RLS. Empurrar o registro pelo socket
 * seria uma segunda porta para o dado, com um segundo lugar para errar o
 * isolamento entre clientes — e a primeira porta já é a que tem 90 políticas e
 * 21 testes.
 *
 * O efeito colateral é bom: o payload fica minúsculo, e o cliente sempre lê a
 * versão mais nova, não a que estava viajando quando o evento saiu.
 */

export const ASSUNTOS = [
  /** Uma conversa mudou: mensagem nova, estado, atribuição, janela. */
  'conversa',
  /** A fila mudou de tamanho ou de composição. */
  'fila',
  /** Um atendente mudou de status (online, pausa, invisível). */
  'atendente',
  /** Os números do Monitoramento mudaram o bastante para valer repintar. */
  'monitoramento',
  /** Um lead mudou de fase, ou nasceu. */
  'lead',
] as const;
export type Assunto = (typeof ASSUNTOS)[number];

export interface EventoDoServidor {
  assunto: Assunto;
  /** O registro que mudou. Ausente quando o assunto é agregado (monitoramento). */
  id?: string;
  /**
   * Momento em que o servidor emitiu, em ISO-8601.
   *
   * O cliente usa para descartar evento que chegou fora de ordem — reconexão
   * entrega o acumulado, e aplicar um evento velho por cima de um novo deixa a
   * tela mentindo.
   */
  em: string;
}

/**
 * O que o cliente manda para se inscrever.
 *
 * O `tenant_id` NÃO vem daqui: ele sai da sessão, no servidor. Aceitar tenant do
 * cliente seria deixar quem se inscreve escolher de quem quer ouvir.
 */
export interface Inscricao {
  assuntos: Assunto[];
  /** Ids específicos, quando a tela quer só uma conversa em vez de todas. */
  ids?: string[];
}

/** Quadros de controle do canal, para o cliente saber o que aconteceu. */
export type QuadroDeControle =
  | { tipo: 'inscrito'; assuntos: Assunto[] }
  | { tipo: 'recusado'; motivo: 'sem_sessao' | 'assunto_desconhecido' | 'sem_permissao' }
  | { tipo: 'ping' };
