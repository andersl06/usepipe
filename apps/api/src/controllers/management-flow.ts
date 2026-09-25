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
  editarFlow,
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
  editarService,
  deleteService,
} from '../domain/management/services-of-router.js';
import {
  loadChannelOfFlow,
  carregarGradeDoPortal,
  loadContact,
  loadDetalheContactOfFlow,
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
} from '@pipe/contracts';
import { BY_PAGE } from '@pipe/contracts';
import type {
  ContactOfFlow,
  ContactListed,
  DataOfGrowth,
  DetalheOfContact,
  LogOfFlow,
  TemplateListed,
} from '../domain/management-flow.js';

/**
 * As telas do CONTATO da Gestão (`/fluxo/:id/**`), por sessão de navegador.
 *
 * É a primeira leva da migração do front para Vite (README, "Quem fala com o
 * banco"): o que a Gestão em Next consultava por server component passa a
 * pedir aqui. Uma rota por leitura, o mesmo dado, e o tenant vem da sessão —
 * nunca da URL.
 *
 * O ciclo de vida do contato (criar, editar, excluir) também mora aqui, na
 * mesma casca: `POST`, `PATCH /:id`, `DELETE /:id`. A regra é de
 * `dominio/gestao/ciclo-de-vida-do-fluxo.ts`; o controlador só sabe de sessão
 * e do contrato de cada tela.
 *
 * `id` é o `fluxo.id`. Fora do padrão de uuid a resposta é 404 antes de ir ao
 * banco: URL é texto de fora, e o Postgres recusa uuid malformado com 500.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Exportada para o controlador do Builder (`gestao-builder.ts`), que vive sob a mesma casca. */
export function uuidOu404(value: string, oQue: string): string {
  if (!UUID.test(value)) throw PipeError.naoEncontrado(oQue);
  return value;
}

/** O que a casca do contato precisa: o contato, o canal dele e o fuso da conta. */
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
  /** `data:image/...;base64,...` ou nada. Os bytes decidem o tipo, não o rótulo. */
  image?: string | null;
  recados: RecadosDoNome & { nomeEmUso: string; withoutPermission: string };
}

/**
 * Sucesso é `{ id }`; recusa é `{ erro }` com a frase da tela, em 200 — o
 * contrato que a tela de criar já espera (ela leva o `erro` de volta ao passo
 * do nome pela URL). É a exceção ao padrão `ErroPipe` deste controlador, e
 * fica restrita ao POST: o PATCH e o DELETE respondem status e
 * `{ erro: { codigo, mensagem } }`, como o resto da `api`.
 */
export type ResultOfContact =
  { id: string; error?: undefined } | { id?: undefined; error: string };

export interface RequestOfEditOfContact {
  name?: string;
  /** `null` ou vazio apaga; ausente não mexe. */
  description?: string | null;
  /** `data:` troca, `null` tira, ausente não mexe. */
  imagem?: string | null;
}

@Controller('v1/management/flows')
export class ManagementFlowController {
  /**
   * Criar um contato (fluxo ou roteador). A regra inteira — permissão, nome,
   * foto, nome único — mora em `ciclo-de-vida-do-fluxo.ts`; aqui só se traduz
   * cada recusa para a frase que a tela pediu.
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
      nome_tamanho: recados.tamanho,
      nome_comeco: recados.comecoInvalido,
      nome_em_uso: recados.nomeEmUso,
      sem_permissao: recados.withoutPermission,
    };
    try {
      return await noTenant(session.tenantId, (tx) =>
        createFlow(tx, session.tenantId, session.userId, {
          name: String(corpo.name ?? ''),
          tipo: corpo.type === 'roteador' ? 'roteador' : 'fluxo',
          image: corpo.image ?? null,
        }),
      );
    } catch (error) {
      const frase = error instanceof PipeError ? frases[error.codigo] : undefined;
      if (!frase) throw error;
      return { error: frase };
    }
  }

  /** Editar nome, descrição e imagem — o "Salvar" de "Editar Fluxo". */
  @Patch(':id')
  @WithSession()
  async editar(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo: RequestOfEditOfContact,
  ): Promise<FlowWritten> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    /* JSON é texto de fora: o que não for string (ou `null` onde `null` vale)
       é tratado como ausente, e ausente é "não mexa". */
    const nome = corpo?.name;
    const description = corpo?.description;
    const image = corpo?.imagem;
    return noTenant(sessao.tenantId, (tx) =>
      editarFlow(tx, sessao.tenantId, sessao.userId, id, {
        name: typeof nome === 'string' ? nome : undefined,
        description: description === null || typeof description === 'string' ? description : undefined,
        imagem: image === null || typeof image === 'string' ? image : undefined,
      }),
    );
  }

  /** Excluir — arquiva; o porquê está em `ciclo-de-vida-do-fluxo.ts`. */
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

  /** A grade do portal. Fora da lista de tamanhos, cai no primeiro; página inválida vira 1. */
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
      return { contato, fuso: await fusoDoTenant(tx) };
    });
    if (!resultado) throw PipeError.naoEncontrado('fluxo');
    return resultado;
  }

  /**
   * O canal DO BOT — a página `channels/{canal}` da origem. A regra (um bot por
   * número, canal inativo não liga, permissão `channels.escrever` no fluxo)
   * mora em `dominio/gestao/canal-do-fluxo.ts`.
   */
  @Get(':id/canal')
  @WithSession()
  async channel(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<ChannelOfFlowInScreen> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) => loadChannelOfFlowInScreen(tx, sessao.tenantId, id));
  }

  /** "Ativar número": liga um canal existente da conta a este bot. */
  @Put(':id/canal')
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
   * Desliga o canal deste bot. O canal em si continua conectado à Meta. O
   * `motivo` (opcional) é o do modal de desconexão da origem; vai para o log.
   */
  @Delete(':id/canal')
  @HttpCode(204)
  @WithSession()
  async disconnectChannel(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Body() corpo?: { reason?: string },
  ): Promise<void> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    const motivo = typeof corpo?.motivo === 'string' ? corpo.reason.trim().slice(0, 500) : '';
    await noTenant(sessao.tenantId, (tx) =>
      disconnectChannelOfFlow(tx, sessao.tenantId, sessao.userId, id, motivo || undefined),
    );
  }

  /** "Tela de Boas-vindas" — a regra mora em `dominio/gestao/configuracao-do-fluxo.ts`. */
  @Get(':id/boas-vindas')
  @WithSession()
  async boasVindas(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<ConfigurationOfWelcome> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) => carregarBoasVindas(tx, sessao.tenantId, id));
  }

  @Patch(':id/boas-vindas')
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
  @Get(':id/menu-persistente')
  @WithSession()
  async menuPersistente(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<ConfigurationOfMenuPersistent> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) => carregarMenuPersistente(tx, sessao.tenantId, id));
  }

  @Patch(':id/menu-persistente')
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

  @Get(':id/contatos')
  @WithSession()
  async contacts(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
  ): Promise<ContactListed[]> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) => listContactsOfFlow(tx, sessao.tenantId, id));
  }

  @Get(':id/contatos/:contatoId')
  @WithSession()
  async detalheOfContact(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Param('contatoId') contactId: string,
    @Query('ticketId') ticketId?: string,
  ): Promise<DetalheOfContact> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    uuidOu404(contactId, 'contato');
    const detalhe = await noTenant(sessao.tenantId, (tx) =>
      loadDetalheContactOfFlow(
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

  /** O Growth é da CONTA, não do contato — a rota leva o `id` só para ficar sob a mesma casca. */
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

  @Get(':id/conteudos')
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
      return { canalId, modelos };
    });
  }

  /** Os serviços do roteador. As regras moram em `dominio/gestao/servicos-do-roteador.ts`. */
  @Get(':id/servicos')
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

  @Post(':id/servicos')
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

  @Patch(':id/servicos/:servicoId')
  @WithSession()
  async editarService(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Param('servicoId') serviceId: string,
    @Body() corpo: Partial<RequestOfService>,
  ): Promise<LinkedService> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    uuidOu404(serviceId, 'serviço');
    return noTenant(sessao.tenantId, (tx) =>
      editarService(tx, sessao.tenantId, sessao.userId, id, serviceId, corpo ?? {}),
    );
  }

  @Delete(':id/servicos/:servicoId')
  @HttpCode(204)
  @WithSession()
  async deleteService(
    @Req() requisicao: RequestWithSession,
    @Param('id') id: string,
    @Param('servicoId') servicoId: string,
  ): Promise<void> {
    const sessao = sessionOf(requisicao);
    uuidOu404(id, 'fluxo');
    uuidOu404(servicoId, 'serviço');
    await noTenant(sessao.tenantId, (tx) =>
      deleteService(tx, sessao.tenantId, sessao.userId, id, servicoId),
    );
  }
}
