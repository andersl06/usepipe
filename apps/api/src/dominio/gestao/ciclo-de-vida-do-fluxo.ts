import { and, eq, ne } from 'drizzle-orm';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { Ator, TransacaoPipe } from '@pipe/db';
import { DESCRICAO_FLUXO_MAX, fluxo } from '@pipe/db/schema';
import { ErroPipe } from '../../erros.js';
import { exigirPermissao } from '../../sessao.js';
import {
  IMAGEM,
  TAMANHO,
  conferir,
  limparNome,
  nomeCurto,
  tipoRealDaImagem,
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
 * (`docs/capturas/blip/dom/application-detail-pipeprincipal-configurations-basic.html`)
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

export const EDITAR_FLUXO = 'automacao.fluxo.editar';
export const EXCLUIR_FLUXO = 'automacao.fluxo.excluir';

/** `ng-minlength="2"` / `ng-maxlength="160"` do `<textarea name="description">`. */
export const DESCRICAO = { min: 2, max: DESCRICAO_FLUXO_MAX } as const;

export interface PedidoDeCriacao {
  nome: string;
  tipo: 'fluxo' | 'roteador';
  /** `data:image/...;base64,...`, ou nada. */
  imagem?: string | null | undefined;
}

/** Só o que veio muda; `undefined` é "não mexa", `null` é "apague". */
export interface PedidoDeEdicao {
  nome?: string | undefined;
  descricao?: string | null | undefined;
  imagem?: string | null | undefined;
}

export interface FluxoGravado {
  id: string;
  nome: string;
  descricao: string | null;
  imagemUrl: string | null;
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
    throw ErroPipe.requisicao(
      'nome_tamanho',
      `O nome do fluxo precisa ter entre ${TAMANHO.nomeMin} e ${TAMANHO.nomeMax} caracteres.`,
    );
  }
  if (recusa) {
    throw ErroPipe.requisicao(
      'nome_comeco',
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
function descricaoConferida(bruta: string | null): string | null {
  const descricao = (bruta ?? '').trim();
  if (descricao.length === 0) return null;
  if (descricao.length < DESCRICAO.min || descricao.length > DESCRICAO.max) {
    throw ErroPipe.requisicao(
      'descricao_tamanho',
      `A descrição precisa ter entre ${DESCRICAO.min} e ${DESCRICAO.max} caracteres.`,
    );
  }
  return descricao;
}

/**
 * A foto, se é mesmo imagem: o tipo sai dos bytes, nunca do rótulo. `null`
 * quando não é — quem chama decide se engole (criação, como o
 * `uploadApplicationImageSafely` deles) ou recusa (edição, onde o
 * `ng-mime-type` deixa o formulário inválido).
 */
export function imagemDosBytes(dataUrl: string): string | null {
  const m = /^data:[^;]+;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const bytes = new Uint8Array(Buffer.from(m[1] ?? '', 'base64'));
  if (bytes.byteLength === 0 || bytes.byteLength > IMAGEM.maxBytes) return null;
  const mime = tipoRealDaImagem(bytes);
  if (!mime) return null;
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

/** Outro contato VIVO com este nome? Arquivado não conta: o nome dele ficou livre. */
async function nomeEmUso(
  tx: TransacaoPipe,
  tenantId: string,
  nome: string,
  excetoId?: string,
): Promise<boolean> {
  const [conflito] = await tx
    .select({ id: fluxo.id })
    .from(fluxo)
    .where(
      and(
        eq(fluxo.tenantId, tenantId),
        eq(fluxo.nome, nome),
        ne(fluxo.estado, 'arquivado'),
        excetoId ? ne(fluxo.id, excetoId) : undefined,
      ),
    )
    .limit(1);
  return conflito !== undefined;
}

function conflitoDeNome(): ErroPipe {
  /* "Experimente usar outro nome" é o `errorMsg.1` da origem, literal. */
  return ErroPipe.conflito(
    'nome_em_uso',
    'Já existe um fluxo com este nome. Experimente usar outro nome.',
  );
}

const ator = (usuarioId: string): Ator => ({ tipo: 'usuario', id: usuarioId });

/* ------------------------------------------------------------- Gestos */

/** `create`: autoriza, valida, grava. A foto inválida é engolida, como lá. */
export async function criarFluxo(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  pedido: PedidoDeCriacao,
): Promise<{ id: string }> {
  await exigirPermissao(tx, usuarioId, EDITAR_FLUXO);
  const nome = nomeConferido(pedido.nome);
  const tipo = pedido.tipo === 'roteador' ? 'roteador' : 'fluxo';
  const imagemUrl = pedido.imagem ? imagemDosBytes(pedido.imagem) : null;

  if (await nomeEmUso(tx, tenantId, nome)) throw conflitoDeNome();
  const [criado] = await tx
    .insert(fluxo)
    .values({ tenantId, nome, tipo, shortName: nomeCurto(nome), imagemUrl })
    .returning({ id: fluxo.id });
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
async function fluxoVivo(tx: TransacaoPipe, tenantId: string, id: string) {
  const [atual] = await tx
    .select({
      id: fluxo.id,
      nome: fluxo.nome,
      tipo: fluxo.tipo,
      estado: fluxo.estado,
      canalId: fluxo.canalId,
      descricao: fluxo.descricao,
      imagemUrl: fluxo.imagemUrl,
      shortName: fluxo.shortName,
    })
    .from(fluxo)
    .where(and(eq(fluxo.tenantId, tenantId), eq(fluxo.id, id), ne(fluxo.estado, 'arquivado')))
    .limit(1);
  if (!atual) throw ErroPipe.naoEncontrado('fluxo');
  return atual;
}

/** `update`: só o que veio. Nada mudou, nada é gravado — nem no log. */
export async function editarFluxo(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  id: string,
  pedido: PedidoDeEdicao,
): Promise<FluxoGravado> {
  const atual = await fluxoVivo(tx, tenantId, id);
  await exigirPermissao(tx, usuarioId, EDITAR_FLUXO);

  const antes = {
    nome: atual.nome,
    descricao: atual.descricao,
    imagemUrl: atual.imagemUrl,
    shortName: atual.shortName,
  };
  const depois = { ...antes };

  if (pedido.nome !== undefined) {
    depois.nome = nomeConferido(pedido.nome);
    depois.shortName = nomeCurto(depois.nome);
  }
  if (pedido.descricao !== undefined) depois.descricao = descricaoConferida(pedido.descricao);
  if (pedido.imagem !== undefined) {
    if (pedido.imagem === null) {
      depois.imagemUrl = null;
    } else {
      const lida = imagemDosBytes(pedido.imagem);
      if (!lida) {
        const tipos = IMAGEM.aceitos.join(', ');
        const teto = Math.round(IMAGEM.maxBytes / 1024);
        throw ErroPipe.requisicao(
          'imagem_invalida',
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
    .update(fluxo)
    .set({ ...depois, atualizadoEm: new Date() })
    .where(and(eq(fluxo.tenantId, tenantId), eq(fluxo.id, atual.id)))
    .returning({
      id: fluxo.id,
      nome: fluxo.nome,
      descricao: fluxo.descricao,
      imagemUrl: fluxo.imagemUrl,
      shortName: fluxo.shortName,
    });
  if (!gravado) throw ErroPipe.naoEncontrado('fluxo');

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
export async function excluirFluxo(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  id: string,
): Promise<void> {
  const atual = await fluxoVivo(tx, tenantId, id);
  await exigirPermissao(tx, usuarioId, EXCLUIR_FLUXO);

  await tx
    .update(fluxo)
    .set({ estado: 'arquivado', atualizadoEm: new Date() })
    .where(and(eq(fluxo.tenantId, tenantId), eq(fluxo.id, atual.id)));

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'excluiu',
    objetoTipo: 'fluxo',
    objetoId: atual.id,
    antes: { nome: atual.nome, tipo: atual.tipo, estado: atual.estado, canalId: atual.canalId },
    depois: { estado: 'arquivado' },
  });
}
