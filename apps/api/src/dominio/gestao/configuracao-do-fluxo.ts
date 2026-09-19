import { and, eq, ne } from 'drizzle-orm';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { Ator, TransacaoPipe } from '@pipe/db';
import { fluxo } from '@pipe/db/schema';
import type { ConfiguracaoDeBoasVindas, ConfiguracaoDeMenuPersistente } from '@pipe/contracts';
import { ErroPipe } from '../../erros.js';
import { exigirPermissao } from '../../sessao.js';
import { carregarContato } from '../gestao-fluxo.js';
import { EDITAR_FLUXO } from './ciclo-de-vida-do-fluxo.js';

/**
 * "Tela de Boas-vindas" e "Menu Persistente" — os itens 2 e 3 de
 * `/configurations/*` (`docs/pesquisa/blip-portal-telas.md` §6), gravados em
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

interface ConfiguracaoArmazenada {
  boasVindas?: Partial<ConfiguracaoDeBoasVindas>;
  menuPersistente?: { itens?: unknown };
}

const ator = (usuarioId: string): Ator => ({ tipo: 'usuario', id: usuarioId });

/** O fluxo vivo desta conta, com a configuração bruta — ou 404. */
async function fluxoVivo(
  tx: TransacaoPipe,
  tid: string,
  id: string,
): Promise<{ configuracao: ConfiguracaoArmazenada }> {
  const [atual] = await tx
    .select({ configuracao: fluxo.configuracao })
    .from(fluxo)
    .where(and(eq(fluxo.tenantId, tid), eq(fluxo.id, id), ne(fluxo.estado, 'arquivado')))
    .limit(1);
  if (!atual) throw ErroPipe.naoEncontrado('fluxo');
  return { configuracao: (atual.configuracao ?? {}) as ConfiguracaoArmazenada };
}

async function gravarConfiguracao(
  tx: TransacaoPipe,
  tid: string,
  id: string,
  configuracao: ConfiguracaoArmazenada,
): Promise<void> {
  await tx
    .update(fluxo)
    .set({ configuracao, atualizadoEm: new Date() })
    .where(and(eq(fluxo.tenantId, tid), eq(fluxo.id, id)));
}

/* ------------------------------------------------------- Boas-vindas */

function boasVindasDe(configuracao: ConfiguracaoArmazenada): ConfiguracaoDeBoasVindas {
  const bv = configuracao.boasVindas ?? {};
  return {
    ativo: bv.ativo === true,
    mensagem: typeof bv.mensagem === 'string' ? bv.mensagem : '',
    textoBotao: typeof bv.textoBotao === 'string' ? bv.textoBotao : 'Começar',
  };
}

export async function carregarBoasVindas(
  tx: TransacaoPipe,
  tid: string,
  id: string,
): Promise<ConfiguracaoDeBoasVindas> {
  const { configuracao } = await fluxoVivo(tx, tid, id);
  return boasVindasDe(configuracao);
}

export interface PedidoDeBoasVindas {
  ativo: boolean;
  /** Só exigidos (e só lidos) quando `ativo` é `true`. */
  mensagem?: string;
  textoBotao?: string;
}

/**
 * `ativo: false` desliga sem apagar — reativar mostra a última mensagem
 * gravada, em vez de mandar escrever tudo de novo.
 *
 * ponytail: aplicar no canal (o `get_started`/`greeting` da Meta para
 * Messenger e Instagram) ainda não existe; entraria aqui, depois de gravar,
 * chamando a Graph API do canal do fluxo quando `canalTipo` for compatível —
 * o mesmo lugar de onde `carregarContato` já lê `canalTipo`/`canalAtivo`.
 */
export async function salvarBoasVindas(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: PedidoDeBoasVindas,
): Promise<ConfiguracaoDeBoasVindas> {
  const { configuracao } = await fluxoVivo(tx, tid, id);
  await exigirPermissao(tx, usuarioId, EDITAR_FLUXO);

  const antes = boasVindasDe(configuracao);
  let depois: ConfiguracaoDeBoasVindas;
  if (pedido.ativo) {
    const mensagem = typeof pedido.mensagem === 'string' ? pedido.mensagem.trim() : '';
    const textoBotao = typeof pedido.textoBotao === 'string' ? pedido.textoBotao.trim() : '';
    if (!mensagem) {
      throw ErroPipe.requisicao('boas_vindas_mensagem', 'Escreva a mensagem de saudação.');
    }
    if (!textoBotao) {
      throw ErroPipe.requisicao('boas_vindas_botao', 'Escreva o texto do botão.');
    }
    if (textoBotao.length > TEXTO_BOTAO_MAX) {
      throw ErroPipe.requisicao(
        'boas_vindas_botao',
        `O texto do botão pode ter até ${TEXTO_BOTAO_MAX} caracteres.`,
      );
    }
    depois = { ativo: true, mensagem, textoBotao };
  } else {
    depois = { ...antes, ativo: false };
  }

  const mudanca = diferenca({ ...antes }, { ...depois });
  if (Object.keys(mudanca.depois).length > 0) {
    await gravarConfiguracao(tx, tid, id, { ...configuracao, boasVindas: depois });
    await registrarAuditoria(tx, tid, {
      ator: ator(usuarioId),
      acao: 'alterou',
      objetoTipo: 'fluxo_boas_vindas',
      objetoId: id,
      antes: mudanca.antes,
      depois: mudanca.depois,
    });
  }
  return depois;
}

/* --------------------------------------------------- Menu Persistente */

function itensDe(configuracao: ConfiguracaoArmazenada): { texto: string; link: string }[] {
  const brutos = configuracao.menuPersistente?.itens;
  if (!Array.isArray(brutos)) return [];
  return brutos
    .slice(0, MAXIMO_DE_ITENS_MENU)
    .map((item) => {
      const objeto = item as { texto?: unknown; link?: unknown } | null;
      return {
        texto: typeof objeto?.texto === 'string' ? objeto.texto : '',
        link: typeof objeto?.link === 'string' ? objeto.link : '',
      };
    });
}

/** Preenchida = ativa, com mensagem e texto do botão — a trava que o menu persistente pede. */
function boasVindasPreenchidaEm(configuracao: ConfiguracaoArmazenada): boolean {
  const bv = boasVindasDe(configuracao);
  return bv.ativo && bv.mensagem.trim().length > 0 && bv.textoBotao.trim().length > 0;
}

export async function carregarMenuPersistente(
  tx: TransacaoPipe,
  tid: string,
  id: string,
): Promise<ConfiguracaoDeMenuPersistente> {
  const { configuracao } = await fluxoVivo(tx, tid, id);
  return { itens: itensDe(configuracao), boasVindasPreenchida: boasVindasPreenchidaEm(configuracao) };
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
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  id: string,
  pedido: ItemDoPedido[],
): Promise<ConfiguracaoDeMenuPersistente> {
  const { configuracao } = await fluxoVivo(tx, tid, id);
  await exigirPermissao(tx, usuarioId, EDITAR_FLUXO);

  const contato = await carregarContato(tx, tid, id);
  if (contato?.canalTipo !== 'messenger' || contato.canalAtivo !== true) {
    throw ErroPipe.requisicao(
      'menu_persistente_canal',
      'Só é possível ativar o menu persistente se o seu chatbot estiver conectado ao Facebook Messenger.',
    );
  }
  if (!boasVindasPreenchidaEm(configuracao)) {
    throw ErroPipe.requisicao(
      'menu_persistente_boas_vindas',
      'Antes de salvar o menu persistente, você precisa preencher a tela de boas-vindas.',
    );
  }

  const itens = (Array.isArray(pedido) ? pedido : []).slice(0, MAXIMO_DE_ITENS_MENU).map((item) => ({
    texto: typeof item?.texto === 'string' ? item.texto.trim() : '',
    link: typeof item?.link === 'string' ? item.link.trim() : '',
  }));
  for (const item of itens) {
    if (Boolean(item.texto) !== Boolean(item.link)) {
      throw ErroPipe.requisicao('menu_persistente_item', 'Preencha o texto e o link do item, ou deixe os dois vazios.');
    }
  }
  const preenchidos = itens.filter((item) => item.texto && item.link);

  const antes = { itens: itensDe(configuracao) };
  const depois = { itens: preenchidos };
  const mudanca = diferenca(
    { itens: JSON.stringify(antes.itens) },
    { itens: JSON.stringify(depois.itens) },
  );
  if (Object.keys(mudanca.depois).length > 0) {
    await gravarConfiguracao(tx, tid, id, { ...configuracao, menuPersistente: { itens: preenchidos } });
    await registrarAuditoria(tx, tid, {
      ator: ator(usuarioId),
      acao: 'alterou',
      objetoTipo: 'fluxo_menu_persistente',
      objetoId: id,
      antes,
      depois,
    });
  }
  return { itens: preenchidos, boasVindasPreenchida: true };
}
