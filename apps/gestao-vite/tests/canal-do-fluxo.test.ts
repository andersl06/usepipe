import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CanalDoFluxo } from '@pipe/contracts';
import {
  canaisParaOferecer,
  cartaoConectado,
  estadoDoCanalNoBot,
  numeroParaWaMe,
  podeConfirmarDesconexao,
  rotaDoCanal,
  rotuloDoCanal,
} from '../src/lib/canal-do-fluxo.ts';

/**
 * O canal DO BOT (`fluxo/canais/**`): o que o cartão da lista decide, o que a
 * página do canal desenha, e o que a etapa "Ativação do número" oferece —
 * `referencias-blip/fichas/FICHA-conectar-canal-no-bot.md` §1 e §4.
 */

const BOT = '5b6843ae-b4f8-4bc0-bce2-e32318043297';
const OUTRO_BOT = '0d2f8a3c-1111-4bc0-bce2-e32318043297';

function canal(extra: Partial<CanalDoFluxo> = {}): CanalDoFluxo {
  return {
    id: 'c-1',
    tipo: 'whatsapp_cloud',
    nome: 'Suporte',
    numero: '+5511999990000',
    ativo: true,
    fluxoId: null,
    fluxoNome: null,
    ...extra,
  };
}

test('o cartão da lista leva à página do canal dentro do bot, no prefixo do próprio tipo', () => {
  assert.equal(rotaDoCanal(`/roteador/${BOT}`, 'whatsapp_cloud'), `/roteador/${BOT}/canais/whatsapp`);
  assert.equal(rotaDoCanal(`/fluxo/${BOT}`, 'instagram'), `/fluxo/${BOT}/canais/instagram`);
  assert.equal(rotaDoCanal(`/fluxo/${BOT}`, 'messenger'), `/fluxo/${BOT}/canais/messenger`);
});

test('"Conectado" no cartão é o bot com canal ATIVO daquele tipo; desligado ou de outro tipo é "Conectar"', () => {
  assert.equal(cartaoConectado({ canalTipo: 'whatsapp_cloud', canalAtivo: true }, 'whatsapp_cloud'), true);
  assert.equal(cartaoConectado({ canalTipo: 'whatsapp_cloud', canalAtivo: false }, 'whatsapp_cloud'), false);
  assert.equal(cartaoConectado({ canalTipo: 'instagram', canalAtivo: true }, 'whatsapp_cloud'), false);
  assert.equal(cartaoConectado({ canalTipo: null, canalAtivo: null }, 'whatsapp_cloud'), false);
});

test('a página do canal: conectado, não conectado, ou o bot já está com OUTRO canal (decisão Pipe)', () => {
  assert.deepEqual(estadoDoCanalNoBot(null, 'whatsapp_cloud'), { estado: 'nao_conectado' });

  const wa = canal({ fluxoId: BOT });
  assert.deepEqual(estadoDoCanalNoBot(wa, 'whatsapp_cloud'), { estado: 'conectado', canal: wa });
  assert.deepEqual(estadoDoCanalNoBot(wa, 'instagram'), { estado: 'outro_canal', canal: wa });

  // Canal desligado ligado ao bot: a página oferece conectar de novo, não finge conectado.
  const desligado = canal({ ativo: false, fluxoId: BOT });
  assert.deepEqual(estadoDoCanalNoBot(desligado, 'whatsapp_cloud'), { estado: 'nao_conectado' });
});

test('"Ativação do número": só os canais ativos do tipo; livres de um lado, em uso por outro bot do outro', () => {
  const livre = canal({ id: 'livre' });
  const meu = canal({ id: 'meu', fluxoId: BOT, fluxoNome: 'Este bot' });
  const deOutro = canal({ id: 'de-outro', fluxoId: OUTRO_BOT, fluxoNome: 'Vendas' });
  const desligado = canal({ id: 'desligado', ativo: false });
  const instagram = canal({ id: 'ig', tipo: 'instagram' });

  const { livres, emUso } = canaisParaOferecer([livre, meu, deOutro, desligado, instagram], 'whatsapp_cloud', BOT);
  assert.deepEqual(livres.map((c) => c.id), ['livre', 'meu']);
  assert.deepEqual(emUso.map((c) => c.id), ['de-outro']);

  assert.deepEqual(canaisParaOferecer([instagram], 'instagram', BOT).livres.map((c) => c.id), ['ig']);
});

test('o rótulo do canal na lista é o número e o nome; sem número, só o nome', () => {
  assert.equal(rotuloDoCanal({ nome: 'Suporte', numero: '+5511999990000' }), '+5511999990000 — Suporte');
  assert.equal(rotuloDoCanal({ nome: 'Página da loja', numero: null }), 'Página da loja');
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
