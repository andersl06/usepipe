import { sql } from 'drizzle-orm';
import { FLOW_DEFAULT } from '@pipe/core';
import {
  carregarBuilder,
  publicarRascunho,
  salvarRascunho,
} from '@pipe/api/domain/management/flow-builder';
import { noTenant } from './database.js';
import type { Session } from './rotas.js';

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
const NAME_OF_FLOW = 'Fluxo do Builder';

/** Uma vez por processo: o fluxo não muda enquanto a ponte roda. */
let flowIdResolved: string | null = null;

/** O id do fluxo que a cópia edita — resolvendo (e criando, se preciso) na primeira chamada. */
export async function bridgeFlow(session: Session): Promise<string> {
  if (flowIdResolved) return flowIdResolved;
  flowIdResolved = await noTenant(session.tenantId, async (tx) => {
    const configurado = process.env['PIPE_PONTE_FLUXO_ID'];
    if (configurado) {
      const { rows } = await tx.execute<{ id: string }>(sql`
        select id from fluxo
         where id = ${configurado}::uuid and tipo = 'fluxo' and estado <> 'arquivado'
         limit 1
      `);
      if (!rows[0]) {
        throw new Error(
          `ponte: PIPE_PONTE_FLUXO_ID=${configurado} não é um fluxo (não roteador, não arquivado) do tenant ${session.tenantId}`,
        );
      }
      return rows[0].id;
    }
    const { rows: existentes } = await tx.execute<{ id: string }>(sql`
      select id from fluxo
       where nome = ${NAME_OF_FLOW} and tipo = 'fluxo' and estado <> 'arquivado'
       order by criado_em
       limit 1
    `);
    if (existentes[0]) return existentes[0].id;
    const { rows: criados } = await tx.execute<{ id: string }>(sql`
      insert into fluxo (tenant_id, nome, tipo) values (${session.tenantId}, ${NAME_OF_FLOW}, 'fluxo')
      returning id
    `);
    return criados[0]!.id;
  });
  return flowIdResolved;
}

/**
 * Devolve o mapa do editor — o rascunho, a publicada, ou o fluxo padrão quando o
 * cliente ainda não desenhou nada (o domínio já devolve o padrão; e um rascunho
 * gravado vazio também abre com o padrão, para a tela nunca abrir em branco).
 */
export async function carregarRascunho(session: Session): Promise<Record<string, unknown> | null> {
  const flowId = await bridgeFlow(session);
  const builder = await noTenant(session.tenantId, (tx) =>
    carregarBuilder(tx, session.tenantId, session.userId, flowId),
  );
  return Object.keys(builder.desenho.flow).length > 0 ? builder.desenho.flow : FLOW_DEFAULT;
}

export async function loadGlobal(session: Session): Promise<Record<string, unknown> | null> {
  const flowId = await bridgeFlow(session);
  const builder = await noTenant(session.tenantId, (tx) =>
    carregarBuilder(tx, session.tenantId, session.userId, flowId),
  );
  return builder.desenho.globals;
}

export interface RecordingResult {
  versaoId: string;
  versao: number;
  publicado: boolean;
  naoSuportado: Record<string, number>;
  /** O fluxo foi gravado, mas o motor recusaria rodar — e por isso não publicou. */
  validationError: string | null;
}

/**
 * Grava o desenho do cliente. `publicar: false` deixa em rascunho — é o "salvar"
 * do Builder, que acontece a cada alteração; `true` é o botão de publicar, e só
 * então o motor passa a executar o fluxo novo. Inválido grava e não publica: a
 * frase do motor volta em `erroDeValidacao`, para a tela mostrar.
 */
export async function saveFlow(
  session: Session,
  mapa: Record<string, unknown>,
  global: Record<string, unknown> | null,
  publicar: boolean,
): Promise<RecordingResult> {
  const flowId = await bridgeFlow(session);
  return noTenant(session.tenantId, async (tx) => {
    const rascunho = await salvarRascunho(tx, session.tenantId, session.userId, flowId, {
      fluxo: mapa,
      globais: global ?? {},
    });
    const validationError =
      rascunho.erros.length > 0 ? rascunho.erros.map((e) => e.mensagem).join(' ') : null;
    if (!publicar || validationError) {
      return {
        versaoId: rascunho.versao.id,
        versao: rascunho.versao.versao,
        publicado: false,
        naoSuportado: rascunho.naoSuportado,
        validationError,
      };
    }
    const publicada = await publicarRascunho(tx, session.tenantId, session.userId, flowId);
    return {
      versaoId: publicada.versao.id,
      versao: publicada.versao.versao,
      publicado: true,
      naoSuportado: rascunho.naoSuportado,
      erroDeValidacao: null,
    };
  });
}
