'use server';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { schema } from '@pipe/db';
import { avaliarEnvio, classificarCusto, transitar, TransicaoInvalidaError } from '@pipe/core';
import type { CategoriaTemplate, TipoCanal } from '@pipe/core';
import { noTenant, sessaoAtual } from '../servidor/banco';
import { data, dataOuNulo } from '../servidor/consultas';
import type { EstadoAtendente } from '../servidor/consultas';

/**
 * Server Actions do Desk. Nesta etapa não há API separada: a tela fala com o banco
 * pelo `comTenant`, e o envio ao WhatsApp fica **simulado** — a mensagem é gravada
 * com `estado_entrega = 'enviada'` e nada sai para a Meta.
 *
 * O ponto de extensão é único e está marcado em `enviarMensagem`: no lugar do
 * `estado_entrega` fixo entra uma linha em `outbox_mensagem`, que o worker consome.
 */

export interface Resultado {
  ok: boolean;
  erro?: string;
}

const OK: Resultado = { ok: true };

function falha(erro: string): Resultado {
  return { ok: false, erro };
}

/**
 * `@pipe/core` só conhece canal com janela e canal sem janela. Instagram, e-mail e
 * widget caem todos no segundo grupo; se um dia o Instagram ganhar janela própria, a
 * mudança é aqui e no core, não espalhada pela tela.
 */
function canalDoCore(tipo: string): TipoCanal {
  return tipo === 'whatsapp_cloud' ? 'whatsapp_cloud' : 'widget';
}

// --- status do atendente ---

export async function definirStatus(_anterior: Resultado, dados: FormData): Promise<Resultado> {
  const estado = String(dados.get('estado') ?? '') as EstadoAtendente;
  const motivoId = String(dados.get('motivoId') ?? '') || null;

  if (!['online', 'pausa', 'invisivel', 'offline'].includes(estado)) {
    return falha('Estado desconhecido.');
  }
  // Pausa exige motivo, escolhido da lista que o gestor cadastra. Sem motivo, o tempo
  // de pausa não alimenta relatório nenhum — e é exatamente por isso que é obrigatório.
  if (estado === 'pausa' && !motivoId) {
    return falha('Escolha o motivo da pausa.');
  }

  const { atendenteId, tenantId } = await sessaoAtual();
  await noTenant(async (tx) => {
    await tx
      .insert(schema.statusAtendente)
      .values({ usuarioId: atendenteId, tenantId, estado, desde: new Date() })
      .onConflictDoUpdate({
        target: schema.statusAtendente.usuarioId,
        set: { estado, desde: new Date() },
      });

    // Sai da pausa anterior antes de abrir outra: pausa aberta em duplicidade conta
    // o mesmo minuto duas vezes no relatório de ocupação.
    await tx
      .update(schema.pausa)
      .set({ encerradaEm: new Date() })
      .where(and(eq(schema.pausa.usuarioId, atendenteId), isNull(schema.pausa.encerradaEm)));

    if (estado === 'pausa' && motivoId) {
      await tx.insert(schema.pausa).values({ tenantId, usuarioId: atendenteId, motivoId });
    }
  });

  revalidatePath('/');
  return OK;
}

// --- envio ---

export async function enviarMensagem(_anterior: Resultado, dados: FormData): Promise<Resultado> {
  const conversaId = String(dados.get('conversaId') ?? '');
  const texto = String(dados.get('texto') ?? '').trim();
  const modo = String(dados.get('modo') ?? 'resposta');
  const respostaProntaId = String(dados.get('respostaProntaId') ?? '') || null;
  const templateId = String(dados.get('templateId') ?? '') || null;

  if (!conversaId) return falha('Conversa não informada.');
  if (!texto && !templateId) return falha('Escreva alguma coisa antes de enviar.');

  const { atendenteId, tenantId } = await sessaoAtual();
  const agora = new Date();

  return noTenant(async (tx) => {
    const { rows } = await tx.execute<{
      estado: string;
      janela_expira_em: Date | string | null;
      canal_tipo: string;
      primeira_resposta_em: Date | string | null;
    }>(sql`
      select c.estado, c.janela_expira_em, ca.tipo as canal_tipo, c.primeira_resposta_em
        from conversa c
        join inbox ib on ib.id = c.inbox_id
        join canal ca on ca.id = ib.canal_id
       where c.id = ${conversaId} and c.atendente_id = ${atendenteId}
       limit 1
    `);
    const conversa = rows[0];
    if (!conversa) return falha('Conversa não encontrada para este atendente.');

    // Nota interna não passa pela janela: ela nunca sai para o cliente.
    if (modo === 'nota') {
      await tx
        .insert(schema.notaInterna)
        .values({ tenantId, conversaId, usuarioId: atendenteId, corpo: texto });
      revalidatePath('/');
      return OK;
    }

    let categoriaTemplate: CategoriaTemplate | null = null;
    let corpo = texto;
    if (templateId) {
      const { rows: linhas } = await tx.execute<{ categoria: CategoriaTemplate; corpo: string }>(
        sql`select categoria, corpo from template_mensagem
             where id = ${templateId} and status_meta = 'aprovado' limit 1`,
      );
      const template = linhas[0];
      if (!template) return falha('Template não encontrado ou não aprovado pela Meta.');
      categoriaTemplate = template.categoria;
      corpo = template.corpo;
    }

    const avaliacao = avaliarEnvio({
      canal: canalDoCore(conversa.canal_tipo),
      expiraEm: dataOuNulo(conversa.janela_expira_em),
      agora,
      conteudo: templateId ? 'template' : 'texto_livre',
      categoriaTemplate,
    });
    if (!avaliacao.permitido) {
      return falha(
        avaliacao.motivo === 'janela_fechada'
          ? 'A janela de 24 horas fechou: só sai template aprovado pela Meta.'
          : 'Template sem categoria de cobrança.',
      );
    }

    await tx.insert(schema.mensagem).values({
      tenantId,
      conversaId,
      direcao: 'saida',
      autorTipo: 'atendente',
      autorId: atendenteId,
      tipo: templateId ? 'template' : 'texto',
      conteudo: corpo,
      respostaProntaId,
      templateId,
      // Ponto de extensão da entrega real: aqui entra a linha em `outbox_mensagem` e o
      // estado nasce `pendente`. Enquanto o worker não existe, a mensagem já sai enviada.
      estadoEntrega: 'enviada',
      criadaEm: agora,
      dentroDaJanela: avaliacao.dentroDaJanela,
      categoriaCobranca: classificarCusto({
        conteudo: templateId ? 'template' : 'texto_livre',
        dentroDaJanela: avaliacao.dentroDaJanela,
        categoriaTemplate,
      }),
    });

    // Responder tira a conversa de `atribuida` e de `em_espera` — as duas transições
    // que a máquina de estados permite para `em_atendimento`.
    const estadoNovo =
      conversa.estado === 'atribuida' || conversa.estado === 'em_espera'
        ? 'em_atendimento'
        : conversa.estado;
    await tx
      .update(schema.conversa)
      .set({
        estado: estadoNovo,
        emEsperaDesde: null,
        ultimaMensagemEm: agora,
        ultimaMensagemDe: 'atendente',
        primeiraRespostaEm: dataOuNulo(conversa.primeira_resposta_em) ?? agora,
        atualizadoEm: agora,
      })
      .where(eq(schema.conversa.id, conversaId));

    revalidatePath('/');
    return OK;
  });
}

/**
 * Reenvio da mensagem que falhou. **Simulado**: devolve o estado para `enviada` e
 * limpa o erro. Com o worker no ar, isto vira uma volta para `pendente` no outbox,
 * que é o que a máquina de entrega do core já prevê (`falhou → pendente`).
 */
export async function reenviarMensagem(_anterior: Resultado, dados: FormData): Promise<Resultado> {
  const mensagemId = String(dados.get('mensagemId') ?? '');
  if (!mensagemId) return falha('Mensagem não informada.');

  await noTenant(async (tx) => {
    await tx.execute(sql`
      update mensagem
         set estado_entrega = 'enviada', erro_codigo = null, erro_texto = null,
             entregue_em = now()
       where id = ${mensagemId} and estado_entrega = 'falhou'
    `);
  });

  revalidatePath('/');
  return OK;
}

// --- ações sobre a conversa ---

export async function encerrarConversa(_anterior: Resultado, dados: FormData): Promise<Resultado> {
  const conversaId = String(dados.get('conversaId') ?? '');
  const etiquetaId = String(dados.get('etiquetaId') ?? '');
  if (!conversaId) return falha('Conversa não informada.');
  // Etiqueta de encerramento é obrigatória: conversa fechada sem motivo é relatório
  // que não explica nada depois.
  if (!etiquetaId) return falha('Escolha a etiqueta de encerramento.');

  const { atendenteId, tenantId } = await sessaoAtual();
  const agora = new Date();

  return noTenant(async (tx) => {
    const { rows } = await tx.execute<{ estado: string }>(
      sql`select estado from conversa where id = ${conversaId} and atendente_id = ${atendenteId} limit 1`,
    );
    const atual = rows[0];
    if (!atual) return falha('Conversa não encontrada para este atendente.');

    const { rows: etiquetas } = await tx.execute<{ nome: string }>(
      sql`select nome from etiqueta where id = ${etiquetaId} limit 1`,
    );
    const etiqueta = etiquetas[0];
    if (!etiqueta) return falha('Etiqueta não encontrada.');

    try {
      transitar(atual.estado as never, 'encerrada');
    } catch (erro) {
      if (erro instanceof TransicaoInvalidaError) return falha(erro.message);
      throw erro;
    }

    await tx
      .insert(schema.conversaEtiqueta)
      .values({ tenantId, conversaId, etiquetaId, porUsuarioId: atendenteId })
      .onConflictDoNothing();

    await tx
      .update(schema.conversa)
      .set({
        estado: 'encerrada',
        encerradaEm: agora,
        encerradaPor: atendenteId,
        motivoEncerramento: etiqueta.nome,
        emEsperaDesde: null,
        atualizadoEm: agora,
      })
      .where(eq(schema.conversa.id, conversaId));

    revalidatePath('/');
    return OK;
  });
}

/** Modo de espera: pausa a conversa sem que a inatividade do cliente conte. */
export async function alternarEspera(_anterior: Resultado, dados: FormData): Promise<Resultado> {
  const conversaId = String(dados.get('conversaId') ?? '');
  if (!conversaId) return falha('Conversa não informada.');

  const { atendenteId } = await sessaoAtual();
  const agora = new Date();

  return noTenant(async (tx) => {
    const { rows } = await tx.execute<{ estado: string; em_espera_desde: Date | string | null }>(
      sql`select estado, em_espera_desde from conversa
           where id = ${conversaId} and atendente_id = ${atendenteId} limit 1`,
    );
    const atual = rows[0];
    if (!atual) return falha('Conversa não encontrada para este atendente.');

    const destino = atual.estado === 'em_espera' ? 'em_atendimento' : 'em_espera';
    try {
      transitar(atual.estado as never, destino);
    } catch (erro) {
      if (erro instanceof TransicaoInvalidaError) return falha(erro.message);
      throw erro;
    }

    if (destino === 'em_espera') {
      await tx
        .update(schema.conversa)
        .set({ estado: destino, emEsperaDesde: agora, atualizadoEm: agora })
        .where(eq(schema.conversa.id, conversaId));
    } else {
      // O intervalo em espera vira coluna própria no relatório: some do SLA, não do número.
      const pausadoSeg = atual.em_espera_desde
        ? Math.round((agora.getTime() - data(atual.em_espera_desde).getTime()) / 1000)
        : 0;
      await tx
        .update(schema.conversa)
        .set({
          estado: destino,
          emEsperaDesde: null,
          pausadoSeg: sql`${schema.conversa.pausadoSeg} + ${pausadoSeg}`,
          atualizadoEm: agora,
        })
        .where(eq(schema.conversa.id, conversaId));
    }

    revalidatePath('/');
    return OK;
  });
}
