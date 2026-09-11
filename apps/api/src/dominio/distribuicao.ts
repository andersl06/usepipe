import { sql } from 'drizzle-orm';
import { escolherAtendente } from '@pipe/core';
import type { AtendenteDisponivel, EscolhaDistribuicao, EstadoAtendente } from '@pipe/core';
import type { TransacaoPipe } from '@pipe/db';
import { emitir } from '../webhooks-saida.js';
import { registrarEvento } from './eventos.js';

/**
 * Distribuição por carga real (§4.3 da spec, §7 da spec de métricas).
 *
 * A decisão vive em `@pipe/core` e **não** é reimplementada aqui: este arquivo só
 * levanta o estado dos atendentes da fila e entrega para `escolherAtendente`. Assim
 * o desempate por carga ponderada continua tendo uma implementação só, testada com
 * tabela de casos, e a `api` não vira um segundo lugar onde a regra mora.
 */

type LinhaAtendente = {
  id: string;
  estado: EstadoAtendente;
  limite: number;
  ativas: string;
  aguardando_atendente: string;
  sem_primeira_resposta: string;
  ultima_atribuicao_em: Date | string | null;
};

export async function candidatosDaFila(
  tx: TransacaoPipe,
  filaId: string,
): Promise<AtendenteDisponivel[]> {
  const { rows } = await tx.execute<LinhaAtendente>(sql`
    select u.id,
           coalesce(s.estado, 'offline') as estado,
           coalesce(fa.capacidade_override, f.capacidade_padrao) as limite,
           (select count(*) from conversa c
             where c.atendente_id = u.id and c.estado <> 'encerrada')::text as ativas,
           (select count(*) from conversa c
             where c.atendente_id = u.id and c.estado <> 'encerrada'
               and (c.ultima_mensagem_de is distinct from 'atendente'))::text
             as aguardando_atendente,
           (select count(*) from conversa c
             where c.atendente_id = u.id and c.estado <> 'encerrada'
               and c.primeira_resposta_em is null)::text as sem_primeira_resposta,
           (select max(c.atribuida_em) from conversa c
             where c.atendente_id = u.id) as ultima_atribuicao_em
      from fila_atendente fa
      join usuario u on u.id = fa.usuario_id and u.ativo
      join fila f on f.id = fa.fila_id
      left join status_atendente s on s.usuario_id = u.id
     where fa.fila_id = ${filaId}
  `);

  return rows.map((linha) => ({
    id: linha.id,
    estado: linha.estado,
    filas: [filaId],
    limiteSimultaneo: Number(linha.limite),
    ativas: Number(linha.ativas),
    aguardandoAtendente: Number(linha.aguardando_atendente),
    semPrimeiraResposta: Number(linha.sem_primeira_resposta),
    ultimaAtribuicaoEm:
      linha.ultima_atribuicao_em === null
        ? null
        : linha.ultima_atribuicao_em instanceof Date
          ? linha.ultima_atribuicao_em
          : new Date(linha.ultima_atribuicao_em),
  }));
}

/** Teto de conversas sem 1ª resposta, por tenant. Ausente desliga o segundo teto. */
function tetoSemPrimeiraResposta(): number | null {
  const bruto = process.env['PIPE_TETO_SEM_PRIMEIRA_RESPOSTA'];
  return bruto ? Number(bruto) : null;
}

export async function escolherParaFila(
  tx: TransacaoPipe,
  filaId: string,
): Promise<EscolhaDistribuicao> {
  const candidatos = await candidatosDaFila(tx, filaId);
  return escolherAtendente(candidatos, {
    filaId,
    tetoSemPrimeiraResposta: tetoSemPrimeiraResposta(),
  });
}

/**
 * Tira da fila e atribui ao atendente que a regra escolher, se houver um.
 *
 * Morava em `entrada.ts`; mudou para cá porque agora são dois a chamar — a entrada e o
 * bot, quando transfere.
 */
export async function distribuirConversa(
  tx: TransacaoPipe,
  tenantId: string,
  conversaId: string,
  filaId: string,
  em: Date,
): Promise<void> {
  const escolha = await escolherParaFila(tx, filaId);
  if (!escolha.escolhido) return;

  const atendenteId = escolha.escolhido.id;
  await tx.execute(sql`
    update conversa
       set atendente_id = ${atendenteId}, estado = 'atribuida', atribuida_em = ${em},
           atualizado_em = now()
     where id = ${conversaId} and estado = 'na_fila'
  `);
  await tx.execute(sql`
    insert into atribuicao (tenant_id, conversa_id, para_usuario_id, de_fila_id, motivo, em)
    values (${tenantId}, ${conversaId}, ${atendenteId}, ${filaId}, 'distribuicao_por_carga', ${em})
  `);
  await registrarEvento(tx, {
    tenantId,
    conversaId,
    tipo: 'atribuida',
    em,
    usuarioId: atendenteId,
    filaId,
  });
  await emitir(tx, tenantId, 'conversa.atribuida', {
    conversa_id: conversaId,
    atendente_id: atendenteId,
    fila_id: filaId,
  });
}
