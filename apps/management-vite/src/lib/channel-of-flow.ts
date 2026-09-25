import type { ChannelOfFlow } from '@pipe/contracts';

/**
 * O canal DO BOT — regras PURAS do lado da tela (`fluxo/canais/**`), sem
 * `./api` de propósito, para `tests/canal-do-fluxo.test.ts` rodar sem
 * `import.meta.env`.
 *
 * A origem (`FICHA-conectar-canal-no-bot.md` §1) tem UMA página por canal
 * dentro do bot; o cartão da lista só decide entre "Conectar" e "Conectado" e
 * leva à mesma página. Aqui fica o que decide isso e o que a página oferece.
 */

/** Os canais que a Pipe tem página própria — os mesmos `tipo` de `canal.tipo`. */
export type TipoOfChannelOfBot = 'whatsapp_cloud' | 'instagram' | 'messenger';

/** O segmento da URL de cada canal: `/{tipo}/{id}/canais/{segmento}` (o `/whatsapp-embedded` da origem vira `/whatsapp`). */
export const SEGMENT_OF_CHANNEL: Readonly<Record<TipoOfChannelOfBot, string>> = {
  whatsapp_cloud: 'whatsapp',
  instagram: 'instagram',
  messenger: 'messenger',
};

export function channelRota(base: string, tipo: TipoOfChannelOfBot): string {
  return `${base}/canais/${SEGMENT_OF_CHANNEL[tipo]}`;
}

/**
 * O estado que a página do canal desenha para ESTE bot:
 * - `conectado`: o bot está com um canal ativo deste tipo (o `VERIFIED` da origem);
 * - `nao_conectado`: o bot não tem canal (o `LOGIN` da origem);
 * - `outro_canal`: o bot já está com um canal de OUTRO tipo — decisão Pipe,
 *   porque `fluxo.canal_id` é uma coluna só (na origem um bot tem vários).
 */
export type ChannelInBotState =
  | { state: 'conectado'; channel: ChannelOfFlow }
  | { state: 'nao_conectado' }
  | { state: 'outro_canal'; channel: ChannelOfFlow };

export function channelInBotState(
  channel: ChannelOfFlow | null,
  tipo: TipoOfChannelOfBot,
): ChannelInBotState {
  if (!channel) return { state: 'nao_conectado' };
  if (channel.tipo !== tipo) return { state: 'outro_canal', channel };
  if (!channel.ativo) return { state: 'nao_conectado' };
  return { state: 'conectado', channel };
}

/** O cartão da lista: "Conectado" quando o bot está com um canal ATIVO deste tipo. */
export function cardConnected(
  contact: { channelTipo: string | null; channelActive: boolean | null },
  tipo: string,
): boolean {
  return contact.channelActive === true && contact.channelTipo === tipo;
}

/**
 * O que a etapa "Ativação do número" oferece (decisão Pipe — na origem o número
 * nasce no bot e não há lista): os canais ATIVOS deste tipo que estão livres
 * (sem bot vivo), e os que já estão com outro bot, para a tela dizer qual — a
 * origem manda "remover do anterior", e a tela aponta onde.
 */
export function channelsForOferecer(
  disponiveis: readonly ChannelOfFlow[],
  tipo: TipoOfChannelOfBot,
  flowId: string,
): { livres: ChannelOfFlow[]; emUso: ChannelOfFlow[] } {
  const doTipo = disponiveis.filter((c) => c.tipo === tipo && c.ativo);
  return {
    livres: doTipo.filter((c) => c.flowId === null || c.flowId === flowId),
    emUso: doTipo.filter((c) => c.flowId !== null && c.flowId !== flowId),
  };
}

/** O rótulo de um canal na lista: o número (ou `@usuário`, ou o id da Página) e, sem ele, o nome. */
export function channelRotulo(channel: Pick<ChannelOfFlow, 'nome' | 'numero'>): string {
  return channel.numero ? `${channel.numero} — ${channel.nome}` : channel.nome;
}

/** Só dígitos, para o `https://wa.me/{numero}` do "Testar no WhatsApp". */
export function numeroParaWaMe(numero: string | null): string {
  return (numero ?? '').replace(/\D/g, '');
}

/**
 * O botão "Desconectar {canal}" do modal de desconexão da origem só habilita
 * com o motivo preenchido E a concordância marcada (`class H`, portal.js
 * 120544: `disconnectButtonDisabled = !agreedChecked || !motiveInputValue`).
 */
export function podeConfirmarDesconexao(motivo: string, concordou: boolean): boolean {
  return concordou && motivo.trim().length > 0;
}
