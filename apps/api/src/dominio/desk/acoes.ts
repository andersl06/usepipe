import { and, eq, isNull, sql } from 'drizzle-orm';
import { notaInterna, pausa, statusAtendente } from '@pipe/db/schema';
import type { TransacaoPipe } from '@pipe/db';
import type { EstadoAtendente } from '@pipe/contracts';
import type { Campos, Resultado } from '../gestao/acoes/campos.js';
import { registrarEvento } from '../eventos.js';
import { transferirConversa } from '../conversa.js';

/** A transação já vem com o tenant fixado; `consultar` só nomeia o bloco, como no Desk. */
const consultar = <T>(tx: TransacaoPipe, fn: (tx: TransacaoPipe) => Promise<T>): Promise<T> =>
  fn(tx);

/**
 * As Server Actions do Desk que ESCREVIAM direto no banco, movidas de
 * `apps/desk/src/app/acoes.ts` com o corpo intacto: o status do atendente, a
 * queda por inatividade e a nota interna.
 *
 * As outras — enviar, reenviar, encerrar, espera — já iam para
 * `POST /v1/conversas/…` pelo `postNaApi` do Next, e agora vão direto do
 * navegador, com o cookie. Não há endpoint novo para elas: a regra, a
 * transição de estado e o registro do evento continuam morando num lugar só.
 *
 * O `tenantId` e o `atendenteId` vêm da SESSÃO (`sessaoDe` no controlador),
 * nunca do corpo: aceitar um `usuarioId` no corpo deixaria qualquer pessoa
 * logada mudar o status do colega.
 */

const OK: Resultado = { ok: true };

function falha(erro: string): Resultado {
  return { ok: false, erro };
}

// --- status do atendente ---

export async function definirStatus(
  tx: TransacaoPipe,
  tenantId: string,
  atendenteId: string,
  dados: Campos,
): Promise<Resultado> {
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

  await consultar(tx, async (tx) => {
    await tx
      .insert(statusAtendente)
      .values({ usuarioId: atendenteId, tenantId, estado, desde: new Date() })
      .onConflictDoUpdate({
        target: statusAtendente.usuarioId,
        set: { estado, desde: new Date() },
      });

    // Sai da pausa anterior antes de abrir outra: pausa aberta em duplicidade conta
    // o mesmo minuto duas vezes no relatório de ocupação.
    await tx
      .update(pausa)
      .set({ encerradaEm: new Date() })
      .where(and(eq(pausa.usuarioId, atendenteId), isNull(pausa.encerradaEm)));

    if (estado === 'pausa' && motivoId) {
      await tx.insert(pausa).values({ tenantId, usuarioId: atendenteId, motivoId });
    }
  });

  return OK;
}

/**
 * Queda por inatividade: vinte minutos sem nenhum gesto na tela e o atendente
 * sai da distribuição.
 *
 * É a mesma régua da tela de referência (dez minutos até o aviso, mais dez até
 * a queda), registrada em `docs/pesquisa/blip-desk-medidas.md`, §9. Quem conta
 * o tempo é o navegador, em `componentes/inatividade`; o que chega aqui é só
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
export async function cairPorInatividade(
  tx: TransacaoPipe,
  tenantId: string,
  atendenteId: string,
  _dados: Campos,
): Promise<Resultado> {
  await consultar(tx, async (tx) => {
    const agora = new Date();
    await tx
      .insert(statusAtendente)
      .values({ usuarioId: atendenteId, tenantId, estado: 'offline', desde: agora })
      .onConflictDoUpdate({
        target: statusAtendente.usuarioId,
        set: { estado: 'offline', desde: agora },
        where: sql`${statusAtendente.estado} <> 'offline'`,
      });

    await tx
      .update(pausa)
      .set({ encerradaEm: agora })
      .where(and(eq(pausa.usuarioId, atendenteId), isNull(pausa.encerradaEm)));
  });

  return OK;
}

// --- nota interna ---

/**
 * A nota interna — o ramo `modo === 'nota'` do `enviarMensagem` de antes.
 *
 * Nota não é mensagem, não sai para o cliente e não passa pela janela de 24h;
 * por isso ela nunca teve rota em `/v1/conversas` e é a única escrita do
 * compositor que continua vindo por aqui. O texto livre e o template vão para
 * `POST /v1/conversas/:id/mensagens`, direto do navegador.
 */
export async function salvarNotaInterna(
  tx: TransacaoPipe,
  tenantId: string,
  atendenteId: string,
  dados: Campos,
): Promise<Resultado> {
  const conversaId = String(dados.get('conversaId') ?? '');
  const texto = String(dados.get('texto') ?? '').trim();

  if (!conversaId) return falha('Conversa não informada.');
  if (!texto) return falha('Escreva alguma coisa antes de enviar.');

  await consultar(tx, async (tx) => {
    await tx
      .insert(notaInterna)
      .values({ tenantId, conversaId, usuarioId: atendenteId, corpo: texto });
  });

  return OK;
}

// --- atender (puxar o próximo da fila) ---

/**
 * O botão "Atender" da coluna — o `set /tickets/claim` da referência: o atendente
 * puxa para si a conversa mais antiga da fila, entre as filas em que ele está.
 *
 * É `assumirConversa` (`dominio/assumir.ts`) sem escolher o id: a mesma trava
 * (`where estado = 'na_fila'`, com `skip locked` para dois cliques ao mesmo tempo
 * não disputarem a mesma linha), a mesma `atribuicao` e o mesmo evento. Só atende
 * quem está Online — é a regra de lá, onde o botão nem aparece nos outros status.
 */
export async function atender(
  tx: TransacaoPipe,
  tenantId: string,
  atendenteId: string,
  _dados: Campos,
): Promise<Resultado & { conversaId?: string }> {
  return consultar(tx, async (tx) => {
    const { rows: status } = await tx.execute<{ estado: string }>(
      sql`select estado from status_atendente where usuario_id = ${atendenteId}::uuid limit 1`,
    );
    if (status[0]?.estado !== 'online') return falha('Fique online para atender.');

    const em = new Date();
    const { rows } = await tx.execute<{ id: string; fila_id: string | null }>(sql`
      update conversa
         set atendente_id = ${atendenteId}::uuid, estado = 'atribuida',
             atribuida_em = ${em}, atualizado_em = now()
       where id = (
         select c.id from conversa c
          where c.estado = 'na_fila'
            and (c.fila_id is null
                 or c.fila_id in (select fila_id from fila_atendente where usuario_id = ${atendenteId}::uuid))
          order by c.criada_em asc
          for update skip locked
          limit 1
       )
       returning id, fila_id
    `);
    const puxada = rows[0];
    if (!puxada) return falha('Não há clientes aguardando.');

    await tx.execute(sql`
      insert into atribuicao (tenant_id, conversa_id, para_usuario_id, de_fila_id, motivo, por_usuario_id, em)
      values (${tenantId}::uuid, ${puxada.id}::uuid, ${atendenteId}::uuid,
              ${puxada.fila_id}, 'assumida_pelo_atendente', ${atendenteId}::uuid, ${em})
    `);
    await registrarEvento(tx, {
      tenantId,
      conversaId: puxada.id,
      tipo: 'atribuida',
      em,
      usuarioId: atendenteId,
      filaId: puxada.fila_id,
    });
    return { ok: true, conversaId: puxada.id };
  });
}

// --- ações em massa ---

/**
 * A tela "Ações em Massa" da referência: transferir vários tickets de uma vez
 * para uma fila ou um atendente. É `transferirConversa` (`dominio/conversa.ts`)
 * repetido, em série, uma conversa por vez — cada uma com a sua transação, a
 * mesma regra (encerra e abre outra) e o mesmo evento. O resultado diz quantas
 * foram, e o primeiro motivo de recusa, se houve.
 */
export async function transferirEmMassa(
  _tx: TransacaoPipe,
  tenantId: string,
  atendenteId: string,
  dados: Campos,
): Promise<Resultado & { transferidas?: number }> {
  const ids = dados.getAll('conversaId').filter(Boolean);
  const paraFilaId = String(dados.get('paraFilaId') ?? '') || null;
  const paraAtendenteId = String(dados.get('paraAtendenteId') ?? '') || null;
  if (ids.length === 0) return falha('Selecione ao menos um atendimento.');
  if (!paraFilaId && !paraAtendenteId) return falha('Escolha a fila ou o atendente de destino.');

  let transferidas = 0;
  let primeiroErro: string | null = null;
  for (const conversaId of ids) {
    try {
      await transferirConversa(
        { tenantId, atendenteId, exigirAtribuicao: true },
        { conversaId, paraFilaId, paraAtendenteId, motivo: 'Transferência em massa' },
      );
      transferidas += 1;
    } catch (erro) {
      primeiroErro ??= erro instanceof Error ? erro.message : 'Falha ao transferir.';
    }
  }
  if (transferidas === 0) return falha(primeiroErro ?? 'Nenhum atendimento foi transferido.');
  return { ok: true, transferidas, ...(primeiroErro ? { erro: primeiroErro } : {}) };
}
