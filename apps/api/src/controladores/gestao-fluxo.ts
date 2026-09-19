import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { ComSessao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';
import {
  criarFluxo,
  editarFluxo,
  excluirFluxo,
  type FluxoGravado,
} from '../dominio/gestao/ciclo-de-vida-do-fluxo.js';
import {
  carregarBoasVindas,
  carregarMenuPersistente,
  salvarBoasVindas,
  salvarMenuPersistente,
} from '../dominio/gestao/configuracao-do-fluxo.js';
import type { RecadosDoNome } from '../dominio/gestao/regras-de-nome.js';
import {
  carregarServicos,
  criarServico,
  editarServico,
  excluirServico,
} from '../dominio/gestao/servicos-do-roteador.js';
import {
  carregarCanalDoFluxo,
  carregarGradeDoPortal,
  carregarContato,
  carregarDetalheContatoDoFluxo,
  carregarGrowth,
  carregarLogsDoFluxo,
  carregarModelos,
  fusoDoTenant,
  listarContatosDoFluxo,
} from '../dominio/gestao-fluxo.js';
import type {
  ConfiguracaoDeBoasVindas,
  ConfiguracaoDeMenuPersistente,
  DadosDeServicos,
  GradeDoPortal,
  PedidoDeServico,
  ServicoVinculado,
} from '@pipe/contracts';
import { POR_PAGINA } from '@pipe/contracts';
import type {
  ContatoDoFluxo,
  ContatoListado,
  DadosDeGrowth,
  DetalheDoContato,
  LogDoFluxo,
  ModeloListado,
} from '../dominio/gestao-fluxo.js';

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

function uuidOu404(valor: string, oQue: string): string {
  if (!UUID.test(valor)) throw ErroPipe.naoEncontrado(oQue);
  return valor;
}

/** O que a casca do contato precisa: o contato, o canal dele e o fuso da conta. */
export interface CascaDoContato {
  contato: ContatoDoFluxo;
  fuso: string;
}

/**
 * O que a tela de criar manda (`apps/gestao-vite/src/paginas/criar/gravar.ts`).
 *
 * Os `recados` vêm da tela porque são a ÚNICA parte da regra que muda entre
 * criar fluxo e criar roteador: a frase da origem é escrita com "fluxo" e a
 * tela do roteador troca o substantivo (`regras-de-nome.ts`). A regra é a
 * mesma; a palavra não.
 */
export interface PedidoDeContato {
  nome: string;
  tipo: 'fluxo' | 'roteador';
  /** `data:image/...;base64,...` ou nada. Os bytes decidem o tipo, não o rótulo. */
  imagem?: string | null;
  recados: RecadosDoNome & { nomeEmUso: string; semPermissao: string };
}

/**
 * Sucesso é `{ id }`; recusa é `{ erro }` com a frase da tela, em 200 — o
 * contrato que a tela de criar já espera (ela leva o `erro` de volta ao passo
 * do nome pela URL). É a exceção ao padrão `ErroPipe` deste controlador, e
 * fica restrita ao POST: o PATCH e o DELETE respondem status e
 * `{ erro: { codigo, mensagem } }`, como o resto da `api`.
 */
export type ResultadoDeContato =
  { id: string; erro?: undefined } | { id?: undefined; erro: string };

export interface PedidoDeEdicaoDeContato {
  nome?: string;
  /** `null` ou vazio apaga; ausente não mexe. */
  descricao?: string | null;
  /** `data:` troca, `null` tira, ausente não mexe. */
  imagem?: string | null;
}

@Controller('v1/gestao/fluxos')
export class ControladorGestaoFluxo {
  /**
   * Criar um contato (fluxo ou roteador). A regra inteira — permissão, nome,
   * foto, nome único — mora em `ciclo-de-vida-do-fluxo.ts`; aqui só se traduz
   * cada recusa para a frase que a tela pediu.
   */
  @Post()
  @HttpCode(200)
  @ComSessao()
  async criar(
    @Req() requisicao: RequisicaoComSessao,
    @Body() corpo: PedidoDeContato,
  ): Promise<ResultadoDeContato> {
    const sessao = sessaoDe(requisicao);
    const recados = corpo?.recados;
    if (!recados) throw ErroPipe.requisicao('recados_ausentes', 'Faltam os recados da tela.');
    const frases: Record<string, string | undefined> = {
      nome_tamanho: recados.tamanho,
      nome_comeco: recados.comecoInvalido,
      nome_em_uso: recados.nomeEmUso,
      sem_permissao: recados.semPermissao,
    };
    try {
      return await noTenant(sessao.tenantId, (tx) =>
        criarFluxo(tx, sessao.tenantId, sessao.usuarioId, {
          nome: String(corpo.nome ?? ''),
          tipo: corpo.tipo === 'roteador' ? 'roteador' : 'fluxo',
          imagem: corpo.imagem ?? null,
        }),
      );
    } catch (erro) {
      const frase = erro instanceof ErroPipe ? frases[erro.codigo] : undefined;
      if (!frase) throw erro;
      return { erro: frase };
    }
  }

  /** Editar nome, descrição e imagem — o "Salvar" de "Editar Fluxo". */
  @Patch(':id')
  @ComSessao()
  async editar(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: PedidoDeEdicaoDeContato,
  ): Promise<FluxoGravado> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    /* JSON é texto de fora: o que não for string (ou `null` onde `null` vale)
       é tratado como ausente, e ausente é "não mexa". */
    const nome = corpo?.nome;
    const descricao = corpo?.descricao;
    const imagem = corpo?.imagem;
    return noTenant(sessao.tenantId, (tx) =>
      editarFluxo(tx, sessao.tenantId, sessao.usuarioId, id, {
        nome: typeof nome === 'string' ? nome : undefined,
        descricao: descricao === null || typeof descricao === 'string' ? descricao : undefined,
        imagem: imagem === null || typeof imagem === 'string' ? imagem : undefined,
      }),
    );
  }

  /** Excluir — arquiva; o porquê está em `ciclo-de-vida-do-fluxo.ts`. */
  @Delete(':id')
  @HttpCode(204)
  @ComSessao()
  async excluir(@Req() requisicao: RequisicaoComSessao, @Param('id') id: string): Promise<void> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    await noTenant(sessao.tenantId, (tx) =>
      excluirFluxo(tx, sessao.tenantId, sessao.usuarioId, id),
    );
  }

  /** A grade do portal. Fora da lista de tamanhos, cai no primeiro; página inválida vira 1. */
  @Get()
  @ComSessao()
  async grade(
    @Req() requisicao: RequisicaoComSessao,
    @Query('busca') busca?: string,
    @Query('pagina') pagina?: string,
    @Query('porPagina') porPagina?: string,
  ): Promise<GradeDoPortal> {
    const sessao = sessaoDe(requisicao);
    const tamanho = Number(porPagina);
    return noTenant(sessao.tenantId, (tx) =>
      carregarGradeDoPortal(tx, {
        busca: busca ?? '',
        pagina: Math.max(1, Math.trunc(Number(pagina)) || 1),
        porPagina: (POR_PAGINA as readonly number[]).includes(tamanho) ? tamanho : POR_PAGINA[0],
      }),
    );
  }

  @Get(':id')
  @ComSessao()
  async contato(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<CascaDoContato> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    const resultado = await noTenant(sessao.tenantId, async (tx) => {
      const contato = await carregarContato(tx, sessao.tenantId, id);
      if (!contato) return null;
      return { contato, fuso: await fusoDoTenant(tx) };
    });
    if (!resultado) throw ErroPipe.naoEncontrado('fluxo');
    return resultado;
  }

  /** "Tela de Boas-vindas" — a regra mora em `dominio/gestao/configuracao-do-fluxo.ts`. */
  @Get(':id/boas-vindas')
  @ComSessao()
  async boasVindas(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<ConfiguracaoDeBoasVindas> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) => carregarBoasVindas(tx, sessao.tenantId, id));
  }

  @Patch(':id/boas-vindas')
  @ComSessao()
  async salvarBoasVindasRota(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: { ativo?: boolean; mensagem?: string; textoBotao?: string },
  ): Promise<ConfiguracaoDeBoasVindas> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      salvarBoasVindas(tx, sessao.tenantId, sessao.usuarioId, id, {
        ativo: corpo?.ativo === true,
        mensagem: typeof corpo?.mensagem === 'string' ? corpo.mensagem : undefined,
        textoBotao: typeof corpo?.textoBotao === 'string' ? corpo.textoBotao : undefined,
      }),
    );
  }

  /** "Menu Persistente" — mesma regra do arquivo acima. */
  @Get(':id/menu-persistente')
  @ComSessao()
  async menuPersistente(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<ConfiguracaoDeMenuPersistente> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) => carregarMenuPersistente(tx, sessao.tenantId, id));
  }

  @Patch(':id/menu-persistente')
  @ComSessao()
  async salvarMenuPersistenteRota(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: { itens?: { texto?: string; link?: string }[] },
  ): Promise<ConfiguracaoDeMenuPersistente> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    const itens = Array.isArray(corpo?.itens) ? corpo.itens : [];
    return noTenant(sessao.tenantId, (tx) =>
      salvarMenuPersistente(tx, sessao.tenantId, sessao.usuarioId, id, itens),
    );
  }

  @Get(':id/contatos')
  @ComSessao()
  async contatos(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<ContatoListado[]> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) => listarContatosDoFluxo(tx, sessao.tenantId, id));
  }

  @Get(':id/contatos/:contatoId')
  @ComSessao()
  async detalheDoContato(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Param('contatoId') contatoId: string,
    @Query('ticketId') ticketId?: string,
  ): Promise<DetalheDoContato> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    uuidOu404(contatoId, 'contato');
    const detalhe = await noTenant(sessao.tenantId, (tx) =>
      carregarDetalheContatoDoFluxo(
        tx,
        sessao.tenantId,
        id,
        contatoId,
        ticketId && UUID.test(ticketId) ? ticketId : undefined,
      ),
    );
    if (!detalhe) throw ErroPipe.naoEncontrado('contato');
    return detalhe;
  }

  @Get(':id/logs')
  @ComSessao()
  async logs(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Query('busca') busca?: string,
  ): Promise<LogDoFluxo[]> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      carregarLogsDoFluxo(tx, sessao.tenantId, id, busca ?? ''),
    );
  }

  /** O Growth é da CONTA, não do contato — a rota leva o `id` só para ficar sob a mesma casca. */
  @Get(':id/growth')
  @ComSessao()
  async growth(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<DadosDeGrowth> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) => carregarGrowth(tx, sessao.tenantId));
  }

  @Get(':id/conteudos')
  @ComSessao()
  async conteudos(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<{ canalId: string | null; modelos: ModeloListado[] }> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, async (tx) => {
      const canalId = await carregarCanalDoFluxo(tx, sessao.tenantId, id);
      const modelos = canalId ? await carregarModelos(tx, canalId) : [];
      return { canalId, modelos };
    });
  }

  /** Os serviços do roteador. As regras moram em `dominio/gestao/servicos-do-roteador.ts`. */
  @Get(':id/servicos')
  @ComSessao()
  async servicos(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<DadosDeServicos> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    const dados = await noTenant(sessao.tenantId, (tx) =>
      carregarServicos(tx, sessao.tenantId, id),
    );
    if (!dados) throw ErroPipe.naoEncontrado('fluxo');
    return dados;
  }

  @Post(':id/servicos')
  @ComSessao()
  async criarServico(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Body() corpo: Partial<PedidoDeServico>,
  ): Promise<ServicoVinculado> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    return noTenant(sessao.tenantId, (tx) =>
      criarServico(tx, sessao.tenantId, sessao.usuarioId, id, corpo ?? {}),
    );
  }

  @Patch(':id/servicos/:servicoId')
  @ComSessao()
  async editarServico(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Param('servicoId') servicoId: string,
    @Body() corpo: Partial<PedidoDeServico>,
  ): Promise<ServicoVinculado> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    uuidOu404(servicoId, 'serviço');
    return noTenant(sessao.tenantId, (tx) =>
      editarServico(tx, sessao.tenantId, sessao.usuarioId, id, servicoId, corpo ?? {}),
    );
  }

  @Delete(':id/servicos/:servicoId')
  @HttpCode(204)
  @ComSessao()
  async excluirServico(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
    @Param('servicoId') servicoId: string,
  ): Promise<void> {
    const sessao = sessaoDe(requisicao);
    uuidOu404(id, 'fluxo');
    uuidOu404(servicoId, 'serviço');
    await noTenant(sessao.tenantId, (tx) =>
      excluirServico(tx, sessao.tenantId, sessao.usuarioId, id, servicoId),
    );
  }
}
