import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { TransacaoPipe } from '@pipe/db';
import type {
  ConversaDoHistorico,
  FilaDoDesk,
  RespostaDaConversa,
  RespostaDasMetricas,
  TicketDoDesk,
} from '@pipe/contracts';
import { noTenant } from '../banco.js';
import { ErroPipe } from '../erros.js';
import { ComSessao, sessaoDe } from '../sessao.js';
import type { RequisicaoComSessao } from '../sessao.js';
import * as consultas from '../dominio/desk/consultas.js';
import { carregarMetricas } from '../dominio/desk/metricas.js';
import * as acoesDesk from '../dominio/desk/acoes.js';
import { Campos, type CamposCrus, type Resultado } from '../dominio/gestao/acoes/campos.js';

/**
 * O DESK por sessão de navegador: as leituras de cada tela e as ações que
 * escreviam direto no banco.
 *
 * As leituras são as de `dominio/desk/consultas.ts` e `metricas.ts`, movidas
 * do Desk em Next; cada tela faz UMA ida — a fila com os catálogos, a conversa
 * com os itens e o painel, o ticket antigo, as métricas — na mesma transação
 * e em série, como as páginas faziam no servidor. O atendente é sempre o da
 * sessão: não há parâmetro para olhar a fila nem os números de outra pessoa.
 *
 * As ações são as Server Actions movidas para `dominio/desk/acoes.ts` com o
 * corpo intacto: o formulário manda os campos como JSON (`{ campos }`),
 * `Campos` os oferece com `get`/`getAll` como o `FormData` fazia, e a resposta
 * é o mesmo `Resultado`. A lista é FECHADA: nome fora do mapa é 404.
 *
 * Enviar, reenviar, encerrar e espera NÃO estão aqui: já eram
 * `POST /v1/conversas/…` e o navegador chama essas rotas direto.
 */
/** O atendente é o da sessão — é ele que muda de status e assina a nota. */
type Acao = (
  tx: TransacaoPipe,
  tid: string,
  atendenteId: string,
  dados: Campos,
) => Promise<Resultado>;

const ACOES: Record<string, Acao> = {
  definirStatus: acoesDesk.definirStatus,
  cairPorInatividade: acoesDesk.cairPorInatividade,
  salvarNotaInterna: acoesDesk.salvarNotaInterna,
  atender: acoesDesk.atender,
  transferirEmMassa: acoesDesk.transferirEmMassa,
};

/** Quantos dias, no máximo, um recorte de métricas pode cobrir: os 90 da tela, com folga. */
const TETO_DE_DIAS_DAS_METRICAS = 92;

function dataOuNada(valor: string | undefined): Date | null {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

@Controller('v1/desk')
export class ControladorDesk {
  /* ------------------------------------------------------------ leituras */

  /** A fila do atendente e os catálogos da coluna, numa ida só. */
  @Get('fila')
  @ComSessao()
  fila(@Req() requisicao: RequisicaoComSessao): Promise<FilaDoDesk> {
    const sessao = sessaoDe(requisicao);
    // Em série, e não em `Promise.all`: a transação é uma conexão só, e disparar
    // em paralelo na mesma conexão derruba o `set_config` do tenant.
    return noTenant(sessao.tenantId, async (tx) => ({
      conversas: await consultas.listarConversas(tx, sessao.usuarioId),
      aguardando: await consultas.contarAguardando(tx, sessao.usuarioId),
      status: await consultas.carregarStatus(tx, sessao.usuarioId),
      motivos: await consultas.listarMotivosDePausa(tx),
      etiquetas: await consultas.listarEtiquetas(tx),
      colegas: await consultas.listarColegas(tx, sessao.usuarioId),
      respostas: await consultas.listarRespostasProntas(tx, sessao.usuarioId),
    }));
  }

  /** A conversa aberta: mensagens e notas, templates do canal, etiquetas e histórico do contato. */
  @Get('conversas/:id')
  @ComSessao()
  conversa(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<RespostaDaConversa> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const conversa = await consultas.carregarConversa(tx, id, sessao.usuarioId);
      if (!conversa) return { aberta: null };
      return {
        aberta: {
          conversa,
          itens: await consultas.listarItensDaConversa(tx, conversa.id),
          templates: await consultas.listarTemplatesAprovados(tx, conversa.canalId),
          etiquetasDaConversa: await consultas.listarEtiquetasDaConversa(tx, conversa.id),
          historico: await consultas.listarHistoricoDoContato(tx, conversa.contatoId, conversa.id),
        },
      };
    });
  }

  /** As filas do cliente, para o seletor do modal de transferência. */
  @Get('filas')
  @ComSessao()
  filas(
    @Req() requisicao: RequisicaoComSessao,
  ): Promise<{ filas: { id: string; nome: string }[] }> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, async (tx) => ({ filas: await consultas.listarFilas(tx) }));
  }

  /** A aba Contatos: a lista, com busca por nome ou telefone. */
  @Get('contatos')
  @ComSessao()
  contatos(
    @Req() requisicao: RequisicaoComSessao,
    @Query('busca') busca?: string,
  ): Promise<{ contatos: consultas.ContatoDaLista[] }> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, async (tx) => ({
      contatos: await consultas.listarContatos(tx, busca ?? ''),
    }));
  }

  /** Um contato da aba: a ficha e o histórico de atendimentos. */
  @Get('contatos/:id')
  @ComSessao()
  contato(
    @Req() requisicao: RequisicaoComSessao,
    @Param('id') id: string,
  ): Promise<{ contato: consultas.FichaDoContato; historico: ConversaDoHistorico[] }> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const contato = await consultas.carregarContato(tx, id);
      if (!contato) throw ErroPipe.naoEncontrado('contato');
      return { contato, historico: await consultas.listarHistoricoDoContato(tx, id, null) };
    });
  }

  /** Os canais com os modelos aprovados — para a mensagem ativa e as ações em massa. */
  @Get('canais')
  @ComSessao()
  canais(
    @Req() requisicao: RequisicaoComSessao,
  ): Promise<{ canais: Awaited<ReturnType<typeof consultas.listarCanaisComModelos>> }> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, async (tx) => ({
      canais: await consultas.listarCanaisComModelos(tx),
    }));
  }

  /** Um atendimento antigo, em leitura, aberto pelo histórico do contato. */
  @Get('tickets/:id')
  @ComSessao()
  ticket(@Req() requisicao: RequisicaoComSessao, @Param('id') id: string): Promise<TicketDoDesk> {
    const sessao = sessaoDe(requisicao);
    return noTenant(sessao.tenantId, async (tx) => {
      const ticket = await consultas.carregarTicketAntigo(tx, id);
      if (!ticket) throw ErroPipe.naoEncontrado('conversa');
      return {
        ticket,
        itens: await consultas.listarItensDaConversa(tx, ticket.id),
        etiquetas: await consultas.listarEtiquetasDaConversa(tx, ticket.id),
        status: await consultas.carregarStatus(tx, sessao.usuarioId),
      };
    });
  }

  /**
   * "Minhas métricas": sempre do próprio atendente. O intervalo vem pronto do
   * navegador; sem os dois instantes (ou com um deles ilegível) vale o dia de
   * hoje, e um recorte maior que o teto da tela é cortado no fim.
   */
  @Get('metricas')
  @ComSessao()
  metricas(
    @Req() requisicao: RequisicaoComSessao,
    @Query('inicio') inicioBruto?: string,
    @Query('fim') fimBruto?: string,
  ): Promise<RespostaDasMetricas> {
    const sessao = sessaoDe(requisicao);
    const agora = new Date();
    let inicio = dataOuNada(inicioBruto);
    let fim = dataOuNada(fimBruto);
    if (!inicio || !fim) {
      inicio = new Date(agora);
      inicio.setHours(0, 0, 0, 0);
      fim = agora;
    }
    if (inicio > fim) [inicio, fim] = [fim, inicio];
    const tetoMs = TETO_DE_DIAS_DAS_METRICAS * 86_400_000;
    if (fim.getTime() - inicio.getTime() > tetoMs) inicio = new Date(fim.getTime() - tetoMs);

    const de = inicio;
    const ate = fim;
    return noTenant(sessao.tenantId, async (tx) => ({
      metricas: await carregarMetricas(tx, sessao.usuarioId, de, ate),
      status: await consultas.carregarStatus(tx, sessao.usuarioId),
    }));
  }

  /* --------------------------------------------------------------- ações */

  /** Um formulário do Desk: `{ campos }` entra, `Resultado` sai. */
  @Post('acoes/:acao')
  @HttpCode(200)
  @ComSessao()
  async acao(
    @Req() requisicao: RequisicaoComSessao,
    @Param('acao') nome: string,
    @Body() corpo: { campos?: CamposCrus },
  ): Promise<Resultado> {
    const sessao = sessaoDe(requisicao);
    const acao = Object.hasOwn(ACOES, nome) ? ACOES[nome] : undefined;
    if (!acao) throw ErroPipe.naoEncontrado('ação');
    const campos = new Campos(corpo?.campos ?? {});
    return noTenant(sessao.tenantId, (tx) => acao(tx, sessao.tenantId, sessao.usuarioId, campos));
  }
}
