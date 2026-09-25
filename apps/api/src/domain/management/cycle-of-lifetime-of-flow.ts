import { and, eq, ne } from 'drizzle-orm';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { Ator, TransacaoPipe as TransactionPipe } from '@pipe/db';
import { DESCRIPTION_FLOW_MAX, flow } from '@pipe/db/schema';
import { PipeError } from '../../errors.js';
import { exigirPermission } from '../../session.js';
import { exigirPermissionInFlow } from './team-of-flow.js';
import {
  IMAGE,
  TAMANHO,
  conferir,
  limparNome,
  nomeCurto,
  typeRealOfImage,
} from './regras-de-nome.js';

/**
 * Portado de chatwoot/chatwoot (MIT),
 * app/controllers/api/v1/accounts/inboxes_controller.rb (`create`, `update`,
 * `destroy`, `avatar`) e app/policies/inbox_policy.rb.
 *
 * O ciclo de vida do CONTATO (o `fluxo`, fluxo ou roteador) — o que lá é o
 * ciclo de vida da Inbox. A forma é a deles, e a ordem de cada gesto também:
 *
 * - `create`: autoriza, monta com os parâmetros permitidos, `save!` (as
 *   validações do modelo recusam antes de gravar);
 * - `update`: `fetch_inbox` (404 se não é da conta), autoriza, `update!` só com
 *   o que veio — campo ausente não é campo apagado;
 * - `destroy`: `fetch_inbox`, autoriza, e some da lista;
 * - `avatar`: `@inbox.avatar.purge` — tirar a foto é um gesto próprio, aqui
 *   expresso como `imagem: null` no mesmo `update`.
 *
 * As REGRAS de cada campo não são do Chatwoot: são da plataforma de origem das
 * telas (a Blip), lidas do DOM de "Editar Fluxo"
 * (`referencias-blip/portal/dom/application-detail-pipeprincipal-configurations-basic.html`)
 * e do assistente de criação (`regras-de-nome.ts`, que cita o bundle):
 *
 * - nome: obrigatório, 2 a 30 caracteres, começa com letra, saneado a cada tecla
 *   (`required`, `ng-minlength="2"`, `ng-maxlength="30"`, `validateSpecialCharacter`);
 * - descrição: opcional, 2 a 160 quando existe (`ng-minlength="2"`,
 *   `ng-maxlength="160"`, sem `required`);
 * - imagem: opcional, `.gif .png .jpeg .jpg` conferidos pelos BYTES
 *   (`ng-mime-type="image/png, image/jpg, image/jpeg, image/gif"`).
 *
 * E a PERMISSÃO também é da origem: criar e editar são de quem "cria e edita
 * chatbots" (`automacao.fluxo.editar`, o `member` deles — migração 0021);
 * excluir é só do admin ("Somente um admin pode deletar o chatbot",
 * `deleteChatbotPermissionDenied` — `automacao.fluxo.excluir`, migração 0023).
 * Lá a InboxPolicy pede administrador para os três; a divergência é decisão da
 * origem das telas, não nossa.
 *
 * ## Excluir é ARQUIVAR
 *
 * A origem apaga de verdade ("removido de forma permanente… Essa ação não
 * poderá ser desfeita", `deleteChatBotModalBody`) e o Chatwoot também
 * (`DeleteObjectJob` → `destroy!`). Aqui o gesto vira `estado = 'arquivado'`,
 * e o motivo está no schema: `execucao_fluxo.fluxo_versao_id` é
 * `ON DELETE RESTRICT` — um fluxo que já atendeu alguém não pode ser apagado
 * sem antes apagar o histórico das conversas que passaram por ele, e histórico
 * de atendimento é o dado que a LGPD e o contrato mandam guardar. O efeito que
 * a pessoa vê é o mesmo dos dois originais: some do portal
 * (`carregarGradeDoPortal` já filtra `arquivado`), o canal para de servi-lo
 * (`fluxoPublicadoDoCanal` só olha `publicado`) e o nome fica livre para outro
 * (a unicidade ignora os arquivados). O que muda é que dá para voltar atrás.
 */

export const EDITAR_FLOW = 'automacao.fluxo.editar';
export const DELETE_FLOW = 'automacao.fluxo.excluir';

/** `ng-minlength="2"` / `ng-maxlength="160"` do `<textarea name="description">`. */
export const DESCRIPTION = { min: 2, max: DESCRIPTION_FLOW_MAX } as const;

export interface RequestOfCreation {
  name: string;
  type: 'fluxo' | 'roteador';
  /** `data:image/...;base64,...`, ou nada. */
  image?: string | null | undefined;
}

/** Só o que veio muda; `undefined` é "não mexa", `null` é "apague". */
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
 * O nome, pelas regras de `regras-de-nome.ts` — as mesmas da criação, porque na
 * origem `validateSpecialCharacter` e os atributos do `<input>` são os mesmos
 * nas duas telas. `conferir` devolve a PRIMEIRA recusa como texto; aqui o texto
 * é o código, e a frase mora em `ErroPipe`.
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
 * A descrição. Vazia vira NULL — o formulário manda `""` quando a pessoa apaga
 * tudo, e o campo é opcional. O filtro de caracteres da origem
 * (`validateSpecialCharacter(description, 'description')`) NÃO é aplicado:
 * o corpo dele para este campo não foi lido, e copiar o do nome seria supor.
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
 * A foto, se é mesmo imagem: o tipo sai dos bytes, nunca do rótulo. `null`
 * quando não é — quem chama decide se engole (criação, como o
 * `uploadApplicationImageSafely` deles) ou recusa (edição, onde o
 * `ng-mime-type` deixa o formulário inválido).
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

/** Outro contato VIVO com este nome? Arquivado não conta: o nome dele ficou livre. */
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
  /* "Experimente usar outro nome" é o `errorMsg.1` da origem, literal. */
  return PipeError.conflito(
    'name_in_use',
    'Já existe um fluxo com este nome. Experimente usar outro nome.',
  );
}

const ator = (userId: string): Ator => ({ tipo: 'usuario', id: userId });

/* ------------------------------------------------------------- Gestos */

/** `create`: autoriza, valida, grava. A foto inválida é engolida, como lá. */
export async function createFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  pedido: RequestOfCreation,
): Promise<{ id: string }> {
  await exigirPermission(tx, usuarioId, EDITAR_FLOW);
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

/** O contato vivo, ou 404 — o `fetch_inbox` deles. Arquivado é "não existe". */
async function flowVivo(tx: TransactionPipe, tenantId: string, id: string) {
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

/** `update`: só o que veio. Nada mudou, nada é gravado — nem no log. */
export async function editarFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  id: string,
  pedido: RequestOfEdit,
): Promise<FlowWritten> {
  const atual = await flowVivo(tx, tenantId, id);
  /* "Configurações básicas" é uma linha do `PermissionsList.html`
     (`basicConfigurations`), então editar ESTE contato passa a valer também
     para quem tem a permissão nele — sem tirar de quem já a tinha na conta
     (`exigirPermissaoNoFluxo`, migração 0035). */
  await exigirPermissionInFlow(tx, usuarioId, id, 'basicConfigurations.escrever');

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
  if (Object.keys(mudanca.depois).length === 0) return { id: atual.id, ...antes };

  if (depois.nome !== antes.nome && (await nomeEmUso(tx, tenantId, depois.nome, atual.id))) {
    throw conflitoDeNome();
  }

  const [gravado] = await tx
    .update(flow)
    .set({ ...depois, atualizadoEm: new Date() })
    .where(and(eq(flow.tenantId, tenantId), eq(flow.id, atual.id)))
    .returning({
      id: flow.id,
      nome: flow.nome,
      descricao: flow.descricao,
      imagemUrl: flow.imageUrl,
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

/** `destroy`: some da lista e do canal — arquivando, pelo motivo do cabeçalho. */
export async function deleteFlow(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  const atual = await flowVivo(tx, tenantId, id);
  await exigirPermission(tx, usuarioId, DELETE_FLOW);

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
