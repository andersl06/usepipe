import { and, eq, ne } from 'drizzle-orm';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { Ator, TransactionPipe } from '@pipe/db';
import { flow } from '@pipe/db/schema';
import type { ConfigurationOfWelcome, ConfigurationOfMenuPersistent } from '@pipe/contracts';
import { PipeError } from '../../errors.js';
import { loadContact } from '../management-flow.js';
import { requirePermissionInFlow } from './team-of-flow.js';
import { aplicarPerfilMessenger, readChannelMessenger } from '../messenger/channel.js';

/**
 * Welcome Screen ('Tela de Boas-vindas') and Persistent Menu ('Menu Persistente') are source `/configurations/*` items 2 and 3 (`referencias-blip/pesquisa/blip-portal-telas.md` §6), stored in `fluxo.configuracao` since migration 0031. Earlier forms had no persistence. Active source fields were not observed because enabling the production router would change its state (`boasvindas/tela.tsx`), so no source limit was captured for 'Mensagem de saudação'. Pipe chose 20 characters for 'Texto do botão' based on Messenger `quick_replies[].title`. Both PATCHes require `automacao.fluxo.editar`, as editing a contact does in `servicos-do-roteador.ts`.
 */

export const TEXTO_BOTAO_MAX = 20;
export const MAXIMO_DE_ITENS_MENU = 3;

interface ConfigurationStored {
  boasVindas?: Partial<ConfigurationOfWelcome>;
  menuPersistente?: { itens?: unknown };
}

const ator = (usuarioId: string): Ator => ({ type: 'usuario', id: usuarioId });

/** Return this account's live flow with raw configuration, or 404. */
async function flowLive(
  tx: TransactionPipe,
  tid: string,
  id: string,
): Promise<{ configuration: ConfigurationStored }> {
  const [atual] = await tx
    .select({ configuration: flow.configuration })
    .from(flow)
    .where(and(eq(flow.tenantId, tid), eq(flow.id, id), ne(flow.estado, 'arquivado')))
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('fluxo');
  return { configuration: (atual.configuration ?? {}) as ConfigurationStored };
}

async function writeConfiguration(
  tx: TransactionPipe,
  tid: string,
  id: string,
  configuracao: ConfigurationStored,
): Promise<void> {
  await tx
    .update(flow)
    .set({ configuration: configuracao, atualizadoEm: new Date() })
    .where(and(eq(flow.tenantId, tid), eq(flow.id, id)));
}

/* ------------------------------------------------------- Boas-vindas */

function boasVindasDe(configuracao: ConfigurationStored): ConfigurationOfWelcome {
  const bv = configuracao.boasVindas ?? {};
  return {
    ativo: bv.ativo === true,
    message: typeof bv.message === 'string' ? bv.message : '',
    textoBotao: typeof bv.textoBotao === 'string' ? bv.textoBotao : 'Começar',
  };
}

export async function carregarBoasVindas(
  tx: TransactionPipe,
  tid: string,
  id: string,
): Promise<ConfigurationOfWelcome> {
  const { configuration } = await flowLive(tx, tid, id);
  return boasVindasDe(configuration);
}

export interface PedidoDeBoasVindas {
  active: boolean;
  /** Require and read these fields only when `ativo` is `true`. */
  message?: string;
  textoBotao?: string;
}

/**
 * `ativo: false` disables without erasing saved content, so reactivation restores the prior message. For an active Messenger contact, also update the Page profile (`get_started`/`greeting`); local persistence remains the screen's read source.
 */
export async function salvarBoasVindas(
  tx: TransactionPipe,
  tid: string,
  userId: string,
  id: string,
  pedido: PedidoDeBoasVindas,
): Promise<ConfigurationOfWelcome> {
  const { configuration } = await flowLive(tx, tid, id);
  /* As duas telas são `basicConfigurations` no `PermissionsList.html` da origem:
     quem tem a permissão NESTE contato também salva, sem tirar de quem já
     salvava pela conta (migração 0035). */
  await requirePermissionInFlow(tx, userId, id, 'basicConfigurations.escrever');

  const antes = boasVindasDe(configuration);
  let depois: ConfigurationOfWelcome;
  if (pedido.active) {
    const message = typeof pedido.message === 'string' ? pedido.message.trim() : '';
    const textoBotao = typeof pedido.textoBotao === 'string' ? pedido.textoBotao.trim() : '';
    if (!message) {
      throw PipeError.request('welcome_vindas_message', 'Escreva a mensagem de saudação.');
    }
    if (!textoBotao) {
      throw PipeError.request('welcome_vindas_button', 'Escreva o texto do botão.');
    }
    if (textoBotao.length > TEXTO_BOTAO_MAX) {
      throw PipeError.request(
        'welcome_vindas_button',
        `O texto do botão pode ter até ${TEXTO_BOTAO_MAX} caracteres.`,
      );
    }
    depois = { ativo: true, message, textoBotao };
  } else {
    depois = { ...antes, ativo: false };
  }

  const mudanca = diferenca({ ...antes }, { ...depois });
  if (Object.keys(mudanca.depois).length > 0) {
    await writeConfiguration(tx, tid, id, { ...configuration, boasVindas: depois });
    await registrarAuditoria(tx, tid, {
      ator: ator(userId),
      acao: 'alterou',
      objetoTipo: 'fluxo_boas_vindas',
      objetoId: id,
      antes: mudanca.antes,
      depois: mudanca.depois,
    });
    const contactMessenger = await loadContact(tx, tid, id);
    if (contactMessenger?.channelType === 'messenger' && contactMessenger.channelActive && contactMessenger.channelId) {
      const channel = await readChannelMessenger(tid, contactMessenger.channelId);
      // Verify with a real token that the Page accepts this combination of `get_started` and `greeting`.
      await aplicarPerfilMessenger(channel, depois.ativo
        ? { get_started: { payload: 'PIPE_COMECAR' }, greeting: [{ locale: 'default', text: depois.message }] }
        : { get_started: null, greeting: [] });
    }
  }
  return depois;
}

/* --------------------------------------------------- Menu Persistente */

function itensDe(configuracao: ConfigurationStored): { texto: string; link: string }[] {
  const brutos = configuracao.menuPersistente?.itens;
  if (!Array.isArray(brutos)) return [];
  return brutos.slice(0, MAXIMO_DE_ITENS_MENU).map((item) => {
    const objeto = item as { texto?: unknown; link?: unknown } | null;
    return {
      texto: typeof objeto?.texto === 'string' ? objeto.texto : '',
      link: typeof objeto?.link === 'string' ? objeto.link : '',
    };
  });
}

/** A filled welcome screen is active with message and button text; the persistent menu requires it. */
function boasVindasPreenchidaEm(configuracao: ConfigurationStored): boolean {
  const bv = boasVindasDe(configuracao);
  return bv.ativo && bv.message.trim().length > 0 && bv.textoBotao.trim().length > 0;
}

export async function carregarMenuPersistente(
  tx: TransactionPipe,
  tid: string,
  id: string,
): Promise<ConfigurationOfMenuPersistent> {
  const { configuration } = await flowLive(tx, tid, id);
  return {
    itens: itensDe(configuration),
    boasVindasPreenchida: boasVindasPreenchidaEm(configuration),
  };
}

export interface ItemDoPedido {
  texto?: string;
  link?: string;
}

/**
 * Enforce both source gates: a connected Messenger channel and a populated Welcome Screen (`tela.tsx`). The earlier source note said the second gate could not yet be reproduced; Welcome Screen is now persisted.
 */
export async function salvarMenuPersistente(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: ItemDoPedido[],
): Promise<ConfigurationOfMenuPersistent> {
  const { configuration } = await flowLive(tx, tid, id);
  /* As duas telas são `basicConfigurations` no `PermissionsList.html` da origem:
     quem tem a permissão NESTE contato também salva, sem tirar de quem já
     salvava pela conta (migração 0035). */
  await requirePermissionInFlow(tx, usuarioId, id, 'basicConfigurations.escrever');

  const contact = await loadContact(tx, tid, id);
  if (contact?.channelType !== 'messenger' || contact.channelActive !== true) {
    throw PipeError.request(
      'menu_persistent_channel',
      'Só é possível ativar o menu persistente se o seu chatbot estiver conectado ao Facebook Messenger.',
    );
  }
  if (!boasVindasPreenchidaEm(configuration)) {
    throw PipeError.request(
      'menu_persistent_welcome_vindas',
      'Antes de salvar o menu persistente, você precisa preencher a tela de boas-vindas.',
    );
  }

  const itens = (Array.isArray(pedido) ? pedido : [])
    .slice(0, MAXIMO_DE_ITENS_MENU)
    .map((item) => ({
      texto: typeof item?.texto === 'string' ? item.texto.trim() : '',
      link: typeof item?.link === 'string' ? item.link.trim() : '',
    }));
  for (const item of itens) {
    if (Boolean(item.texto) !== Boolean(item.link)) {
      throw PipeError.request(
        'menu_persistent_item',
        'Preencha o texto e o link do item, ou deixe os dois vazios.',
      );
    }
  }
  const preenchidos = itens.filter((item) => item.texto && item.link);

  const antes = { itens: itensDe(configuration) };
  const depois = { itens: preenchidos };
  const mudanca = diferenca(
    { itens: JSON.stringify(antes.itens) },
    { itens: JSON.stringify(depois.itens) },
  );
  if (Object.keys(mudanca.depois).length > 0) {
    await writeConfiguration(tx, tid, id, {
      ...configuration,
      menuPersistente: { itens: preenchidos },
    });
    await registrarAuditoria(tx, tid, {
      ator: ator(usuarioId),
      acao: 'alterou',
      objetoTipo: 'fluxo_menu_persistente',
      objetoId: id,
      antes,
      depois,
    });
  }
  const contatoMessenger = await loadContact(tx, tid, id);
  if (contatoMessenger?.channelType === 'messenger' && contatoMessenger.channelActive && contatoMessenger.channelId) {
    const canal = await readChannelMessenger(tid, contatoMessenger.channelId);
    // Verify with a real token that the Page accepts this `persistent_menu` shape.
    await aplicarPerfilMessenger(canal, { persistent_menu: [{ locale: 'default', composer_input_disabled: false, call_to_actions: preenchidos.map((item) => ({ type: 'web_url', title: item.texto, url: item.link })) }] });
  }
  return { itens: preenchidos, boasVindasPreenchida: true };
}
