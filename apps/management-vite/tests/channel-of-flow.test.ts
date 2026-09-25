import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChannelOfFlow } from '@pipe/contracts';
import {
  channelsForOferecer,
  cardConnected,
  channelInBotState,
  numeroParaWaMe,
  podeConfirmarDesconexao,
  channelRota,
  channelRotulo,
} from '../src/lib/channel-of-flow.ts';

/**
 * O canal DO BOT (`fluxo/canais/**`): o que o cartão da lista decide, o que a
 * página do canal desenha, e o que a etapa "Ativação do número" oferece —
 * `referencias-blip/fichas/FICHA-conectar-canal-no-bot.md` §1 e §4.
 */

const BOT = '5b6843ae-b4f8-4bc0-bce2-e32318043297';
const OUTRO_BOT = '0d2f8a3c-1111-4bc0-bce2-e32318043297';

function channel(extra: Partial<ChannelOfFlow> = {}): ChannelOfFlow {
  return {
    id: 'c-1',
    tipo: 'whatsapp_cloud',
    nome: 'Suporte',
    numero: '+5511999990000',
    ativo: true,
    flowId: null,
    flowName: null,
    ...extra,
  };
}

test('the list card leads to the channel page inside the bot, under its own type prefix', () => {
  assert.equal(channelRota(`/roteador/${BOT}`, 'whatsapp_cloud'), `/roteador/${BOT}/canais/whatsapp`);
  assert.equal(channelRota(`/fluxo/${BOT}`, 'instagram'), `/fluxo/${BOT}/canais/instagram`);
  assert.equal(channelRota(`/fluxo/${BOT}`, 'messenger'), `/fluxo/${BOT}/canais/messenger`);
});

test('"Connected" on the card is the bot with an ACTIVE channel of that type; disconnected or another type is "Connect"', () => {
  assert.equal(cardConnected({ channelTipo: 'whatsapp_cloud', channelActive: true }, 'whatsapp_cloud'), true);
  assert.equal(cardConnected({ channelTipo: 'whatsapp_cloud', channelActive: false }, 'whatsapp_cloud'), false);
  assert.equal(cardConnected({ channelTipo: 'instagram', channelActive: true }, 'whatsapp_cloud'), false);
  assert.equal(cardConnected({ channelTipo: null, channelActive: null }, 'whatsapp_cloud'), false);
});

test('the channel page: connected, not connected, or the bot already has ANOTHER channel (Pipe\'s decision)', () => {
  assert.deepEqual(channelInBotState(null, 'whatsapp_cloud'), { estado: 'nao_conectado' });

  const wa = channel({ flowId: BOT });
  assert.deepEqual(channelInBotState(wa, 'whatsapp_cloud'), { estado: 'conectado', canal: wa });
  assert.deepEqual(channelInBotState(wa, 'instagram'), { estado: 'outro_canal', canal: wa });

  // Canal desligado ligado ao bot: a página oferece conectar de novo, não finge conectado.
  const desligado = channel({ ativo: false, flowId: BOT });
  assert.deepEqual(channelInBotState(desligado, 'whatsapp_cloud'), { estado: 'nao_conectado' });
});

test('"Number activation": only active channels of that type; free on one side, in use by another bot on the other', () => {
  const livre = channel({ id: 'livre' });
  const meu = channel({ id: 'meu', flowId: BOT, flowName: 'Este bot' });
  const deOutro = channel({ id: 'de-outro', flowId: OUTRO_BOT, flowName: 'Vendas' });
  const desligado = channel({ id: 'desligado', ativo: false });
  const instagram = channel({ id: 'ig', tipo: 'instagram' });

  const { livres, emUso } = channelsForOferecer([livre, meu, deOutro, desligado, instagram], 'whatsapp_cloud', BOT);
  assert.deepEqual(livres.map((c) => c.id), ['livre', 'meu']);
  assert.deepEqual(emUso.map((c) => c.id), ['de-outro']);

  assert.deepEqual(channelsForOferecer([instagram], 'instagram', BOT).livres.map((c) => c.id), ['ig']);
});

test('the channel\'s label in the list is the number and the name; without a number, just the name', () => {
  assert.equal(channelRotulo({ nome: 'Suporte', numero: '+5511999990000' }), '+5511999990000 — Suporte');
  assert.equal(channelRotulo({ nome: 'Página da loja', numero: null }), 'Página da loja');
});

test('"Testar no WhatsApp" abre wa.me só com dígitos', () => {
  assert.equal(numeroParaWaMe('+55 (11) 99999-0000'), '5511999990000');
  assert.equal(numeroParaWaMe(null), '');
});

test('o modal de desconexão só confirma com motivo E concordância (regra da origem)', () => {
  assert.equal(podeConfirmarDesconexao('', true), false);
  assert.equal(podeConfirmarDesconexao('   ', true), false);
  assert.equal(podeConfirmarDesconexao('trocando de número', false), false);
  assert.equal(podeConfirmarDesconexao('trocando de número', true), true);
});
