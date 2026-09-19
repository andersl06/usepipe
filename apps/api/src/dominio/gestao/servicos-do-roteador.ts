import { and, asc, eq, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { Ator, TransacaoPipe } from '@pipe/db';
import { fluxo, roteadorServico } from '@pipe/db/schema';
import type {
  DadosDeServicos,
  PedidoDeServico,
  ServicoDoRoteador,
  ServicoVinculado,
} from '@pipe/contracts';
import { ErroPipe } from '../../erros.js';
import { exigirPermissao } from '../../sessao.js';
import { EDITAR_FLUXO } from './ciclo-de-vida-do-fluxo.js';

/**
 * Os serviços do roteador — a tela `master.services` da Blip
 * (`docs/pesquisa/blip-servicos-do-roteador.md`), gravada em `roteador_servico`
 * (migration 0024). A forma dos gestos é a do ciclo de vida do fluxo
 * (`ciclo-de-vida-do-fluxo.ts`, que porta o `inboxes_controller` do Chatwoot):
 * acha o roteador (404 se não é da conta), autoriza, valida, grava, audita.
 *
 * As regras do formulário são as da origem:
 * - "Crie um nome para seu serviço": obrigatório, e único no roteador — é o
 *   `address` do `Redirect`, e dois iguais seriam ambíguos;
 * - "Associe um chatbot para este serviço": um FLUXO (não roteador) da conta,
 *   não arquivado; um chatbot entra uma vez só em cada roteador;
 * - "É o meu chatbot principal": no máximo um; principal esconde (e aqui
 *   ignora) persistência e expiração;
 * - "Não redirecionar automaticamente para o principal": persistente esconde
 *   (e ignora) a expiração;
 * - "Expiração do redirecionamento": obrigatória quando não é principal nem
 *   persistente.
 *
 * Decisões do Pipe onde a origem não diz: a expiração é em MINUTOS inteiros de
 * 1 a 525.600 (um ano; a ajuda da Blip fala em segundos, a tela não mostra a
 * unidade); o nome tem até 60 caracteres; marcar um segundo principal é recusado
 * (409) em vez de rebaixar o atual em silêncio; excluir o principal é permitido —
 * o roteador fica sem bot até outro ser marcado, e a conversa vai para a fila.
 *
 * Permissão: a de editar fluxo (`automacao.fluxo.editar`) nos três gestos —
 * mexer em serviço é editar o roteador.
 */

export const NOME_DO_SERVICO_MAX = 60;
export const EXPIRACAO_MAX_MIN = 525_600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ator = (usuarioId: string): Ator => ({ tipo: 'usuario', id: usuarioId });

const colunasDoChatbot = {
  id: fluxo.id,
  nome: fluxo.nome,
  estado: fluxo.estado,
  tipo: fluxo.tipo,
  shortName: fluxo.shortName,
};

/* ------------------------------------------------------------- Leitura */

/** Os vínculos do roteador, com o chatbot de cada um. Principal primeiro. */
async function vinculos(tx: TransacaoPipe, roteadorId: string): Promise<ServicoVinculado[]> {
  const chatbot = alias(fluxo, 'chatbot');
  const linhas = await tx
    .select({
      id: roteadorServico.id,
      nome: roteadorServico.nome,
      principal: roteadorServico.principal,
      persistente: roteadorServico.persistente,
      expiracaoMin: roteadorServico.expiracaoMin,
      chatbot: {
        id: chatbot.id,
        nome: chatbot.nome,
        estado: chatbot.estado,
        tipo: chatbot.tipo,
        shortName: chatbot.shortName,
      },
    })
    .from(roteadorServico)
    .innerJoin(chatbot, eq(chatbot.id, roteadorServico.servicoId))
    .where(eq(roteadorServico.roteadorId, roteadorId))
    .orderBy(asc(roteadorServico.criadoEm), asc(roteadorServico.nome));
  return linhas;
}

/**
 * `GET …/servicos`. `null` = o fluxo não existe nesta conta (404). Para fluxo que
 * não é roteador, a resposta vem vazia — a tela mostra "não encontrado".
 */
export async function carregarServicos(
  tx: TransacaoPipe,
  tid: string,
  id: string,
): Promise<DadosDeServicos | null> {
  const [roteador] = await tx
    .select(colunasDoChatbot)
    .from(fluxo)
    .where(and(eq(fluxo.tenantId, tid), eq(fluxo.id, id), ne(fluxo.estado, 'arquivado')))
    .limit(1);
  if (!roteador) return null;
  if (roteador.tipo !== 'roteador') return { roteador: null, principal: null, filhos: [], busca: [] };

  const todos = await vinculos(tx, id);
  const busca: ServicoDoRoteador[] = await tx
    .select(colunasDoChatbot)
    .from(fluxo)
    .where(and(eq(fluxo.tenantId, tid), eq(fluxo.tipo, 'fluxo'), ne(fluxo.estado, 'arquivado')))
    .orderBy(asc(fluxo.nome));
  return {
    roteador,
    principal: todos.find((s) => s.principal) ?? null,
    filhos: todos.filter((s) => !s.principal),
    busca,
  };
}

/* ------------------------------------------------------------- Regras */

/** O roteador vivo desta conta, ou 404; fluxo que não é roteador é pedido inválido. */
async function roteadorVivo(tx: TransacaoPipe, tid: string, id: string) {
  const [atual] = await tx
    .select({ id: fluxo.id, tipo: fluxo.tipo })
    .from(fluxo)
    .where(and(eq(fluxo.tenantId, tid), eq(fluxo.id, id), ne(fluxo.estado, 'arquivado')))
    .limit(1);
  if (!atual) throw ErroPipe.naoEncontrado('fluxo');
  if (atual.tipo !== 'roteador') {
    throw ErroPipe.requisicao('nao_e_roteador', 'Só o roteador tem serviços.');
  }
  return atual;
}

type Formulario = Omit<PedidoDeServico, 'nome'> & { nome: string };

/** O formulário normalizado: o que a tela esconde, o banco não guarda. */
function conferido(pedido: Partial<PedidoDeServico>): Formulario {
  const nome = typeof pedido.nome === 'string' ? pedido.nome.trim() : '';
  if (!nome) throw ErroPipe.requisicao('servico_nome', 'Crie um nome para seu serviço.');
  if (nome.length > NOME_DO_SERVICO_MAX) {
    throw ErroPipe.requisicao(
      'servico_nome',
      `O nome do serviço pode ter até ${NOME_DO_SERVICO_MAX} caracteres.`,
    );
  }
  const chatbotId = typeof pedido.chatbotId === 'string' ? pedido.chatbotId : '';
  if (!UUID.test(chatbotId)) {
    throw ErroPipe.requisicao('servico_chatbot', 'Associe um chatbot para este serviço.');
  }
  const principal = pedido.principal === true;
  const persistente = !principal && pedido.persistente === true;
  let expiracaoMin: number | null = null;
  if (!principal && !persistente) {
    const n = pedido.expiracaoMin;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > EXPIRACAO_MAX_MIN) {
      throw ErroPipe.requisicao(
        'servico_expiracao',
        `Informe a expiração do redirecionamento, em minutos (de 1 a ${EXPIRACAO_MAX_MIN}).`,
      );
    }
    expiracaoMin = n;
  }
  return { nome, chatbotId, principal, persistente, expiracaoMin };
}

/** Os conflitos do formulário com os outros serviços do mesmo roteador. */
async function conferirConflitos(
  tx: TransacaoPipe,
  tid: string,
  roteadorId: string,
  f: Formulario,
  excetoId: string | null,
  chatbotMudou: boolean,
): Promise<void> {
  if (chatbotMudou) {
    const [bot] = await tx
      .select({ tipo: fluxo.tipo, estado: fluxo.estado })
      .from(fluxo)
      .where(and(eq(fluxo.tenantId, tid), eq(fluxo.id, f.chatbotId)))
      .limit(1);
    if (!bot || bot.tipo !== 'fluxo' || bot.estado === 'arquivado') {
      throw ErroPipe.requisicao(
        'servico_chatbot',
        'O chatbot do serviço precisa ser um fluxo desta conta, e não pode estar excluído.',
      );
    }
  }
  const outros = (
    await tx
      .select({
        id: roteadorServico.id,
        nome: roteadorServico.nome,
        servicoId: roteadorServico.servicoId,
        principal: roteadorServico.principal,
      })
      .from(roteadorServico)
      .where(eq(roteadorServico.roteadorId, roteadorId))
  ).filter((s) => s.id !== excetoId);
  if (outros.some((s) => s.nome === f.nome)) {
    throw ErroPipe.conflito(
      'servico_nome_em_uso',
      'Já existe um serviço com este nome neste roteador.',
    );
  }
  if (outros.some((s) => s.servicoId === f.chatbotId)) {
    throw ErroPipe.conflito('servico_chatbot_em_uso', 'Este chatbot já é um serviço deste roteador.');
  }
  if (f.principal && outros.some((s) => s.principal)) {
    throw ErroPipe.conflito('servico_principal_em_uso', 'Este roteador já tem um chatbot principal.');
  }
}

/** O vínculo como a tela lê. */
async function vinculoLido(
  tx: TransacaoPipe,
  roteadorId: string,
  id: string,
): Promise<ServicoVinculado> {
  const lido = (await vinculos(tx, roteadorId)).find((s) => s.id === id);
  if (!lido) throw ErroPipe.naoEncontrado('serviço');
  return lido;
}

/** O vínculo deste roteador, ou 404. */
async function vinculoAtual(tx: TransacaoPipe, roteadorId: string, id: string) {
  if (!UUID.test(id)) throw ErroPipe.naoEncontrado('serviço');
  const [atual] = await tx
    .select({
      id: roteadorServico.id,
      nome: roteadorServico.nome,
      chatbotId: roteadorServico.servicoId,
      principal: roteadorServico.principal,
      persistente: roteadorServico.persistente,
      expiracaoMin: roteadorServico.expiracaoMin,
    })
    .from(roteadorServico)
    .where(and(eq(roteadorServico.roteadorId, roteadorId), eq(roteadorServico.id, id)))
    .limit(1);
  if (!atual) throw ErroPipe.naoEncontrado('serviço');
  return atual;
}

/* ------------------------------------------------------------- Gestos */

export async function criarServico(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  roteadorId: string,
  pedido: Partial<PedidoDeServico>,
): Promise<ServicoVinculado> {
  await roteadorVivo(tx, tid, roteadorId);
  await exigirPermissao(tx, usuarioId, EDITAR_FLUXO);
  const f = conferido(pedido);
  await conferirConflitos(tx, tid, roteadorId, f, null, true);

  const [criado] = await tx
    .insert(roteadorServico)
    .values({
      tenantId: tid,
      roteadorId,
      servicoId: f.chatbotId,
      nome: f.nome,
      principal: f.principal,
      persistente: f.persistente,
      expiracaoMin: f.expiracaoMin,
    })
    .returning({ id: roteadorServico.id });
  if (!criado) throw ErroPipe.naoEncontrado('serviço');

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'criou',
    objetoTipo: 'roteador_servico',
    objetoId: criado.id,
    depois: { roteadorId, ...f },
  });
  return vinculoLido(tx, roteadorId, criado.id);
}

/** Só o que veio muda; o resultado passa pelas mesmas regras da criação. */
export async function editarServico(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  roteadorId: string,
  id: string,
  pedido: Partial<PedidoDeServico>,
): Promise<ServicoVinculado> {
  await roteadorVivo(tx, tid, roteadorId);
  const atual = await vinculoAtual(tx, roteadorId, id);
  await exigirPermissao(tx, usuarioId, EDITAR_FLUXO);

  const antes = {
    nome: atual.nome,
    chatbotId: atual.chatbotId,
    principal: atual.principal,
    persistente: atual.persistente,
    expiracaoMin: atual.expiracaoMin,
  };
  const definidos = Object.fromEntries(
    Object.entries(pedido ?? {}).filter(([, v]) => v !== undefined),
  ) as Partial<PedidoDeServico>;
  const f = conferido({ ...antes, ...definidos });
  const mudanca = diferenca(antes, f);
  if (Object.keys(mudanca.depois).length === 0) return vinculoLido(tx, roteadorId, id);
  await conferirConflitos(tx, tid, roteadorId, f, id, f.chatbotId !== antes.chatbotId);

  await tx
    .update(roteadorServico)
    .set({
      nome: f.nome,
      servicoId: f.chatbotId,
      principal: f.principal,
      persistente: f.persistente,
      expiracaoMin: f.expiracaoMin,
      atualizadoEm: new Date(),
    })
    .where(and(eq(roteadorServico.tenantId, tid), eq(roteadorServico.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'roteador_servico',
    objetoId: id,
    antes: mudanca.antes,
    depois: mudanca.depois,
  });
  return vinculoLido(tx, roteadorId, id);
}

/**
 * Tira o serviço do roteador. O chatbot continua existindo; quem estava nele volta ao
 * principal na próxima mensagem (a posição aponta para um serviço que não está mais lá).
 */
export async function excluirServico(
  tx: TransacaoPipe,
  tid: string,
  usuarioId: string,
  roteadorId: string,
  id: string,
): Promise<void> {
  await roteadorVivo(tx, tid, roteadorId);
  const atual = await vinculoAtual(tx, roteadorId, id);
  await exigirPermissao(tx, usuarioId, EDITAR_FLUXO);

  await tx
    .delete(roteadorServico)
    .where(and(eq(roteadorServico.tenantId, tid), eq(roteadorServico.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'excluiu',
    objetoTipo: 'roteador_servico',
    objetoId: id,
    antes: { roteadorId, ...atual },
  });
}
