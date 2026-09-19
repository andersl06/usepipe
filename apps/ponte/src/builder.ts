import { sql } from 'drizzle-orm';
import { FLUXO_PADRAO } from '@pipe/core';
import {
  carregarBuilder,
  publicarRascunho,
  salvarRascunho,
} from '@pipe/api/dominio/gestao/builder-do-fluxo';
import { noTenant } from './banco.js';
import type { Sessao } from './rotas.js';

/**
 * O Builder salvando e publicando de verdade.
 *
 * A tela do cliente é a cópia da Blip, e o Builder dela guarda o desenho em dois
 * baldes: o mapa de estados (`builder_working_flow`) e as ações globais
 * (`builder_working_global_actions`). Publicar é gravar o fluxo compilado dentro da
 * "Application". Aqui esses baldes passam a ser o banco do Pipe — pelo MESMO
 * domínio que a tela do Builder da Gestão usa (`apps/api/src/dominio/gestao/
 * builder-do-fluxo.ts`): um rascunho por fluxo, gravado por cima a cada salvar;
 * publicar promove o rascunho e arquiva a versão anterior.
 *
 * ## Qual fluxo
 *
 * A cópia abre o Builder "do bot", e o bot é a conexão: nenhum comando LIME dela
 * carrega o id do fluxo — os buckets são `blip_portal:builder_working_flow`, sem
 * qualificador, e a ponte roda para UM tenant (`PIPE_PONTE_TENANT_ID`). Então a
 * ponte também edita UM fluxo, escolhido assim:
 *
 * 1. `PIPE_PONTE_FLUXO_ID`, quando definido — o id de um fluxo (tipo `fluxo`,
 *    não arquivado) do tenant, para apontar a cópia para o contato que se quer
 *    editar;
 * 2. senão, o fluxo chamado `Fluxo do Builder`, criado na primeira vez — o
 *    comportamento de antes, para o laboratório continuar funcionando sem
 *    configuração nova.
 *
 * Trocar isso por fluxo-por-sessão exigiria o laboratório mandar o id do bot em
 * cada comando (a cópia não manda), e fica para quando a tela for nossa — que é a
 * tela da Gestão, já ligada nas rotas por fluxo.
 *
 * ## Permissão
 *
 * O domínio confere `automacao.fluxo.editar` para ler e salvar e
 * `automacao.fluxo.publicar` para publicar, como faz para a Gestão. A pessoa que
 * a cópia representa (`PIPE_PONTE_EMAIL`) precisa tê-las — o administrador do
 * tenant tem as duas. Sem elas a resposta é a falha LIME com a frase do domínio,
 * e não um desenho que parece salvo e não está.
 */

/** O fluxo de reserva, quando `PIPE_PONTE_FLUXO_ID` não aponta para um. */
const NOME_DO_FLUXO = 'Fluxo do Builder';

/** Uma vez por processo: o fluxo não muda enquanto a ponte roda. */
let fluxoIdResolvido: string | null = null;

/** O id do fluxo que a cópia edita — resolvendo (e criando, se preciso) na primeira chamada. */
export async function fluxoDaPonte(sessao: Sessao): Promise<string> {
  if (fluxoIdResolvido) return fluxoIdResolvido;
  fluxoIdResolvido = await noTenant(sessao.tenantId, async (tx) => {
    const configurado = process.env['PIPE_PONTE_FLUXO_ID'];
    if (configurado) {
      const { rows } = await tx.execute<{ id: string }>(sql`
        select id from fluxo
         where id = ${configurado}::uuid and tipo = 'fluxo' and estado <> 'arquivado'
         limit 1
      `);
      if (!rows[0]) {
        throw new Error(
          `ponte: PIPE_PONTE_FLUXO_ID=${configurado} não é um fluxo (não roteador, não arquivado) do tenant ${sessao.tenantId}`,
        );
      }
      return rows[0].id;
    }
    const { rows: existentes } = await tx.execute<{ id: string }>(sql`
      select id from fluxo
       where nome = ${NOME_DO_FLUXO} and tipo = 'fluxo' and estado <> 'arquivado'
       order by criado_em
       limit 1
    `);
    if (existentes[0]) return existentes[0].id;
    const { rows: criados } = await tx.execute<{ id: string }>(sql`
      insert into fluxo (tenant_id, nome, tipo) values (${sessao.tenantId}, ${NOME_DO_FLUXO}, 'fluxo')
      returning id
    `);
    return criados[0]!.id;
  });
  return fluxoIdResolvido;
}

/**
 * Devolve o mapa do editor — o rascunho, a publicada, ou o fluxo padrão quando o
 * cliente ainda não desenhou nada (o domínio já devolve o padrão; e um rascunho
 * gravado vazio também abre com o padrão, para a tela nunca abrir em branco).
 */
export async function carregarRascunho(sessao: Sessao): Promise<Record<string, unknown> | null> {
  const fluxoId = await fluxoDaPonte(sessao);
  const builder = await noTenant(sessao.tenantId, (tx) =>
    carregarBuilder(tx, sessao.tenantId, sessao.usuarioId, fluxoId),
  );
  return Object.keys(builder.desenho.fluxo).length > 0 ? builder.desenho.fluxo : FLUXO_PADRAO;
}

export async function carregarGlobais(sessao: Sessao): Promise<Record<string, unknown> | null> {
  const fluxoId = await fluxoDaPonte(sessao);
  const builder = await noTenant(sessao.tenantId, (tx) =>
    carregarBuilder(tx, sessao.tenantId, sessao.usuarioId, fluxoId),
  );
  return builder.desenho.globais;
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
 * então o motor passa a executar o fluxo novo. Inválido grava e não publica: a
 * frase do motor volta em `erroDeValidacao`, para a tela mostrar.
 */
export async function gravarFluxo(
  sessao: Sessao,
  mapa: Record<string, unknown>,
  globais: Record<string, unknown> | null,
  publicar: boolean,
): Promise<ResultadoDaGravacao> {
  const fluxoId = await fluxoDaPonte(sessao);
  return noTenant(sessao.tenantId, async (tx) => {
    const rascunho = await salvarRascunho(tx, sessao.tenantId, sessao.usuarioId, fluxoId, {
      fluxo: mapa,
      globais: globais ?? {},
    });
    const erroDeValidacao =
      rascunho.erros.length > 0 ? rascunho.erros.map((e) => e.mensagem).join(' ') : null;
    if (!publicar || erroDeValidacao) {
      return {
        versaoId: rascunho.versao.id,
        versao: rascunho.versao.versao,
        publicado: false,
        naoSuportado: rascunho.naoSuportado,
        erroDeValidacao,
      };
    }
    const publicada = await publicarRascunho(tx, sessao.tenantId, sessao.usuarioId, fluxoId);
    return {
      versaoId: publicada.versao.id,
      versao: publicada.versao.versao,
      publicado: true,
      naoSuportado: rascunho.naoSuportado,
      erroDeValidacao: null,
    };
  });
}
