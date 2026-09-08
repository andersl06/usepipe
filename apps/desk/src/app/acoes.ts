'use server';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { schema } from '@pipe/db';
import { cookieDeSessao, noTenant, sessaoAtual } from '../servidor/banco';
import { postNaApi } from '../lib/api-desk';
import { renderizarTemplate } from '../lib/template';
import type { EstadoAtendente } from '../servidor/consultas';

/**
 * Server Actions do Desk.
 *
 * **Quem ESCREVE conversa e mensagem é a `api`**, não esta tela. O envio, o
 * encerramento e a espera vão por `POST /v1/conversas/…` levando o cookie de
 * sessão: a regra, a transição de estado e o registro do evento moram de um
 * lado só, e é o lado que também fala com a Meta.
 *
 * O que continua sendo escrito daqui é o que não tem rota e não sai para o
 * cliente: o status do atendente, a nota interna e o reenvio.
 *
 * Leitura continua vindo do banco pelo `noTenant`, com a RLS valendo — é dívida
 * conhecida do README, e ela paga junto com a migração para o Vite.
 */

export interface Resultado {
  ok: boolean;
  erro?: string;
}

const OK: Resultado = { ok: true };

function falha(erro: string): Resultado {
  return { ok: false, erro };
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

/**
 * Queda por inatividade: vinte minutos sem nenhum gesto na tela e o atendente
 * sai da distribuição.
 *
 * É a mesma régua da tela de referência (dez minutos até o aviso, mais dez até
 * a queda), registrada em `docs/pesquisa/blip-desk-medidas.md`, §9. Quem conta
 * o tempo é o navegador, em `../componentes/inatividade`; o que chega aqui é só
 * o veredito.
 *
 * A ação é **idempotente e estreita de propósito**: ela só derruba, nunca
 * levanta, e não faz nada se o atendente já está Offline. Sem isso, uma aba
 * esquecida aberta num segundo monitor derrubaria o atendente que está
 * trabalhando na primeira — e a queda por inatividade viraria a causa mais
 * comum de conversa parada, que é justamente o que ela existe para evitar.
 *
 * A pausa aberta é encerrada junto, pelo mesmo motivo de `definirStatus`: pausa
 * sem fim conta o mesmo minuto para sempre no relatório de ocupação.
 */
export async function cairPorInatividade(): Promise<Resultado> {
  const { atendenteId, tenantId } = await sessaoAtual();

  await noTenant(async (tx) => {
    const agora = new Date();
    await tx
      .insert(schema.statusAtendente)
      .values({ usuarioId: atendenteId, tenantId, estado: 'offline', desde: agora })
      .onConflictDoUpdate({
        target: schema.statusAtendente.usuarioId,
        set: { estado: 'offline', desde: agora },
        where: sql`${schema.statusAtendente.estado} <> 'offline'`,
      });

    await tx
      .update(schema.pausa)
      .set({ encerradaEm: agora })
      .where(and(eq(schema.pausa.usuarioId, atendenteId), isNull(schema.pausa.encerradaEm)));
  });

  revalidatePath('/');
  return OK;
}

// --- envio ---

/**
 * Enviar. **Quem grava é a `api`, não esta tela.**
 *
 * Antes daqui saía um `insert` direto em `mensagem` com `estado_entrega = 'enviada'`,
 * e nada saía para a Meta. O atendente via o tique de enviada numa mensagem que
 * o cliente nunca recebeu, que é a pior coisa que uma tela de atendimento pode
 * fazer. Agora o envio vai para `POST /v1/conversas/:id/mensagens`, que põe a
 * linha no outbox e devolve **`pendente`**; o tique aparece quando a Meta
 * confirmar.
 *
 * O que NÃO vai no corpo: `atendente_id`. Com sessão, o autor é o dono do
 * cookie e um `atendente_id` no corpo é ignorado do lado de lá — aceitá-lo
 * deixaria qualquer pessoa logada mandar mensagem com o nome do colega na tela
 * do cliente.
 *
 * Template também não vai renderizado: vão `template_id` e `parametros` na
 * ordem das posições, e quem monta o corpo é a `api`. Ela é quem fala com a
 * Meta, e o texto que o cliente recebe tem de nascer de um lugar só.
 *
 * Nota interna continua sendo escrita aqui, e é a única que continua: nota não
 * é mensagem, não sai para o cliente e não tem rota na `api`.
 */
export async function enviarMensagem(_anterior: Resultado, dados: FormData): Promise<Resultado> {
  const conversaId = String(dados.get('conversaId') ?? '');
  const texto = String(dados.get('texto') ?? '').trim();
  const modo = String(dados.get('modo') ?? 'resposta');
  const respostaProntaId = String(dados.get('respostaProntaId') ?? '') || null;
  const templateId = String(dados.get('templateId') ?? '') || null;

  if (!conversaId) return falha('Conversa não informada.');
  if (!texto && !templateId) return falha('Escreva alguma coisa antes de enviar.');

  const {
    atendenteId,
    tenantId,
    nome: nomeDoAtendente,
    email: emailDoAtendente,
  } = await sessaoAtual();

  // Nota interna não passa pela api nem pela janela: ela nunca sai daqui.
  if (modo === 'nota') {
    await noTenant(async (tx) => {
      await tx
        .insert(schema.notaInterna)
        .values({ tenantId, conversaId, usuarioId: atendenteId, corpo: texto });
    });
    revalidatePath('/');
    return OK;
  }

  /**
   * Os valores das posições do template. A leitura continua sendo daqui porque
   * é a tela que sabe o que ela consegue preencher — e é ela que precisa dizer,
   * em português, o que está faltando. Mandar `{{2}}` para o cliente é pior do
   * que recusar o envio.
   */
  let parametros: string[] | null = null;
  if (templateId) {
    const preparo = await noTenant(async (tx) => {
      const { rows } = await tx.execute<{
        corpo: string;
        variaveis: unknown;
        contato_nome: string | null;
        contato_email: string | null;
        contato_telefone: string | null;
      }>(sql`
        select t.corpo, t.variaveis, ct.nome as contato_nome, ct.email as contato_email,
               ct.telefone_e164 as contato_telefone
          from template_mensagem t
          join conversa c on c.id = ${conversaId}
          join contato ct on ct.id = c.contato_id
         where t.id = ${templateId} and t.status_meta = 'aprovado'
         limit 1
      `);
      return rows[0] ?? null;
    });
    if (!preparo) return falha('Template não encontrado ou não aprovado pela Meta.');

    const rendido = renderizarTemplate(preparo.corpo, preparo.variaveis, {
      'contato.nome': preparo.contato_nome ?? '',
      'contato.email': preparo.contato_email ?? '',
      'contato.telefone': preparo.contato_telefone ?? '',
      'atendente.nome': nomeDoAtendente,
      'atendente.primeiro_nome': nomeDoAtendente.split(' ')[0] ?? nomeDoAtendente,
      'atendente.email': emailDoAtendente,
    });
    if (rendido.faltando.length > 0) {
      return falha(
        `Este template pede ${rendido.faltando.join(', ')}, e o Desk ainda não tem campo para preencher. Dispare-o pelo Pipe Gestão.`,
      );
    }
    parametros = rendido.valores;
  }

  const resposta = await postNaApi(
    `/v1/conversas/${encodeURIComponent(conversaId)}/mensagens`,
    await cookieDeSessao(),
    {
      tipo: templateId ? 'template' : 'texto',
      ...(templateId ? { template_id: templateId } : { texto }),
      ...(parametros && parametros.length > 0 ? { parametros } : {}),
    },
  );
  if (!resposta.ok) return falha(resposta.erro.mensagem);

  /*
   * A resposta pronta não vai no corpo do envio: a api não a conhece, e ela não
   * muda o que o cliente recebe. O que ela muda é o relatório de esforço, que
   * precisa saber que aquele texto não foi digitado. Carimbar depois é o caminho
   * mais barato enquanto a rota não tem o campo.
   *
   * ponytail: se a marcação falhar, a mensagem já saiu e o relatório perde uma
   * marca — que é o lado certo de errar. Quando a rota aceitar o campo, esta
   * segunda ida ao banco some.
   */
  if (respostaProntaId && resposta.dados && typeof resposta.dados === 'object') {
    const enviada = resposta.dados as { id?: string };
    if (enviada.id) {
      const marca = enviada.id;
      await noTenant(async (tx) => {
        await tx.execute(
          sql`update mensagem set resposta_pronta_id = ${respostaProntaId} where id = ${marca}`,
        );
      });
    }
  }

  revalidatePath('/');
  return OK;
}

/**
 * Reenvio da mensagem que falhou: devolve o estado para `pendente` e limpa o
 * erro, que é o que a máquina de entrega do core prevê (`falhou → pendente`).
 *
 * Era `enviada`, e virou mentira no instante em que o envio passou pela `api`:
 * o botão dizia que a mensagem tinha saído sem nada ter saído. Com `pendente`,
 * a linha volta a ser candidata do outbox e o tique só aparece quando a Meta
 * confirmar.
 *
 * ponytail: escrita direta porque a `api` ainda não tem rota de reenvio.
 * Quando tiver, esta função vira mais uma chamada como as outras três.
 */
export async function reenviarMensagem(_anterior: Resultado, dados: FormData): Promise<Resultado> {
  const mensagemId = String(dados.get('mensagemId') ?? '');
  if (!mensagemId) return falha('Mensagem não informada.');

  const afetadas = await noTenant(async (tx) => {
    // `entregue_em` NÃO é carimbado aqui. Ele é a hora que a Meta confirmou, e
    // preenchê-lo sem confirmação nenhuma é inventar prova de entrega — de novo
    // o defeito nº 1 da tela, agora do nosso lado.
    const { rowCount } = await tx.execute(sql`
      update mensagem
         set estado_entrega = 'pendente', erro_codigo = null, erro_texto = null
       where id = ${mensagemId} and estado_entrega = 'falhou'
    `);
    return rowCount ?? 0;
  });

  // Sem linha afetada, a mensagem não existe ou já não estava falha. Devolver
  // `ok` calado fazia o botão parecer que resolveu.
  if (afetadas === 0) return falha('Esta mensagem não está mais em falha.');

  revalidatePath('/');
  return OK;
}

// --- ações sobre a conversa ---

/**
 * Encerrar. A regra, a transição de estado e o registro do evento são da `api` —
 * aqui ficou só o que a tela sabe: qual conversa e qual etiqueta.
 *
 * A etiqueta continua obrigatória, e continua conferida dos DOIS lados: a
 * checagem daqui poupa uma ida à rede, e a de lá é a que vale.
 */
export async function encerrarConversa(_anterior: Resultado, dados: FormData): Promise<Resultado> {
  const conversaId = String(dados.get('conversaId') ?? '');
  const etiquetaId = String(dados.get('etiquetaId') ?? '');
  if (!conversaId) return falha('Conversa não informada.');
  if (!etiquetaId) return falha('Escolha a etiqueta de encerramento.');

  const resposta = await postNaApi(
    `/v1/conversas/${encodeURIComponent(conversaId)}/encerrar`,
    await cookieDeSessao(),
    { etiqueta_id: etiquetaId },
  );
  if (!resposta.ok) return falha(resposta.erro.mensagem);

  revalidatePath('/');
  return OK;
}

/**
 * Modo de espera: pausa a conversa sem que a inatividade do cliente conte.
 *
 * A mesma rota nos dois sentidos, como o botão. **Quem decide o sentido é a
 * `api`**, e quem soma o intervalo em espera também — o cálculo que morava
 * aqui saiu. Dois lugares calculando o mesmo segundo é como o relatório de
 * ocupação passa a discordar de si mesmo.
 */
export async function alternarEspera(_anterior: Resultado, dados: FormData): Promise<Resultado> {
  const conversaId = String(dados.get('conversaId') ?? '');
  if (!conversaId) return falha('Conversa não informada.');

  const resposta = await postNaApi(
    `/v1/conversas/${encodeURIComponent(conversaId)}/espera`,
    await cookieDeSessao(),
  );
  if (!resposta.ok) return falha(resposta.erro.mensagem);

  revalidatePath('/');
  return OK;
}
