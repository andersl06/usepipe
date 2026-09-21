import { and, asc, eq, ne } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import type { Ator, TransacaoPipe } from '@pipe/db';
import { canal, fluxo } from '@pipe/db/schema';
import type { CanalDoFluxo, CanalDoFluxoNaTela } from '@pipe/contracts';
import { ErroPipe } from '../../erros.js';
import { identificadorDoCanal } from '../gestao-fluxo.js';
import { exigirPermissaoNoFluxo } from './equipe-do-fluxo.js';

/**
 * Ligar e desligar o canal DO BOT — o que a página
 * `/application/detail/{bot}/channels/{canal}` da origem faz por trás do
 * "Ativar número" (`FICHA-conectar-canal-no-bot.md` §2 e §4).
 *
 * `fluxo.canal_id` era só LIDO pela `api` (`fluxoPublicadoDoCanal`); os
 * testes ligavam por SQL e a tela não tinha como. Aqui é o gesto de escrita,
 * com as regras que a origem mostra:
 *
 * - **o canal é do bot**: a permissão é `channels.escrever` NESTE fluxo (a
 *   linha "Canais" da lista de permissões por bot), ou a equivalente da conta
 *   — `exigirPermissaoNoFluxo`;
 * - **um bot por número**: ligar um canal que já está com outro bot vivo é
 *   recusado — "Ops… Este número já está em uso / Para ativar o número neste
 *   bot, remova do anterior e tente novamente." (`errorMsg.phoneNumberIsAlreadyConnected`).
 *   A origem não transfere; quem quer trocar desliga no bot antigo antes. O
 *   `detalhe` diz QUAL bot está com ele — acréscimo do Pipe, para a tela
 *   apontar o caminho;
 * - **canal inativo não liga** (409): desconectado aqui, ele não recebe
 *   mensagem; ligar um bot a ele seria ligar a nada.
 *
 * Decisão Pipe (não está na origem): `fluxo.canal_id` é UMA coluna, então um
 * bot tem UM canal. Na origem um bot tem WhatsApp + Messenger + Instagram ao
 * mesmo tempo. Ligar um segundo canal a um bot que já tem outro é recusado
 * (409 `fluxo_ja_tem_canal`) em vez de trocar por baixo dos panos — a tela do
 * WhatsApp não pode desligar o Instagram sem avisar.
 */

const CONECTAR_CANAL = 'channels.escrever';

const ator = (usuarioId: string): Ator => ({ tipo: 'usuario', id: usuarioId });

/** O contato vivo do tenant, ou 404 — o `fetch_inbox` de `ciclo-de-vida-do-fluxo.ts`. */
async function fluxoVivo(tx: TransacaoPipe, tenantId: string, fluxoId: string) {
  const [atual] = await tx
    .select({ id: fluxo.id, nome: fluxo.nome, canalId: fluxo.canalId })
    .from(fluxo)
    .where(and(eq(fluxo.tenantId, tenantId), eq(fluxo.id, fluxoId), ne(fluxo.estado, 'arquivado')))
    .limit(1);
  if (!atual) throw ErroPipe.naoEncontrado('fluxo');
  return atual;
}

const COLUNAS = {
  id: canal.id,
  tipo: canal.tipo,
  nome: canal.nome,
  numero: identificadorDoCanal,
  ativo: canal.ativo,
};

/** O bot VIVO que está com o canal, se houver — arquivado não segura número. */
async function botDoCanal(
  tx: TransacaoPipe,
  tenantId: string,
  canalId: string,
): Promise<{ id: string; nome: string } | null> {
  const [linha] = await tx
    .select({ id: fluxo.id, nome: fluxo.nome })
    .from(fluxo)
    .where(and(eq(fluxo.tenantId, tenantId), eq(fluxo.canalId, canalId), ne(fluxo.estado, 'arquivado')))
    .orderBy(asc(fluxo.criadoEm))
    .limit(1);
  return linha ?? null;
}

/** Um canal DESTE tenant, ou 404. O tenant vem da sessão, nunca do corpo. */
async function canalDoTenant(tx: TransacaoPipe, tenantId: string, canalId: string) {
  const [linha] = await tx
    .select(COLUNAS)
    .from(canal)
    .where(and(eq(canal.tenantId, tenantId), eq(canal.id, canalId)))
    .limit(1);
  if (!linha) throw ErroPipe.naoEncontrado('canal');
  return linha;
}

async function paraContrato(
  tx: TransacaoPipe,
  tenantId: string,
  linha: { id: string; tipo: string; nome: string; numero: string | null; ativo: boolean },
): Promise<CanalDoFluxo> {
  const bot = await botDoCanal(tx, tenantId, linha.id);
  return { ...linha, fluxoId: bot?.id ?? null, fluxoNome: bot?.nome ?? null };
}

/* ------------------------------------------------------------------ Leitura */

/** O que a página do canal precisa: o canal deste bot e os que a conta tem para oferecer. */
export async function carregarCanalDoFluxoNaTela(
  tx: TransacaoPipe,
  tenantId: string,
  fluxoId: string,
): Promise<CanalDoFluxoNaTela> {
  const atual = await fluxoVivo(tx, tenantId, fluxoId);

  const linhas = await tx
    .select(COLUNAS)
    .from(canal)
    .where(and(eq(canal.tenantId, tenantId), eq(canal.ativo, true)))
    .orderBy(asc(canal.criadoEm));
  const disponiveis: CanalDoFluxo[] = [];
  for (const linha of linhas) disponiveis.push(await paraContrato(tx, tenantId, linha));

  let ligado: CanalDoFluxo | null = null;
  if (atual.canalId) {
    const canalId = atual.canalId;
    ligado =
      disponiveis.find((c) => c.id === canalId) ??
      (await paraContrato(tx, tenantId, await canalDoTenant(tx, tenantId, canalId)));
  }
  return { canal: ligado, disponiveis };
}

/* ------------------------------------------------------------------- Gestos */

/**
 * As três portas que um canal novo precisa atravessar ANTES de ser criado para
 * este bot (conexão manual com `fluxo_id`): o bot existe e é deste tenant, a
 * pessoa pode conectar canal nele, e ele ainda não tem canal. Assim a
 * credencial do cliente não é gravada para depois a ligação ser recusada.
 */
export async function conferirQuePodeLigar(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
): Promise<void> {
  const atual = await fluxoVivo(tx, tenantId, fluxoId);
  await exigirPermissaoNoFluxo(tx, usuarioId, fluxoId, CONECTAR_CANAL);
  if (atual.canalId) throw fluxoJaTemCanal(await canalDoTenant(tx, tenantId, atual.canalId));
}

function fluxoJaTemCanal(existente: { id: string; tipo: string; nome: string }): ErroPipe {
  return ErroPipe.conflito(
    'fluxo_ja_tem_canal',
    `Este bot já está conectado ao canal "${existente.nome}". Desconecte-o antes de conectar outro.`,
    { canalId: existente.id, canalTipo: existente.tipo, canalNome: existente.nome },
  );
}

/** "Ativar número": o canal passa a ser deste bot. Ligar o mesmo canal de novo não é erro. */
export async function ligarCanalAoFluxo(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  canalId: string,
): Promise<CanalDoFluxo> {
  const atual = await fluxoVivo(tx, tenantId, fluxoId);
  await exigirPermissaoNoFluxo(tx, usuarioId, fluxoId, CONECTAR_CANAL);
  const alvo = await canalDoTenant(tx, tenantId, canalId);

  if (atual.canalId === alvo.id) return paraContrato(tx, tenantId, alvo);
  if (!alvo.ativo) {
    throw ErroPipe.conflito(
      'canal_inativo',
      'Este canal está desconectado. Reconecte-o antes de ligá-lo a um bot.',
      { canalId: alvo.id },
    );
  }
  if (atual.canalId) throw fluxoJaTemCanal(await canalDoTenant(tx, tenantId, atual.canalId));

  const dono = await botDoCanal(tx, tenantId, alvo.id);
  if (dono) {
    /* O título e a mensagem são os da origem (`whatsapp.errorMsg.phoneNumberIsAlreadyConnected`). */
    throw ErroPipe.conflito(
      'numero_em_uso',
      'Ops… Este número já está em uso. Para ativar o número neste bot, remova do anterior e tente novamente.',
      { fluxoId: dono.id, fluxoNome: dono.nome },
    );
  }

  await tx
    .update(fluxo)
    .set({ canalId: alvo.id, atualizadoEm: new Date() })
    .where(and(eq(fluxo.tenantId, tenantId), eq(fluxo.id, atual.id)));

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'fluxo',
    objetoId: atual.id,
    antes: { canalId: null },
    depois: { canalId: alvo.id, canalTipo: alvo.tipo, canalNome: alvo.nome },
  });
  return { ...alvo, fluxoId: atual.id, fluxoNome: atual.nome };
}

/**
 * Desligar o canal DO BOT. O canal continua existindo e ativo — desconectar o
 * número em si (`DELETE /v1/canais/whatsapp/:id`) é outro gesto. Sem canal,
 * nada muda e nada é registrado.
 *
 * `motivo` é o "Por qual motivo você quer desconectar o …?" do modal da
 * origem (Instagram/Messenger, `FICHA-conectar-canal-no-bot.md` §3.3): lá vai
 * para a analítica deles; aqui fica no log de auditoria.
 */
export async function desligarCanalDoFluxo(
  tx: TransacaoPipe,
  tenantId: string,
  usuarioId: string,
  fluxoId: string,
  motivo?: string,
): Promise<void> {
  const atual = await fluxoVivo(tx, tenantId, fluxoId);
  await exigirPermissaoNoFluxo(tx, usuarioId, fluxoId, CONECTAR_CANAL);
  if (!atual.canalId) return;

  await tx
    .update(fluxo)
    .set({ canalId: null, atualizadoEm: new Date() })
    .where(and(eq(fluxo.tenantId, tenantId), eq(fluxo.id, atual.id)));

  await registrarAuditoria(tx, tenantId, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'fluxo',
    objetoId: atual.id,
    antes: { canalId: atual.canalId },
    depois: { canalId: null, ...(motivo ? { motivo } : {}) },
  });
}
