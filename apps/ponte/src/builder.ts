import { sql } from 'drizzle-orm';
import { importarFluxoDaBlip } from '@pipe/api/dominio/fluxo';
import { noTenant } from './banco.js';
import type { Sessao } from './rotas.js';
import { ACOES_GLOBAIS_PADRAO, FLUXO_PADRAO } from './fluxo-padrao.js';

/**
 * O Builder salvando e publicando de verdade.
 *
 * A tela do cliente é a cópia da Blip, e o Builder dela guarda o desenho em dois
 * baldes: o mapa de estados (`builder_working_flow`) e as ações globais
 * (`builder_working_global_actions`). Publicar é gravar o fluxo compilado dentro da
 * "Application". Aqui esses baldes passam a ser o banco do Pipe.
 *
 * Nada disso reimplementa escrita: `importarFluxoDaBlip` já grava fluxo, versão,
 * blocos e transições, e guarda o estado do editor em `bloco.conteudo.original` —
 * campo que o motor ignora e que é exatamente o que a tela precisa de volta. É por
 * isso que o ciclo fecha sem coluna nova.
 */

/** Um fluxo por tenant nesta etapa: é o que a cópia edita, que é "o fluxo do bot". */
const NOME_DO_FLUXO = 'Fluxo do Builder';

type LinhaBloco = { codigo: string; conteudo: Record<string, unknown> };

async function versaoParaEditar(
  tx: Parameters<Parameters<typeof noTenant>[1]>[0],
): Promise<{ versaoId: string; global: Record<string, unknown> } | null> {
  /* A versão em edição é a mais nova do fluxo: rascunho se houver, senão a
     publicada — que é o que o Builder abre para continuar de onde parou. */
  const { rows } = await tx.execute<{ id: string; global: Record<string, unknown> }>(sql`
    select v.id, v.global
      from fluxo_versao v
      join fluxo f on f.id = v.fluxo_id
     where f.nome = ${NOME_DO_FLUXO}
     order by case v.estado when 'rascunho' then 0 else 1 end, v.versao desc
     limit 1
  `);
  const linha = rows[0];
  return linha ? { versaoId: linha.id, global: linha.global ?? {} } : null;
}

/**
 * Devolve o mapa do editor, ou `null` quando o cliente ainda não desenhou nada —
 * e aí a ponte responde "não existe" (código 67), que é o desvio pelo qual o
 * Builder abre um fluxo novo em vez de mostrar erro.
 */
export async function carregarRascunho(sessao: Sessao): Promise<Record<string, unknown> | null> {
  return noTenant(sessao.tenantId, async (tx) => {
    const versao = await versaoParaEditar(tx);
    /* Cliente novo abre o Builder com o fluxo mínimo já desenhado: recebe, avisa e
       manda para a fila. Ele não está gravado — vira do cliente no primeiro salvar. */
    if (!versao) return FLUXO_PADRAO;
    const { rows } = await tx.execute<LinhaBloco>(sql`
      select codigo, conteudo from bloco where versao_id = ${versao.versaoId}
    `);
    if (!rows.length) return FLUXO_PADRAO;
    const mapa: Record<string, unknown> = {};
    for (const bloco of rows) {
      /* `original` é o estado como o editor o desenhou. Sem ele (fluxo criado por
         outro caminho, como o assistente de IA), devolvemos o que há: é melhor a
         tela abrir o bloco simplificado do que não abrir. */
      mapa[bloco.codigo] = bloco.conteudo?.['original'] ?? bloco.conteudo;
    }
    return mapa;
  });
}

export async function carregarGlobais(sessao: Sessao): Promise<Record<string, unknown> | null> {
  return noTenant(sessao.tenantId, async (tx) => {
    const versao = await versaoParaEditar(tx);
    if (!versao) return ACOES_GLOBAIS_PADRAO;
    const globais = versao.global?.['editor'];
    return (globais as Record<string, unknown>) ?? null;
  });
}

export interface ResultadoDaGravacao {
  versaoId: string;
  versao: number;
  publicado: boolean;
  naoSuportado: Record<string, number>;
  /** O fluxo foi gravado, mas o motor recusaria rodar — e por isso não publicou. */
  erroDeValidacao: string | null;
}

/**
 * Grava o desenho do cliente. `publicar: false` deixa em rascunho — é o "salvar"
 * do Builder, que acontece a cada alteração; `true` é o botão de publicar, e só
 * então o motor passa a executar o fluxo novo.
 */
export async function gravarFluxo(
  sessao: Sessao,
  mapa: Record<string, unknown>,
  globais: Record<string, unknown> | null,
  publicar: boolean,
): Promise<ResultadoDaGravacao> {
  return noTenant(sessao.tenantId, async (tx) => {
    const resultado = await importarFluxoDaBlip(tx, {
      tenantId: sessao.tenantId,
      nome: NOME_DO_FLUXO,
      canalId: null,
      json: { flow: mapa, globalActions: globais ?? {} },
      publicar,
    });
    return {
      versaoId: resultado.versaoId,
      versao: resultado.versao,
      publicado: resultado.publicado,
      naoSuportado: resultado.relatorio.naoSuportado,
      erroDeValidacao: resultado.erroDeValidacao,
    };
  });
}
