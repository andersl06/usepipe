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
 * The Builder saves and publishes a real flow. The client screen is a Blip copy; its Builder keeps the design in two buckets, state map (`builder_working_flow`) and global actions (`builder_working_global_actions`). Publishing stores the compiled flow in the "Application". Here those buckets become Pipe database records through the SAME domain used by the Management Builder (`apps/api/src/dominio/gestao/builder-do-fluxo.ts`): one draft per flow, overwritten on each save; publishing promotes the draft and archives the previous version. The copy opens the Builder for a bot, and the bot is the connection: its LIME commands contain no flow ID. Buckets such as `blip_portal:builder_working_flow` have no qualifier, and the bridge runs for ONE tenant (`PIPE_PONTE_TENANT_ID`). Therefore it edits ONE flow. If `PIPE_PONTE_FLUXO_ID` is set, require a non-archived flow of type `fluxo` in this tenant and fail if it is invalid. If it is unset, reuse or create `Fluxo do Builder`. A per-session flow would require the lab copy to send a bot ID on every command; it does not. The Management screen already uses per-flow routes. The domain checks `automacao.fluxo.editar` for reading and saving and `automacao.fluxo.publicar` for publishing, as for Management. The person represented by the copy (`PIPE_PONTE_EMAIL`) needs those permissions; a tenant admin has both. Without permission return a LIME failure with the domain message, not a design that only appears saved.
 */

/** Fallback flow when `PIPE_PONTE_FLUXO_ID` does not select one. */
const NAME_OF_FLOW = 'Fluxo do Builder';

/** Resolve once per process: the flow does not change while the bridge runs. */
let flowIdResolved: string | null = null;

/** Resolve the flow ID edited by the copy, creating the flow on first use if needed. */
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
 * Return the editor map: draft, published version, or default flow if no design exists. The domain supplies the default; even an empty saved draft opens with it so the screen never starts blank.
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
  /** The flow was saved but the engine would refuse to run it, so it was not published. */
  validationError: string | null;
}

/**
 * Save the client's design. `publicar: false` leaves a draft, matching the Builder's save on each change; `true` publishes and only then does the engine execute the new flow. Invalid input is saved but not published; return the engine's reason in `erroDeValidacao` for the screen to display.
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
      validationError: null,
    };
  });
}
