import { and, asc, eq, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { Ator, TransactionPipe } from '@pipe/db';
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
 * Router services mirror Blip `master.services` (`referencias-blip/pesquisa/blip-servicos-do-roteador.md`) in `roteador_servico` (migration 0024). Follow `ciclo-de-vida-do-fluxo.ts`/Chatwoot `inboxes_controller`: find router within account (404 otherwise), authorize, validate, write and audit. Source form requires unique router-local service name as `Redirect.address`, one live non-router account flow per service, at most one principal bot, hidden persistence/expiry for principal, and hidden expiry for persistent; expiry is required otherwise. Pipe defines integer expiry in MINUTES from 1 to 525,600 (source help says seconds but UI does not show a unit), 60-character name, 409 instead of silently replacing an existing principal, and deletion of principal without auto-promotion; conversations then fall back to the queue. All writes require `automacao.fluxo.editar` because changing a service edits its router.
 */

export const NAME_OF_SERVICE_MAX = 60;
export const EXPIRATION_MAX_MIN = 525_600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ator = (usuarioId: string): Ator => ({ type: 'usuario', id: usuarioId });

const colunasDoChatbot = {
  id: flow.id,
  nome: flow.nome,
  estado: flow.estado,
  tipo: flow.tipo,
  shortName: flow.shortName,
};

/* ------------------------------------------------------------- Leitura */

/** Router associations with their chatbots, principal first. */
async function vinculos(tx: TransactionPipe, roteadorId: string): Promise<LinkedService[]> {
  const chatbot = alias(flow, 'chatbot');
  const linhas = await tx
    .select({
      id: routerService.id,
      nome: routerService.nome,
      principal: routerService.principal,
      persistente: routerService.persistente,
      expirationMin: routerService.expirationMin,
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
 * `GET …/servicos`: `null` when the flow is outside this account (404). A non-router flow returns an empty result and the screen shows 'não encontrado'.
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

/** Return this account's live router or 404; a non-router flow is an invalid request. */
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

/** Normalize the form so hidden fields are not stored. */
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
  return { name: nome, chatbotId, principal, persistente, expiracaoMin: expirationMin };
}


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


async function vinculoLido(
  tx: TransactionPipe,
  roteadorId: string,
  id: string,
): Promise<LinkedService> {
  const lido = (await vinculos(tx, roteadorId)).find((s) => s.id === id);
  if (!lido) throw PipeError.naoEncontrado('serviço');
  return lido;
}

/** Return this router's association or 404. */
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
      routerId: roteadorId,
      serviceId: f.chatbotId,
      nome: f.name,
      principal: f.principal,
      persistente: f.persistente,
      expirationMin: f.expiracaoMin,
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

/** Change supplied fields only, then validate the result with creation rules. */
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
      serviceId: f.chatbotId,
      principal: f.principal,
      persistente: f.persistente,
      expirationMin: f.expiracaoMin,
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
 * Remove the router service but keep its chatbot. On the next message, conversations at its former position return to the principal service because that position no longer resolves.
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
