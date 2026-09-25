import { and, asc, eq, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { Ator, TransacaoPipe as TransactionPipe } from '@pipe/db';
import { flow, routerService } from '@pipe/db/schema';
import type {
  DataOfServices,
  RequestOfService,
  RouterService,
  LinkedService,
} from '@pipe/contracts';
import { PipeError } from '../../errors.js';
import { exigirPermissionInFlow } from './team-of-flow.js';

/**
 * Os serviços do roteador — a tela `master.services` da Blip
 * (`referencias-blip/pesquisa/blip-servicos-do-roteador.md`), gravada em `roteador_servico`
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

export const NAME_OF_SERVICE_MAX = 60;
export const EXPIRATION_MAX_MIN = 525_600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ator = (usuarioId: string): Ator => ({ tipo: 'usuario', id: usuarioId });

const colunasDoChatbot = {
  id: flow.id,
  nome: flow.nome,
  estado: flow.estado,
  tipo: flow.tipo,
  shortName: flow.shortName,
};

/* ------------------------------------------------------------- Leitura */

/** Os vínculos do roteador, com o chatbot de cada um. Principal primeiro. */
async function vinculos(tx: TransactionPipe, roteadorId: string): Promise<LinkedService[]> {
  const chatbot = alias(flow, 'chatbot');
  const linhas = await tx
    .select({
      id: routerService.id,
      nome: routerService.nome,
      principal: routerService.principal,
      persistente: routerService.persistente,
      expiracaoMin: routerService.expirationMin,
      chatbot: {
        id: chatbot.id,
        nome: chatbot.nome,
        estado: chatbot.estado,
        tipo: chatbot.tipo,
        shortName: chatbot.shortName,
      },
    })
    .from(routerService)
    .innerJoin(chatbot, eq(chatbot.id, routerService.serviceId))
    .where(eq(routerService.routerId, roteadorId))
    .orderBy(asc(routerService.criadoEm), asc(routerService.nome));
  return linhas;
}

/**
 * `GET …/servicos`. `null` = o fluxo não existe nesta conta (404). Para fluxo que
 * não é roteador, a resposta vem vazia — a tela mostra "não encontrado".
 */
export async function carregarServicos(
  tx: TransactionPipe,
  tid: string,
  id: string,
): Promise<DataOfServices | null> {
  const [router] = await tx
    .select(colunasDoChatbot)
    .from(flow)
    .where(and(eq(flow.tenantId, tid), eq(flow.id, id), ne(flow.estado, 'arquivado')))
    .limit(1);
  if (!router) return null;
  if (router.tipo !== 'roteador')
    return { router: null, principal: null, filhos: [], search: [] };

  const todos = await vinculos(tx, id);
  const search: RouterService[] = await tx
    .select(colunasDoChatbot)
    .from(flow)
    .where(and(eq(flow.tenantId, tid), eq(flow.tipo, 'fluxo'), ne(flow.estado, 'arquivado')))
    .orderBy(asc(flow.nome));
  return {
    router,
    principal: todos.find((s) => s.principal) ?? null,
    filhos: todos.filter((s) => !s.principal),
    search,
  };
}

/* ------------------------------------------------------------- Regras */

/** O roteador vivo desta conta, ou 404; fluxo que não é roteador é pedido inválido. */
async function routerVivo(tx: TransactionPipe, tid: string, id: string) {
  const [atual] = await tx
    .select({ id: flow.id, tipo: flow.tipo })
    .from(flow)
    .where(and(eq(flow.tenantId, tid), eq(flow.id, id), ne(flow.estado, 'arquivado')))
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('fluxo');
  if (atual.tipo !== 'roteador') {
    throw PipeError.request('not_router', 'Só o roteador tem serviços.');
  }
  return atual;
}

type Formulario = Omit<RequestOfService, 'nome'> & { name: string };

/** O formulário normalizado: o que a tela esconde, o banco não guarda. */
function conferido(pedido: Partial<RequestOfService>): Formulario {
  const nome = typeof pedido.nome === 'string' ? pedido.nome.trim() : '';
  if (!nome) throw PipeError.request('service_name', 'Crie um nome para seu serviço.');
  if (nome.length > NAME_OF_SERVICE_MAX) {
    throw PipeError.request(
      'service_name',
      `O nome do serviço pode ter até ${NAME_OF_SERVICE_MAX} caracteres.`,
    );
  }
  const chatbotId = typeof pedido.chatbotId === 'string' ? pedido.chatbotId : '';
  if (!UUID.test(chatbotId)) {
    throw PipeError.request('service_chatbot', 'Associe um chatbot para este serviço.');
  }
  const principal = pedido.principal === true;
  const persistente = !principal && pedido.persistente === true;
  let expirationMin: number | null = null;
  if (!principal && !persistente) {
    const n = pedido.expiracaoMin;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > EXPIRATION_MAX_MIN) {
      throw PipeError.request(
        'service_expiration',
        `Informe a expiração do redirecionamento, em minutos (de 1 a ${EXPIRATION_MAX_MIN}).`,
      );
    }
    expirationMin = n;
  }
  return { name: nome, chatbotId, principal, persistente, expirationMin };
}

/** Os conflitos do formulário com os outros serviços do mesmo roteador. */
async function conferirConflitos(
  tx: TransactionPipe,
  tid: string,
  routerId: string,
  f: Formulario,
  excetoId: string | null,
  chatbotMudou: boolean,
): Promise<void> {
  if (chatbotMudou) {
    const [bot] = await tx
      .select({ tipo: flow.tipo, estado: flow.estado })
      .from(flow)
      .where(and(eq(flow.tenantId, tid), eq(flow.id, f.chatbotId)))
      .limit(1);
    if (!bot || bot.tipo !== 'fluxo' || bot.estado === 'arquivado') {
      throw PipeError.request(
        'service_chatbot',
        'O chatbot do serviço precisa ser um fluxo desta conta, e não pode estar excluído.',
      );
    }
  }
  const outros = (
    await tx
      .select({
        id: routerService.id,
        nome: routerService.nome,
        servicoId: routerService.serviceId,
        principal: routerService.principal,
      })
      .from(routerService)
      .where(eq(routerService.routerId, routerId))
  ).filter((s) => s.id !== excetoId);
  if (outros.some((s) => s.nome === f.name)) {
    throw PipeError.conflito(
      'service_name_in_use',
      'Já existe um serviço com este nome neste roteador.',
    );
  }
  if (outros.some((s) => s.servicoId === f.chatbotId)) {
    throw PipeError.conflito(
      'service_chatbot_in_use',
      'Este chatbot já é um serviço deste roteador.',
    );
  }
  if (f.principal && outros.some((s) => s.principal)) {
    throw PipeError.conflito(
      'service_principal_in_use',
      'Este roteador já tem um chatbot principal.',
    );
  }
}

/** O vínculo como a tela lê. */
async function vinculoLido(
  tx: TransactionPipe,
  roteadorId: string,
  id: string,
): Promise<LinkedService> {
  const lido = (await vinculos(tx, roteadorId)).find((s) => s.id === id);
  if (!lido) throw PipeError.naoEncontrado('serviço');
  return lido;
}

/** O vínculo deste roteador, ou 404. */
async function vinculoAtual(tx: TransactionPipe, roteadorId: string, id: string) {
  if (!UUID.test(id)) throw PipeError.naoEncontrado('serviço');
  const [atual] = await tx
    .select({
      id: routerService.id,
      nome: routerService.nome,
      chatbotId: routerService.serviceId,
      principal: routerService.principal,
      persistente: routerService.persistente,
      expiracaoMin: routerService.expirationMin,
    })
    .from(routerService)
    .where(and(eq(routerService.routerId, roteadorId), eq(routerService.id, id)))
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('serviço');
  return atual;
}

/* ------------------------------------------------------------- Gestos */

export async function createService(
  tx: TransactionPipe,
  tid: string,
  userId: string,
  roteadorId: string,
  pedido: Partial<RequestOfService>,
): Promise<LinkedService> {
  await routerVivo(tx, tid, roteadorId);
  /* A origem não tem linha para os serviços do master no `PermissionsList.html`:
     o item "Serviços" vem do `getTemplateSetupItem()`, não do catálogo de menus. A
     linha mais próxima que ELA tem é `basicConfigurations` — é a configuração
     do próprio contato —, e é ela que vale aqui. Quem já editava pela conta
     segue editando (migração 0035). */
  await exigirPermissionInFlow(tx, userId, roteadorId, 'basicConfigurations.escrever');
  const f = conferido(pedido);
  await conferirConflitos(tx, tid, roteadorId, f, null, true);

  const [criado] = await tx
    .insert(routerService)
    .values({
      tenantId: tid,
      roteadorId,
      servicoId: f.chatbotId,
      nome: f.name,
      principal: f.principal,
      persistente: f.persistente,
      expiracaoMin: f.expiracaoMin,
    })
    .returning({ id: routerService.id });
  if (!criado) throw PipeError.naoEncontrado('serviço');

  await registrarAuditoria(tx, tid, {
    ator: ator(userId),
    acao: 'criou',
    objetoTipo: 'roteador_servico',
    objetoId: criado.id,
    depois: { roteadorId, ...f },
  });
  return vinculoLido(tx, roteadorId, criado.id);
}

/** Só o que veio muda; o resultado passa pelas mesmas regras da criação. */
export async function editarService(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  roteadorId: string,
  id: string,
  pedido: Partial<RequestOfService>,
): Promise<LinkedService> {
  await routerVivo(tx, tid, roteadorId);
  const atual = await vinculoAtual(tx, roteadorId, id);
  /* A origem não tem linha para os serviços do master no `PermissionsList.html`:
     o item "Serviços" vem do `getTemplateSetupItem()`, não do catálogo de menus. A
     linha mais próxima que ELA tem é `basicConfigurations` — é a configuração
     do próprio contato —, e é ela que vale aqui. Quem já editava pela conta
     segue editando (migração 0035). */
  await exigirPermissionInFlow(tx, usuarioId, roteadorId, 'basicConfigurations.escrever');

  const antes = {
    nome: atual.nome,
    chatbotId: atual.chatbotId,
    principal: atual.principal,
    persistente: atual.persistente,
    expiracaoMin: atual.expiracaoMin,
  };
  const definidos = Object.fromEntries(
    Object.entries(pedido ?? {}).filter(([, v]) => v !== undefined),
  ) as Partial<RequestOfService>;
  const f = conferido({ ...antes, ...definidos });
  const mudanca = diferenca(antes, f);
  if (Object.keys(mudanca.depois).length === 0) return vinculoLido(tx, roteadorId, id);
  await conferirConflitos(tx, tid, roteadorId, f, id, f.chatbotId !== antes.chatbotId);

  await tx
    .update(routerService)
    .set({
      nome: f.name,
      servicoId: f.chatbotId,
      principal: f.principal,
      persistente: f.persistente,
      expiracaoMin: f.expiracaoMin,
      atualizadoEm: new Date(),
    })
    .where(and(eq(routerService.tenantId, tid), eq(routerService.id, id)));

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
export async function deleteService(
  tx: TransactionPipe,
  tid: string,
  usuarioId: string,
  roteadorId: string,
  id: string,
): Promise<void> {
  await routerVivo(tx, tid, roteadorId);
  const atual = await vinculoAtual(tx, roteadorId, id);
  /* A origem não tem linha para os serviços do master no `PermissionsList.html`:
     o item "Serviços" vem do `getTemplateSetupItem()`, não do catálogo de menus. A
     linha mais próxima que ELA tem é `basicConfigurations` — é a configuração
     do próprio contato —, e é ela que vale aqui. Quem já editava pela conta
     segue editando (migração 0035). */
  await exigirPermissionInFlow(tx, usuarioId, roteadorId, 'basicConfigurations.escrever');

  await tx
    .delete(routerService)
    .where(and(eq(routerService.tenantId, tid), eq(routerService.id, id)));

  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'excluiu',
    objetoTipo: 'roteador_servico',
    objetoId: id,
    antes: { roteadorId, ...atual },
  });
}
