import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { ChaveOuSessao, atorDe } from '../autenticacao.js';
import type { RequisicaoAutenticada } from '../autenticacao.js';
import { resolverCanal } from '../banco.js';
import {
  LIMITE_DIARIO_POR_CONTATO,
  MAX_CONTATOS_POR_DISPARO,
  dispararMensagemAtiva,
  painelDeAtivas,
} from '../dominio/mensagem-ativa.js';
import type { DestinoDoDisparo } from '../dominio/mensagem-ativa.js';
import { ErroPipe } from '../erros.js';
import type { RequisicaoComSessao } from '../sessao.js';

/**
 * `/v1/mensagens-ativas` — disparo de template para uma lista de contatos.
 *
 * Ver `docs/pesquisa/blip-desk-mensagens-ativas.md` e `dominio/mensagem-ativa.ts`.
 *
 * **A resposta é 207-em-espírito**: 201 com o resultado POR CONTATO. Um número
 * inválido no meio de quinze não derruba os catorze bons, e a tela precisa saber
 * exatamente quem entrou e quem foi recusado — é assim que a tela deles se comporta.
 */

interface CorpoDoDisparo {
  canal_id?: string;
  template_id?: string;
  contatos?: { contato_id?: string; telefone?: string; nome?: string; parametros?: string[] }[];
  parametros?: string[];
}

@Controller('v1/mensagens-ativas')
export class ControladorMensagensAtivas {
  /** Os limites em vigor, para a tela não repetir número mágico. */
  @Get('limites')
  @ChaveOuSessao('mensagens:ler')
  limites(): Record<string, unknown> {
    return {
      max_contatos_por_disparo: MAX_CONTATOS_POR_DISPARO,
      // 0 desliga, como o `ActiveMessageLimitCount` deles.
      limite_diario_por_contato: LIMITE_DIARIO_POR_CONTATO,
    };
  }

  /** O painel "Status geral": últimas 72 horas, como o deles. */
  @Get()
  @ChaveOuSessao('mensagens:ler')
  async painel(
    @Req() requisicao: RequisicaoAutenticada & RequisicaoComSessao,
    @Query('horas') horas: string | undefined,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    const janela = Math.min(Math.max(Number(horas ?? 72) || 72, 1), 720);
    const linhas = await painelDeAtivas(ator.tenantId, janela);
    return {
      janela_horas: janela,
      data: linhas.map((l) => ({
        id: l.mensagemId,
        conversa_id: l.conversaId,
        contato_id: l.contatoId,
        contato_nome: l.contatoNome,
        telefone: l.telefone,
        template_nome: l.templateNome,
        estado_entrega: l.estadoEntrega,
        erro_codigo: l.erroCodigo,
        criada_em: l.criadaEm,
      })),
    };
  }

  @Post()
  @HttpCode(201)
  @ChaveOuSessao('mensagens:escrever')
  async disparar(
    @Req() requisicao: RequisicaoAutenticada & RequisicaoComSessao,
    @Body() corpo: CorpoDoDisparo,
  ): Promise<Record<string, unknown>> {
    const ator = atorDe(requisicao);
    if (!corpo.canal_id) throw ErroPipe.requisicao('canal_obrigatorio', 'Informe `canal_id`.');
    if (!corpo.template_id) {
      throw ErroPipe.requisicao('template_obrigatorio', 'Escolha um modelo aprovado.');
    }

    const canal = await resolverCanal(corpo.canal_id);
    // O canal é resolvido pelo papel dono, então CONFERIR O TENANT aqui não é
    // paranoia: sem isto, um `canal_id` de outro cliente viraria disparo no número
    // dele com a nossa credencial.
    if (!canal || canal.tenantId !== ator.tenantId) throw ErroPipe.naoEncontrado('Canal');
    if (!canal.ativo) throw ErroPipe.conflito('canal_inativo', 'O canal está desativado.');

    const destinos: DestinoDoDisparo[] = (corpo.contatos ?? []).map((c) => ({
      contatoId: c.contato_id ?? null,
      telefone: c.telefone ?? null,
      nome: c.nome ?? null,
      parametros: c.parametros ?? null,
    }));
    if (destinos.some((d) => !d.contatoId && !d.telefone)) {
      throw ErroPipe.requisicao(
        'destino_invalido',
        'Cada contato precisa de `contato_id` ou `telefone`.',
      );
    }

    const resultados = await dispararMensagemAtiva(canal, {
      tenantId: ator.tenantId,
      canalId: corpo.canal_id,
      templateId: corpo.template_id,
      destinos,
      ...(corpo.parametros ? { parametros: corpo.parametros } : {}),
      atendenteId: ator.viaSessao ? ator.usuarioId : null,
    });

    return {
      enviadas: resultados.filter((r) => r.enviada).length,
      recusadas: resultados.filter((r) => !r.enviada).length,
      data: resultados.map((r) => ({
        telefone: r.telefone,
        contato_id: r.contatoId,
        enviada: r.enviada,
        mensagem_id: r.mensagemId ?? null,
        conversa_id: r.conversaId ?? null,
        motivo: r.motivo ?? null,
        detalhe: r.detalhe ?? null,
      })),
    };
  }
}
