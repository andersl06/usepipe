import { and, eq, ne } from 'drizzle-orm';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { Ator, TransacaoPipe as TransactionPipe } from '@pipe/db';
import { flow } from '@pipe/db/schema';
import type { ConfigurationOfWelcome, ConfigurationOfMenuPersistent } from '@pipe/contracts';
import { PipeError } from '../../errors.js';
import { loadContact } from '../management-flow.js';
import { exigirPermissionInFlow } from './team-of-flow.js';
import { aplicarPerfilMessenger, readChannelMessenger } from '../messenger/channel.js';

/**
 * "Tela de Boas-vindas" e "Menu Persistente" — os itens 2 e 3 de
 * `/configurations/*` (`referencias-blip/pesquisa/blip-portal-telas.md` §6), gravados em
 * `fluxo.configuracao` (migration 0031). As duas telas não tinham leitura nem
 * escrita: só desenhavam formulário e devolviam "ainda não está disponível".
 *
 * A origem não deixou ver os campos LIGADOS (a régua não ativou o roteador de
 * produção para não alterar o estado dele — `boasvindas/tela.tsx`): não há
 * limite de caracteres capturado para "Mensagem de saudação"; o de "Texto do
 * botão" (20) é decisão do Pipe, pelo teto de título de botão do Messenger
 * (`quick_replies[].title`), que é o canal em que os dois itens se aplicam.
 *
 * Permissão dos dois PATCH: a mesma de "Editar Fluxo" (`automacao.fluxo.editar`)
 * — mexer nestas telas é editar o contato, como já vale para os serviços do
 * roteador (`servicos-do-roteador.ts`).
 */

export const TEXTO_BOTAO_MAX = 20;
export const MAXIMO_DE_ITENS_MENU = 3;

interface ConfigurationStored {
  boasVindas?: Partial<ConfigurationOfWelcome>;
  menuPersistente?: { itens?: unknown };
}

const ator = (usuarioId: string): Ator => ({ tipo: 'usuario', id: usuarioId });

/** O fluxo vivo desta conta, com a configuração bruta — ou 404. */
async function flowVivo(
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
    .set({ configuracao, atualizadoEm: new Date() })
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
  const { configuration } = await flowVivo(tx, tid, id);
  return boasVindasDe(configuration);
}

export interface PedidoDeBoasVindas {
  active: boolean;
  /** Só exigidos (e só lidos) quando `ativo` é `true`. */
  message?: string;
  textoBotao?: string;
}

/**
 * `ativo: false` desliga sem apagar — reativar mostra a última mensagem
 * gravada, em vez de mandar escrever tudo de novo.
 *
 * Quando o contato pertence a um Messenger ativo, a alteração também é aplicada
 * no perfil da Página (`get_started`/`greeting`); a persistência local continua
 * sendo a fonte de leitura da tela.
 */
export async function salvarBoasVindas(
  tx: TransactionPipe,
  tid: string,
  userId: string,
  id: string,
  pedido: PedidoDeBoasVindas,
): Promise<ConfigurationOfWelcome> {
  const { configuration } = await flowVivo(tx, tid, id);
  /* As duas telas são `basicConfigurations` no `PermissionsList.html` da origem:
     quem tem a permissão NESTE contato também salva, sem tirar de quem já
     salvava pela conta (migração 0035). */
  await exigirPermissionInFlow(tx, userId, id, 'basicConfigurations.escrever');

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
    if (contactMessenger?.canalTipo === 'messenger' && contactMessenger.canalAtivo && contactMessenger.canalId) {
      const channel = await readChannelMessenger(tid, contactMessenger.canalId);
      // conferir com token real: get_started e greeting aceitam esta combinação no token da Página.
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

/** Preenchida = ativa, com mensagem e texto do botão — a trava que o menu persistente pede. */
function boasVindasPreenchidaEm(configuracao: ConfigurationStored): boolean {
  const bv = boasVindasDe(configuracao);
  return bv.ativo && bv.message.trim().length > 0 && bv.textoBotao.trim().length > 0;
}

export async function carregarMenuPersistente(
  tx: TransactionPipe,
  tid: string,
  id: string,
): Promise<ConfigurationOfMenuPersistent> {
  const { configuration } = await flowVivo(tx, tid, id);
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
 * As duas travas da origem, para valer: canal Messenger conectado e a tela de
 * Boas-vindas preenchida (`tela.tsx`, "O segundo bloqueio da origem... não tem
 * como ser reproduzido de verdade" — agora tem, porque Boas-vindas grava).
 */
export async function salvarMenuPersistente(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: ItemDoPedido[],
): Promise<ConfigurationOfMenuPersistent> {
  const { configuration } = await flowVivo(tx, tid, id);
  /* As duas telas são `basicConfigurations` no `PermissionsList.html` da origem:
     quem tem a permissão NESTE contato também salva, sem tirar de quem já
     salvava pela conta (migração 0035). */
  await exigirPermissionInFlow(tx, usuarioId, id, 'basicConfigurations.escrever');

  const contact = await loadContact(tx, tid, id);
  if (contact?.canalTipo !== 'messenger' || contact.canalAtivo !== true) {
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
  if (contatoMessenger?.canalTipo === 'messenger' && contatoMessenger.canalAtivo && contatoMessenger.canalId) {
    const canal = await readChannelMessenger(tid, contatoMessenger.canalId);
    // conferir com token real: a Página aceita persistent_menu neste formato.
    await aplicarPerfilMessenger(canal, { persistent_menu: [{ locale: 'default', composer_input_disabled: false, call_to_actions: preenchidos.map((item) => ({ type: 'web_url', title: item.texto, url: item.link })) }] });
  }
  return { itens: preenchidos, boasVindasPreenchida: true };
}
