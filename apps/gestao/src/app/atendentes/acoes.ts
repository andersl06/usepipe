'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { fila, horarioAtendimento, motivoPausa } from '@pipe/db/schema';
import { consultar, tenantId } from '../../lib/banco';
import { corValida } from './filas/cores';

/**
 * Server Actions de Atendentes — filas e motivos de pausa.
 *
 * Mesmo formato `Resultado` de `app/comunicacao/acoes.ts`: o erro esperado de
 * formulário volta como valor, não como exceção, para o `useActionState` da
 * tela mostrar a mensagem sem try/catch.
 *
 * Cada ação faz UMA transação, com o `select` de conflito antes do `insert` e
 * as consultas em série — `Promise.all` dentro do `comTenant` derruba o
 * `set_config('pipe.tenant_id')` e a RLS deixa de filtrar em silêncio.
 */

export interface Resultado {
  ok: boolean;
  erro?: string;
}

const OK: Resultado = { ok: true };

function falha(erro: string): Resultado {
  return { ok: false, erro };
}

/** Inteiro dentro de uma faixa, ou `null` quando o campo veio vazio ou torto. */
function inteiro(bruto: FormDataEntryValue | null, min: number, max: number): number | null {
  const texto = String(bruto ?? '').trim();
  if (!texto) return null;
  const n = Number(texto);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function marcado(dados: FormData, campo: string): boolean {
  return dados.get(campo) !== null;
}

// -------------------------------------------------------------------- filas

export async function salvarFila(_anterior: Resultado, dados: FormData): Promise<Resultado> {
  const nome = String(dados.get('nome') ?? '').trim();
  const cor = String(dados.get('cor') ?? '').trim();
  const horarioId = String(dados.get('horarioId') ?? '').trim();
  // Teto de 200 não é gosto: acima disso o campo deixou de ser capacidade e
  // virou "sem limite", e sem limite a distribuição por carga não decide nada.
  const capacidadePadrao = inteiro(dados.get('capacidadePadrao'), 1, 200);
  const ordem = inteiro(dados.get('ordem'), 0, 999);

  if (!nome) return falha('Informe o nome da fila.');
  if (cor && !corValida(cor)) return falha('Cor fora da paleta.');
  if (capacidadePadrao === null) {
    return falha(
      'A capacidade padrão é um inteiro de 1 a 200 — é quantas conversas simultâneas cada atendente da fila aguenta.',
    );
  }
  if (ordem === null) return falha('A ordem é um inteiro de 0 a 999.');

  const tid = await tenantId();

  return consultar(async (tx) => {
    // `fila_tenant_nome_uk` é único de verdade. O `select` existe mesmo assim
    // porque erro de constraint vira 500 sem contexto, e quem cadastra precisa
    // saber que o nome já está em uso.
    const [conflito] = await tx
      .select({ id: fila.id })
      .from(fila)
      .where(and(eq(fila.tenantId, tid), eq(fila.nome, nome)))
      .limit(1);
    if (conflito) return falha(`Já existe uma fila chamada "${nome}".`);

    if (horarioId) {
      const [horario] = await tx
        .select({ id: horarioAtendimento.id })
        .from(horarioAtendimento)
        .where(and(eq(horarioAtendimento.tenantId, tid), eq(horarioAtendimento.id, horarioId)))
        .limit(1);
      if (!horario) return falha('Horário de atendimento não encontrado.');
    }

    await tx.insert(fila).values({
      tenantId: tid,
      nome,
      cor: cor || null,
      horarioId: horarioId || null,
      capacidadePadrao,
      ordem,
      ativa: marcado(dados, 'ativa'),
    });

    revalidatePath('/atendentes/filas');
    revalidatePath('/regras/horarios');
    return OK;
  });
}

// ------------------------------------------------------------------- pausas

export async function salvarMotivoPausa(_anterior: Resultado, dados: FormData): Promise<Resultado> {
  const nome = String(dados.get('nome') ?? '').trim();
  // 480 minutos = uma jornada. Pausa sugerida maior que o expediente é erro de
  // digitação, não configuração.
  const duracaoSugeridaMin = inteiro(dados.get('duracaoSugeridaMin'), 1, 480);
  const duracaoInformada = String(dados.get('duracaoSugeridaMin') ?? '').trim();

  if (!nome) return falha('Informe o nome do motivo.');
  if (duracaoInformada && duracaoSugeridaMin === null) {
    return falha('A duração sugerida é um inteiro de 1 a 480 minutos.');
  }

  const tid = await tenantId();

  return consultar(async (tx) => {
    // `motivo_pausa` não tem índice único de nome — a unicidade é regra desta
    // tela. Sem ela, dois "Almoço" partem o relatório de uso em duas linhas que
    // deveriam ser uma.
    const [conflito] = await tx
      .select({ id: motivoPausa.id })
      .from(motivoPausa)
      .where(and(eq(motivoPausa.tenantId, tid), eq(motivoPausa.nome, nome)))
      .limit(1);
    if (conflito) return falha(`Já existe um motivo chamado "${nome}".`);

    await tx.insert(motivoPausa).values({
      tenantId: tid,
      nome,
      duracaoSugeridaMin,
      contaComoProdutivo: marcado(dados, 'contaComoProdutivo'),
      ativo: marcado(dados, 'ativo'),
    });

    revalidatePath('/atendentes/pausas');
    return OK;
  });
}
