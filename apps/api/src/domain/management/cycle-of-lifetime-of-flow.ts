import { and, eq, ne } from 'drizzle-orm';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { Ator, TransactionPipe } from '@pipe/db';
import { DESCRIPTION_FLOW_MAX, flow } from '@pipe/db/schema';
import { PipeError } from '../../errors.js';
import { requirePermission } from '../../session.js';
import { requirePermissionInFlow } from './team-of-flow.js';
import {
  IMAGE,
  TAMANHO,
  conferir,
  limparNome,
  nomeCurto,
  typeRealOfImage,
} from './regras-de-nome.js';

/**
 * Ported from chatwoot/chatwoot (MIT), `app/controllers/api/v1/accounts/inboxes_controller.rb` (`create`, `update`, `destroy`, `avatar`) and `app/policies/inbox_policy.rb`. Contact (`fluxo` bot or router) lifecycle follows its Inbox sequence: authorize before create; fetch within account and authorize before update/delete; update supplied fields only; remove an avatar with `imagem: null`. Field rules come instead from Blip's Edit Flow DOM (`referencias-blip/portal/dom/application-detail-pipeprincipal-configurations-basic.html`) and creation wizard (`regras-de-nome.ts`): required name 2–30 starting with a letter; optional description 2–160 when present; optional image `.gif .png .jpeg .jpg` verified by BYTES. Source permissions also differ from Chatwoot: `automacao.fluxo.editar` (migration 0021) for create/edit, `automacao.fluxo.excluir` (migration 0023) for admin-only delete; the source says 'Somente um admin pode deletar o chatbot' (`deleteChatbotPermissionDenied`). Delete ARCHIVES here (`estado = 'arquivado'`) although Blip and Chatwoot permanently delete, because `execucao_fluxo.fluxo_versao_id` is `ON DELETE RESTRICT` and conversation history must remain for LGPD and contract obligations. Archived flows disappear from `carregarGradeDoPortal`, are ignored by `fluxoPublicadoDoCanal`, and free their name; this also permits restoration.
 */

export const EDIT_FLOW = 'automacao.fluxo.editar';
export const DELETE_FLOW = 'automacao.fluxo.excluir';

/** `ng-minlength="2"` / `ng-maxlength="160"` do `<textarea name="description">`. */
export const DESCRIPTION = { min: 2, max: DESCRIPTION_FLOW_MAX } as const;

export interface RequestOfCreation {
  name: string;
  type: 'fluxo' | 'roteador';
  /** `data:image/...;base64,...`, ou nada. */
  image?: string | null | undefined;
}

/** Only supplied fields change: `undefined` means leave unchanged; `null` means clear. */
export interface RequestOfEdit {
  name?: string | undefined;
  description?: string | null | undefined;
  imagem?: string | null | undefined;
}

export interface FlowWritten {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  shortName: string | null;
}

/* ------------------------------------------------------------- Regras */

/**
 * Use `regras-de-nome.ts` for names on create and edit: source `validateSpecialCharacter` and `<input>` attributes are the same on both screens. `conferir` returns the FIRST rejection as a code; `ErroPipe` owns the user-facing sentence.
 */
function nomeConferido(bruto: string): string {
  const nome = limparNome(bruto).trim();
  const recusa = conferir(nome, { tamanho: 'tamanho', comecoInvalido: 'comeco' });
  if (recusa?.motivo === 'tamanho') {
    throw PipeError.request(
      'name_size',
      `O nome do fluxo precisa ter entre ${TAMANHO.nomeMin} e ${TAMANHO.nomeMax} caracteres.`,
    );
  }
  if (recusa) {
    throw PipeError.request(
      'name_start',
      'O nome de seu fluxo não pode começar com números ou caracteres especiais.',
    );
  }
  return nome;
}

/**
 * Empty description becomes NULL because the form submits `''` when cleared. The source's `validateSpecialCharacter(description, 'description')` was not reproduced: its field-specific body was not observed, so using the name rule would be an assumption.
 */
function descriptionChecked(bruta: string | null): string | null {
  const description = (bruta ?? '').trim();
  if (description.length === 0) return null;
  if (description.length < DESCRIPTION.min || description.length > DESCRIPTION.max) {
    throw PipeError.request(
      'description_size',
      `A descrição precisa ter entre ${DESCRIPTION.min} e ${DESCRIPTION.max} caracteres.`,
    );
  }
  return description;
}

/**
 * Identify an image by bytes, never its label. Return `null` for invalid content; creation may ignore it like source `uploadApplicationImageSafely`, while editing rejects it because `ng-mime-type` makes the source form invalid.
 */
export function imageOfBytes(dataUrl: string): string | null {
  const m = /^data:[^;]+;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const bytes = new Uint8Array(Buffer.from(m[1] ?? '', 'base64'));
  if (bytes.byteLength === 0 || bytes.byteLength > IMAGE.maxBytes) return null;
  const mime = typeRealOfImage(bytes);
  if (!mime) return null;
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

/** Check another LIVE contact with this name. An archived contact frees its name. */
async function nomeEmUso(
  tx: TransactionPipe,
  tenantId: string,
  nome: string,
  excetoId?: string,
): Promise<boolean> {
  const [conflito] = await tx
    .select({ id: flow.id })
    .from(flow)
    .where(
      and(
        eq(flow.tenantId, tenantId),
        eq(flow.nome, nome),
        ne(flow.estado, 'arquivado'),
        excetoId ? ne(flow.id, excetoId) : undefined,
      ),
    )
    .limit(1);
  return conflito !== undefined;
}

function conflitoDeNome(): PipeError {
  /* 'Experimente usar outro nome' is the source's literal `errorMsg.1`. */
  return PipeError.conflito(
    'name_in_use',
    'Já existe um fluxo com este nome. Experimente usar outro nome.',
  );
}

const ator = (userId: string): Ator => ({ type: 'usuario', id: userId });

/* ------------------------------------------------------------- Gestos */

/** `create` authorizes, validates and saves; invalid images are ignored as in the source. */
export async function createFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  pedido: RequestOfCreation,
): Promise<{ id: string }> {
  await requirePermission(tx, usuarioId, EDIT_FLOW);
  const nome = nomeConferido(pedido.name);
  const tipo = pedido.type === 'roteador' ? 'roteador' : 'fluxo';
  const imageUrl = pedido.image ? imageOfBytes(pedido.image) : null;

  if (await nomeEmUso(tx, tenantId, nome)) throw conflitoDeNome();
  const [criado] = await tx
    .insert(flow)
    .values({ tenantId, nome, tipo, shortName: nomeCurto(nome), imageUrl })
    .returning({ id: flow.id });
  if (!criado) throw conflitoDeNome();

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'criou',
    objetoTipo: 'fluxo',
    objetoId: criado.id,
    depois: { nome, tipo, estado: 'rascunho' },
  });
  return { id: criado.id };
}

/** Return the live contact or 404, like source `fetch_inbox`; archived contacts are treated as absent. */
async function flowLive(tx: TransactionPipe, tenantId: string, id: string) {
  const [atual] = await tx
    .select({
      id: flow.id,
      nome: flow.nome,
      tipo: flow.tipo,
      estado: flow.estado,
      canalId: flow.channelId,
      descricao: flow.descricao,
      imagemUrl: flow.imageUrl,
      shortName: flow.shortName,
    })
    .from(flow)
    .where(and(eq(flow.tenantId, tenantId), eq(flow.id, id), ne(flow.estado, 'arquivado')))
    .limit(1);
  if (!atual) throw PipeError.naoEncontrado('fluxo');
  return atual;
}

/** `update` changes supplied fields only; no change means no write and no audit entry. */
export async function editFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  id: string,
  pedido: RequestOfEdit,
): Promise<FlowWritten> {
  const atual = await flowLive(tx, tenantId, id);
  /*
   * 'Configurações básicas' is a `PermissionsList.html` row (`basicConfigurations`), so a member with permission on THIS contact may edit it, alongside existing account-level permission (`exigirPermissaoNoFluxo`, migration 0035).
   */
  await requirePermissionInFlow(tx, usuarioId, id, 'basicConfigurations.escrever');

  const antes = {
    nome: atual.nome,
    descricao: atual.descricao,
    imagemUrl: atual.imagemUrl,
    shortName: atual.shortName,
  };
  const depois = { ...antes };

  if (pedido.name !== undefined) {
    depois.nome = nomeConferido(pedido.name);
    depois.shortName = nomeCurto(depois.nome);
  }
  if (pedido.description !== undefined) depois.descricao = descriptionChecked(pedido.description);
  if (pedido.imagem !== undefined) {
    if (pedido.imagem === null) {
      depois.imagemUrl = null;
    } else {
      const lida = imageOfBytes(pedido.imagem);
      if (!lida) {
        const tipos = IMAGE.aceitos.join(', ');
        const teto = Math.round(IMAGE.maxBytes / 1024);
        throw PipeError.request(
          'image_invalid',
          `A imagem precisa ser ${tipos} e ter até ${teto} KB.`,
        );
      }
      depois.imagemUrl = lida;
    }
  }

  const mudanca = diferenca(antes, depois);
  if (Object.keys(mudanca.depois).length === 0) return { id: atual.id, name: antes.nome, description: antes.descricao, imageUrl: antes.imagemUrl, shortName: antes.shortName };

  if (depois.nome !== antes.nome && (await nomeEmUso(tx, tenantId, depois.nome, atual.id))) {
    throw conflitoDeNome();
  }

  const [gravado] = await tx
    .update(flow)
    .set({ ...depois, atualizadoEm: new Date() })
    .where(and(eq(flow.tenantId, tenantId), eq(flow.id, atual.id)))
    .returning({
      id: flow.id,
      name: flow.nome,
      description: flow.descricao,
      imageUrl: flow.imageUrl,
      shortName: flow.shortName,
    });
  if (!gravado) throw PipeError.naoEncontrado('fluxo');

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'fluxo',
    objetoId: atual.id,
    antes: mudanca.antes,
    depois: mudanca.depois,
  });
  return gravado;
}

/** `destroy` archives the contact, removing it from the list and channel for the reason in the file header. */
export async function deleteFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  const atual = await flowLive(tx, tenantId, id);
  await requirePermission(tx, usuarioId, DELETE_FLOW);

  await tx
    .update(flow)
    .set({ estado: 'arquivado', atualizadoEm: new Date() })
    .where(and(eq(flow.tenantId, tenantId), eq(flow.id, atual.id)));

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'excluiu',
    objetoTipo: 'fluxo',
    objetoId: atual.id,
    antes: { nome: atual.nome, tipo: atual.tipo, estado: atual.estado, canalId: atual.canalId },
    depois: { estado: 'arquivado' },
  });
}
