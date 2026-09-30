import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { noTenant } from '../database.js';
import { PipeError } from '../errors.js';
import { WithSession, sessionOf } from '../session.js';
import type { RequestWithSession } from '../session.js';
import {
  createFlow,
  editFlow,
  deleteFlow,
  type FlowWritten,
} from '../domain/management/cycle-of-lifetime-of-flow.js';
import {
  loadChannelOfFlowInScreen,
  disconnectChannelOfFlow,
  connectChannelToFlow,
} from '../domain/management/channel-of-flow.js';
import {
  carregarBoasVindas,
  carregarMenuPersistente,
  salvarBoasVindas,
  salvarMenuPersistente,
} from '../domain/management/configuration-of-flow.js';
import type { RecadosDoNome } from '../domain/management/regras-de-nome.js';
import {
  carregarServicos,
  createService,
  editService,
  deleteService,
} from '../domain/management/services-of-router.js';
import {
  listFlowResources,
  createFlowResource,
  updateFlowResource,
  deleteFlowResource,
} from '../domain/management/flow-resources.js';
import {
  listFlowSecrets,
  createFlowSecret,
  updateFlowSecret,
  deleteFlowSecret,
} from '../domain/management/flow-secrets.js';
import {
  loadChannelOfFlow,
  carregarGradeDoPortal,
  loadContact,
  loadContactByShortName,
  loadDetailContactOfFlow,
  carregarGrowth,
  loadLogsOfFlow,
  carregarModelos,
  fusoDoTenant,
  listContactsOfFlow,
} from '../domain/management-flow.js';
import type {
  ChannelOfFlow,
  ChannelOfFlowInScreen,
  ConfigurationOfWelcome,
  ConfigurationOfMenuPersistent,
  DataOfServices,
  GradeDoPortal,
  RequestOfChannelOfFlow,
  RequestOfService,
  LinkedService,
  FlowResource,
  FlowResourceInput,
  FlowSecret,
  FlowSecretInput,
} from '@pipe/contracts';
import { BY_PAGE } from '@pipe/contracts';
import type {
  ContactOfFlow,
  ContactListed,
  DataOfGrowth,
  DetailOfContact,
  LogOfFlow,
  TemplateListed,
} from '../domain/management-flow.js';

/**
 * Management contact screens (`/fluxo/:id/**`) use browser sessions. This was the first Next-to-Vite front-end migration (README, "Quem fala com o banco"): Next Server Component reads became one API route per read, with the same data and tenant from the session, never the URL. Contact creation, editing and deletion share this adapter through `POST`, `PATCH /:id` and `DELETE /:id`; rules live in `dominio/gestao/ciclo-de-vida-do-fluxo.ts`. `id` is `fluxo.id`; reject invalid UUIDs with 404 before Postgres can return 500.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


export function uuidOu404(value: string, oQue: string): string {
  if (!UUID.test(value)) throw PipeError.naoEncontrado(oQue);
  return value;
}

/**
 * The charset `nomeCurto` (`regras-de-nome.ts`) ever produces: letters (including accents),
 * digits, brackets, parentheses, underscore and hyphen, lowercase, no space (D-52 turns spaces
 * into hyphens before saving). Reject anything else before it reaches the database.
 */
const SHORT_NAME = /^[a-zà-ÿ0-9[\]()_-]{1,40}$/;

function shortNameOu404(value: string): string {
  if (!SHORT_NAME.test(value)) throw PipeError.naoEncontrado('fluxo');
  return value;
}


export interface ShellOfContact {
  contact: ContactOfFlow;
  fuso: string;
}

/**
 * O que a tela de criar manda (`apps/management-vite/src/paginas/criar/gravar.ts`).
 *
 * Os `recados` vêm da tela porque são a ÚNICA parte da regra que muda entre
 * criar fluxo e criar roteador: a frase da origem é escrita com "fluxo" e a
 * tela do roteador troca o substantivo (`regras-de-nome.ts`). A regra é a
 * mesma; a palavra não.
 */
export interface RequestOfContact {
  name: string;
  type: 'fluxo' | 'roteador';
  /** Accept `data:image/...;base64,...` or nothing. File bytes determine the type, not the label. */
  image?: string | null;
  recados: RecadosDoNome & { nomeEmUso: string; withoutPermission: string };
}

/**
 * Success is `{ id }`; rejection is `{ erro }` with the screen's phrase, both with 200. The create screen expects this contract and carries `erro` back to the name step in the URL. This exception to this controller's `ErroPipe` pattern applies only to POST; PATCH and DELETE use status codes and `{ erro: { codigo, mensagem } }` like the rest of the `api`.
 */
export type ResultOfContact =
  { id: string; shortName: string; error?: undefined } | { id?: undefined; shortName?: undefined; error: string };

export interface RequestOfEditOfContact {
  name?: string;
  /** `null` or empty clears the value; absence leaves it unchanged. */
  description?: string | null;
  /** `data:` replaces the image, `null` removes it, and absence leaves it unchanged. */
  imagem?: string | null;
}

@Controller('v1/management/flows')
export class ManagementFlowController {
  /**
   * Create a contact (flow or router). Permission, name, photo and uniqueness rules live in `ciclo-de-vida-do-fluxo.ts`; this adapter maps each rejection to the phrase requested by the screen.
   */
  @Post()
  @HttpCode(200)
  @WithSession()
  async create(
    @Req() request: RequestWithSession,
    @Body() corpo: RequestOfContact,
  ): Promise<ResultOfContact> {
    const session = sessionOf(request);
    const recados = corpo?.recados;
    if (!recados) throw PipeError.request('messages_missing', 'Faltam os recados da tela.');
    const frases: Record<string, string | undefined> = {
      name_size: recados.tamanho,
      name_start: recados.comecoInvalido,
      name_in_use: recados.nomeEmUso,
      without_permission: recados.withoutPermission,
    };
    try {
      return await noTenant(session.tenantId, (tx) =>
        createFlow(tx, session.tenantId, session.userId, {
          name: String(corpo.name ?? ''),
          type: corpo.type === 'roteador' ? 'roteador' : 'fluxo',
          image: corpo.image ?? null,
        }),
      );
    } catch (error) {
      const frase = error instanceof PipeError ? frases[error.codigo] : undefined;
      if (!frase) throw error;
      return { error: frase };
    }
  }


  @Patch(':id')
  @WithSession()
  async editar(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: RequestOfEditOfContact,
  ): Promise<FlowWritten> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    /*
     * JSON is external input. Treat a value other than a string, or `null` where it is allowed, as absent; absent means leave the field unchanged.
     */
    const nome = corpo?.name;
    const description = corpo?.description;
    const image = corpo?.imagem;
    return noTenant(sessao.tenantId, (tx) =>
      editFlow(tx, sessao.tenantId, sessao.userId, id, {
        name: typeof nome === 'string' ? nome : undefined,
        description: description === null || typeof description === 'string' ? description : undefined,
        imagem: image === null || typeof image === 'string' ? image : undefined,
      }),
    );
  }


  @Delete(':id')
  @HttpCode(204)
  @WithSession()
  async excluir(@Req() requisicao: RequestWithSession, @Param('id') id: string): Promise<void> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    await noTenant(sessao.tenantId, (tx) =>
      deleteFlow(tx, sessao.tenantId, sessao.userId, id),
    );
  }

  /** Portal grid: an unlisted page size falls back to the first allowed size, and an invalid page becomes 1. */
  @Get()
  @WithSession()
  async grade(
    @Req() requisicao: RequestWithSession,
    @Query('search') search?: string,
    @Query('pagina') page?: string,
    @Query('porPagina') byPage?: string,
  ): Promise<GradeDoPortal> {
    const sessao = sessionOf(requisicao);
    const tamanho = Number(byPage);
    return noTenant(sessao.tenantId, (tx) =>
      carregarGradeDoPortal(tx, {
        search: search ?? '',
        page: Math.max(1, Math.trunc(Number(page)) || 1),
        byPage: (BY_PAGE as readonly number[]).includes(tamanho) ? tamanho : BY_PAGE[0],
      }),
    );
  }

  /**
   * Resolve a flow by its URL key (D-52), the address `/application/detail/{shortName}/...`
   * needs. Declared before `:id` so a two-segment path like `short-name/meu-bot` never matches
   * `:id/xxx` sub-routes instead. Same session guard and response shape as `:id`; the query
   * additionally excludes archived flows, since an archived flow's short name may already
   * belong to a live one.
   */
  @Get('short-name/:shortName')
  @WithSession()
  async contactByShortName(
    @Req() requisicao: RequestWithSession,
    @Param('shortName') shortName: string,
  ): Promise<ShellOfContact> {
    const sessao = sessionOf(requisicao);
    shortNameOu404(shortName);
    const resultado = await noTenant(sessao.tenantId, async (tx) => {
      const contato = await loadContactByShortName(tx, sessao.tenantId, shortName);
      if (!contato) return null;
      return { contact: contato, fuso: await fusoDoTenant(tx) };
    });
    if (!resultado) throw PipeError.naoEncontrado('fluxo');
    return resultado;
  }

  @Get(':id')
  @WithSession()
  async contact(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<ShellOfContact> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    const resultado = await noTenant(sessao.tenantId, async (tx) => {
      const contato = await loadContact(tx, sessao.tenantId, id);
      if (!contato) return null;
      return { contact: contato, fuso: await fusoDoTenant(tx) };
    });
    if (!resultado) throw PipeError.naoEncontrado('fluxo');
    return resultado;
  }

  /**
   * The bot's channel is the source `channels/{canal}` page. The rules for one bot per number, refusing inactive channels and `channels.escrever` permission on the flow live in `dominio/gestao/canal-do-fluxo.ts`.
   */
  @Get(':id/channel')
  @WithSession()
  async channel(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<ChannelOfFlowInScreen> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) => loadChannelOfFlowInScreen(tx, sessao.tenantId, id));
  }


  @Put(':id/channel')
  @WithSession()
  async connectChannel(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: Partial<RequestOfChannelOfFlow>,
  ): Promise<ChannelOfFlow> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    const channelId = typeof corpo?.canalId === 'string' ? corpo.canalId : '';
    if (!channelId) throw PipeError.request('channel_required', 'Informe `canalId`.');
    uuidOu404(channelId, 'canal');
    return noTenant(sessao.tenantId, (tx) =>
      connectChannelToFlow(tx, sessao.tenantId, sessao.userId, id, channelId),
    );
  }

  /**
   * Disconnect the channel from this bot, leaving the channel itself connected to Meta. Optional `motivo` comes from the source disconnect modal and is written to the log.
   */
  @Delete(':id/channel')
  @HttpCode(204)
  @WithSession()
  async disconnectChannel(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo?: { reason?: string },
  ): Promise<void> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    const motivo = typeof corpo?.reason === 'string' ? corpo.reason.trim().slice(0, 500) : '';
    await noTenant(sessao.tenantId, (tx) =>
      disconnectChannelOfFlow(tx, sessao.tenantId, sessao.userId, id, motivo || undefined),
    );
  }

  /** "Tela de Boas-vindas" — a regra mora em `dominio/gestao/configuracao-do-fluxo.ts`. */
  @Get(':id/welcome')
  @WithSession()
  async boasVindas(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<ConfigurationOfWelcome> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) => carregarBoasVindas(tx, sessao.tenantId, id));
  }

  @Patch(':id/welcome')
  @WithSession()
  async salvarBoasVindasRota(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: { active?: boolean; message?: string; textoBotao?: string },
  ): Promise<ConfigurationOfWelcome> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      salvarBoasVindas(tx, sessao.tenantId, sessao.userId, id, {
        active: corpo?.active === true,
        message: typeof corpo?.message === 'string' ? corpo.message : undefined,
        textoBotao: typeof corpo?.textoBotao === 'string' ? corpo.textoBotao : undefined,
      }),
    );
  }

  /** "Menu Persistente" — mesma regra do arquivo acima. */
  @Get(':id/menu-persistent')
  @WithSession()
  async menuPersistente(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<ConfigurationOfMenuPersistent> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) => carregarMenuPersistente(tx, sessao.tenantId, id));
  }

  @Patch(':id/menu-persistent')
  @WithSession()
  async salvarMenuPersistenteRota(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: { itens?: { texto?: string; link?: string }[] },
  ): Promise<ConfigurationOfMenuPersistent> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    const itens = Array.isArray(corpo?.itens) ? corpo.itens : [];
    return noTenant(sessao.tenantId, (tx) =>
      salvarMenuPersistente(tx, sessao.tenantId, sessao.userId, id, itens),
    );
  }

  @Get(':id/contacts')
  @WithSession()
  async contacts(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<ContactListed[]> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) => listContactsOfFlow(tx, sessao.tenantId, id));
  }

  @Get(':id/contacts/:contactId')
  @WithSession()
  async detailOfContact(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Query('ticketId') ticketId?: string,
  ): Promise<DetailOfContact> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    uuidOu404(contactId, 'contato');
    const detalhe = await noTenant(sessao.tenantId, (tx) =>
      loadDetailContactOfFlow(
        tx,
        sessao.tenantId,
        id,
        contactId,
        ticketId && UUID.test(ticketId) ? ticketId : undefined,
      ),
    );
    if (!detalhe) throw PipeError.naoEncontrado('contato');
    return detalhe;
  }

  @Get(':id/logs')
  @WithSession()
  async logs(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Query('search') busca?: string,
  ): Promise<LogOfFlow[]> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      loadLogsOfFlow(tx, sessao.tenantId, id, busca ?? ''),
    );
  }

  /** Growth belongs to the account, not the contact; this route carries `id` only to share the adapter. */
  @Get(':id/growth')
  @WithSession()
  async growth(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<DataOfGrowth> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) => carregarGrowth(tx, sessao.tenantId));
  }

  @Get(':id/content-items')
  @WithSession()
  async conteudos(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<{ channelId: string | null; modelos: TemplateListed[] }> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, async (tx) => {
      const canalId = await loadChannelOfFlow(tx, sessao.tenantId, id);
      const modelos = canalId ? await carregarModelos(tx, canalId) : [];
      return { channelId: canalId, modelos };
    });
  }


  @Get(':id/services')
  @WithSession()
  async servicos(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<DataOfServices> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    const data = await noTenant(sessao.tenantId, (tx) =>
      carregarServicos(tx, sessao.tenantId, id),
    );
    if (!data) throw PipeError.naoEncontrado('fluxo');
    return data;
  }

  @Post(':id/services')
  @WithSession()
  async createService(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: Partial<RequestOfService>,
  ): Promise<LinkedService> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      createService(tx, sessao.tenantId, sessao.userId, id, corpo ?? {}),
    );
  }

  @Patch(':id/services/:serviceId')
  @WithSession()
  async editService(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Param('serviceId') serviceId: string,
    @Body() corpo: Partial<RequestOfService>,
  ): Promise<LinkedService> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    uuidOu404(serviceId, 'serviço');
    return noTenant(sessao.tenantId, (tx) =>
      editService(tx, sessao.tenantId, sessao.userId, id, serviceId, corpo ?? {}),
    );
  }

  @Delete(':id/services/:serviceId')
  @HttpCode(204)
  @WithSession()
  async deleteService(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Param('serviceId') servicoId: string,
  ): Promise<void> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    uuidOu404(servicoId, 'serviço');
    await noTenant(sessao.tenantId, (tx) =>
      deleteService(tx, sessao.tenantId, sessao.userId, id, servicoId),
    );
  }

  /**
   * Blip "Recursos" (`resources.ler`/`resources.escrever` on this flow, `requirePermissionInFlow`
   * like `basicConfigurations` above). CRUD for the key/value store the builder's
   * `{{resource.<name>}}` reads through the engine's `resource` provider.
   */
  @Get(':id/resources')
  @WithSession()
  async resources(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<FlowResource[]> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      listFlowResources(tx, sessao.userId, sessao.tenantId, id),
    );
  }

  @Post(':id/resources')
  @WithSession()
  async createResource(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: FlowResourceInput,
  ): Promise<FlowResource> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      createFlowResource(tx, sessao.userId, sessao.tenantId, id, corpo),
    );
  }

  @Put(':id/resources/:resourceId')
  @WithSession()
  async updateResource(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Param('resourceId') resourceId: string,
    @Body() corpo: FlowResourceInput,
  ): Promise<FlowResource> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    uuidOu404(resourceId, 'recurso');
    return noTenant(sessao.tenantId, (tx) =>
      updateFlowResource(tx, sessao.userId, sessao.tenantId, id, resourceId, corpo),
    );
  }

  @Delete(':id/resources/:resourceId')
  @HttpCode(204)
  @WithSession()
  async deleteResource(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Param('resourceId') resourceId: string,
  ): Promise<void> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    uuidOu404(resourceId, 'recurso');
    await noTenant(sessao.tenantId, (tx) =>
      deleteFlowResource(tx, sessao.userId, sessao.tenantId, id, resourceId),
    );
  }

  /**
   * Builder "Variáveis sensíveis" (`builder.ler`/`builder.escrever` on this flow): the secrets
   * `{{secret.<name>}}` reads in HTTP actions. Write-only: no response carries the value.
   */
  @Get(':id/secrets')
  @WithSession()
  async secrets(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<FlowSecret[]> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      listFlowSecrets(tx, sessao.userId, sessao.tenantId, id),
    );
  }

  @Post(':id/secrets')
  @WithSession()
  async createSecret(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: FlowSecretInput,
  ): Promise<FlowSecret> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      createFlowSecret(tx, sessao.userId, sessao.tenantId, id, corpo),
    );
  }

  @Put(':id/secrets/:secretId')
  @WithSession()
  async updateSecret(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Param('secretId') secretId: string,
    @Body() corpo: FlowSecretInput,
  ): Promise<FlowSecret> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    uuidOu404(secretId, 'variável sensível');
    return noTenant(sessao.tenantId, (tx) =>
      updateFlowSecret(tx, sessao.userId, sessao.tenantId, id, secretId, corpo),
    );
  }

  @Delete(':id/secrets/:secretId')
  @HttpCode(204)
  @WithSession()
  async deleteSecret(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Param('secretId') secretId: string,
  ): Promise<void> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    uuidOu404(secretId, 'variável sensível');
    await noTenant(sessao.tenantId, (tx) =>
      deleteFlowSecret(tx, sessao.userId, sessao.tenantId, id, secretId),
    );
  }
}
