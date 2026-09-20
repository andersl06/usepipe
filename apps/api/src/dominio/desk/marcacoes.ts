import { sql } from 'drizzle-orm';
import type { TransacaoPipe } from '@pipe/db';
import type { Campos, Resultado } from '../gestao/acoes/campos.js';

/**
 * Fixar e marcar como não lida — o menu "⋮" do cartão do Desk, que até aqui só
 * fazia `stopPropagation()`.
 *
 * É o `TicketMenuOptions` da origem (`blip-desk-regras-tecnicas.md` §1.8:
 * `PIN`/`UNPIN`, `UNREAD`/`READ`) com a regra de
 * `blip-desk-funcoes.md` §3: "o próprio atendente pode fixar manualmente até 50
 * tickets no topo da sua lista, e também marcar/desmarcar qualquer ticket como
 * 'não lido'". As duas são POR ATENDENTE — a conversa transferida chega limpa no
 * colega — e por isso moram em `marcacao_conversa` (migração 0041), nunca em
 * coluna de `conversa`.
 *
 * A marcação é do atendente da SESSÃO sobre uma conversa que é dele e está
 * aberta; `usuarioId` nunca vem do corpo, como nas outras ações de `acoes.ts`.
 * A linha some quando os dois carimbos ficam nulos: a tabela guarda marcação,
 * não ausência dela.
 */

/** O teto da origem: 50 tickets fixados por atendente. */
export const MAX_FIXADAS = 50;

const OK: Resultado = { ok: true };

function falha(erro: string): Resultado {
  return { ok: false, erro };
}

function comoBooleano(valor: unknown): boolean | null {
  const texto = String(valor ?? '').trim().toLowerCase();
  // `on` é como o FormData manda a caixa marcada (ver `campos.ts`).
  if (texto === 'true' || texto === '1' || texto === 'sim' || texto === 'on') return true;
  if (texto === 'false' || texto === '0' || texto === 'nao' || texto === 'não') return false;
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A conversa existe, está aberta e é do atendente — senão, o motivo. */
async function conferirConversa(
  tx: TransacaoPipe,
  atendenteId: string,
  conversaId: string,
): Promise<string | null> {
  if (!UUID.test(conversaId)) return 'Conversa não informada.';
  const { rows } = await tx.execute<{ estado: string; atendente_id: string | null }>(
    sql`select estado, atendente_id from conversa where id = ${conversaId}::uuid limit 1`,
  );
  const conversa = rows[0];
  if (!conversa) return 'Conversa não encontrada.';
  if (conversa.estado === 'encerrada') return 'A conversa já foi encerrada.';
  if (conversa.atendente_id !== atendenteId) return 'Esta conversa não está com você.';
  return null;
}

/**
 * Tira UMA marca: apaga a linha quando ela ia ficar vazia, e só então zera a
 * outra. O `CHECK` (`marcacao_conversa_alguma_ck`) é conferido no próprio
 * `update`, então zerar primeiro e limpar depois estoura antes de chegar na
 * limpeza — era o que acontecia ao desafixar uma conversa sem outra marca.
 */
async function tirarMarca(
  tx: TransacaoPipe,
  atendenteId: string,
  conversaId: string,
  marca: 'fixada_em' | 'nao_lida_em',
) {
  const outra = marca === 'fixada_em' ? sql`nao_lida_em` : sql`fixada_em`;
  const onde = sql`usuario_id = ${atendenteId}::uuid and conversa_id = ${conversaId}::uuid`;
  await tx.execute(sql`delete from marcacao_conversa where ${onde} and ${outra} is null`);
  await tx.execute(
    sql`update marcacao_conversa set ${sql.raw(marca)} = null where ${onde}`,
  );
}

/**
 * `fixar` — campos `conversaId` e `fixada` (`true`/`false`). Fixar de novo é
 * no-op (mantém o `fixada_em` original, para a ordem no topo não pular);
 * desafixar o que não estava fixado também é no-op.
 */
export async function fixar(
  tx: TransacaoPipe,
  tenantId: string,
  atendenteId: string,
  dados: Campos,
): Promise<Resultado & { fixada?: boolean }> {
  const conversaId = String(dados.get('conversaId') ?? '');
  const fixada = comoBooleano(dados.get('fixada'));
  if (fixada === null) return falha('Informe se a conversa deve ficar fixada.');

  const motivo = await conferirConversa(tx, atendenteId, conversaId);
  if (motivo) return falha(motivo);

  if (fixada) {
    // O teto conta as OUTRAS fixadas: refixar a mesma não pode bater no limite.
    const { rows } = await tx.execute<{ n: string }>(sql`
      select count(*)::text as n from marcacao_conversa
       where usuario_id = ${atendenteId}::uuid and fixada_em is not null
         and conversa_id <> ${conversaId}::uuid
    `);
    if (Number(rows[0]?.n ?? 0) >= MAX_FIXADAS) {
      return falha(
        `Você já tem ${MAX_FIXADAS} conversas fixadas. Desafixe uma para fixar outra.`,
      );
    }
    await tx.execute(sql`
      insert into marcacao_conversa (tenant_id, usuario_id, conversa_id, fixada_em)
      values (${tenantId}::uuid, ${atendenteId}::uuid, ${conversaId}::uuid, now())
      on conflict (usuario_id, conversa_id)
        do update set fixada_em = coalesce(marcacao_conversa.fixada_em, excluded.fixada_em)
    `);
  } else {
    await tirarMarca(tx, atendenteId, conversaId, 'fixada_em');
  }
  return { ...OK, fixada };
}

/**
 * `marcarNaoLida` — campos `conversaId` e `naoLida` (`true`/`false`). "Lida" é o
 * que abrir a conversa faz sozinho na tela (a ficha "Não lidas" da origem
 * "remove o ticket automaticamente assim que ele é aberto"); "não lida" é o
 * lembrete manual para voltar depois.
 */
export async function marcarNaoLida(
  tx: TransacaoPipe,
  tenantId: string,
  atendenteId: string,
  dados: Campos,
): Promise<Resultado & { naoLida?: boolean }> {
  const conversaId = String(dados.get('conversaId') ?? '');
  const naoLida = comoBooleano(dados.get('naoLida'));
  if (naoLida === null) return falha('Informe se a conversa deve ficar como não lida.');

  const motivo = await conferirConversa(tx, atendenteId, conversaId);
  if (motivo) return falha(motivo);

  if (naoLida) {
    await tx.execute(sql`
      insert into marcacao_conversa (tenant_id, usuario_id, conversa_id, nao_lida_em)
      values (${tenantId}::uuid, ${atendenteId}::uuid, ${conversaId}::uuid, now())
      on conflict (usuario_id, conversa_id)
        do update set nao_lida_em = coalesce(marcacao_conversa.nao_lida_em, excluded.nao_lida_em)
    `);
  } else {
    await tirarMarca(tx, atendenteId, conversaId, 'nao_lida_em');
  }
  return { ...OK, naoLida };
}
