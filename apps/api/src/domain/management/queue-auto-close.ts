import { and, eq } from 'drizzle-orm';
import { queue } from '@pipe/db/schema';
import { diferenca, registrarAuditoria } from '@pipe/db';
import type { Ator, TransactionPipe } from '@pipe/db';
import { PipeError } from '../../errors.js';
import { requirePermission } from '../../session.js';
import { QUEUE_MANAGE, requireQueueOfFlow } from './registrations.js';

/** Tags da fila e configuração de encerramento automático por inatividade (colunas `etiquetas` e `encerramento_automatico`). */

export const TAGS_MAX = 30;
export const TAG_LENGTH_MAX = 40;
export const ALERT_MESSAGE_MAX = 1000;
/** Limite superior da inatividade: 30 dias. */
export const INACTIVITY_MAX_MINUTES = 43_200;

export type UnitOfTime = 'minutos' | 'horas';

export interface AutoCloseConfig {
  ativo: boolean;
  tempo: number;
  unidade: UnitOfTime;
  soSePrimeiroAtendimento: boolean;
  naoSeAguardandoAtendente: boolean;
  removerDaTela: boolean;
  alerta: { ativo: boolean; mensagem: string; antecedencia: number; unidade: UnitOfTime };
  tags: { ativo: boolean; tags: string[] };
}

export function toMinutes(valor: number, unidade: UnitOfTime): number {
  return unidade === 'horas' ? valor * 60 : valor;
}

const invalido = (codigo: string, mensagem: string) => PipeError.request(codigo, mensagem);

/** Texto puro: sem HTML nem caracteres de controle, espaços colapsados. */
function plainText(bruto: unknown, codigo: string, rotulo: string, max: number): string {
  if (typeof bruto !== 'string') throw invalido(codigo, `${rotulo} deve ser um texto.`);
  // eslint-disable-next-line no-control-regex
  if (/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(bruto)) {
    throw invalido(codigo, `${rotulo} não pode ter HTML nem caracteres de controle.`);
  }
  const texto = bruto.replace(/\s+/g, ' ').trim();
  if (texto.length > max) throw invalido(codigo, `${rotulo} aceita no máximo ${max} caracteres.`);
  return texto;
}

export function tagsChecked(bruto: unknown, codigo = 'tags_invalid'): string[] {
  if (!Array.isArray(bruto)) throw invalido(codigo, 'Informe a lista de tags.');
  if (bruto.length > TAGS_MAX) throw invalido(codigo, `Use no máximo ${TAGS_MAX} tags.`);
  const vistas = new Set<string>();
  const resultado: string[] = [];
  for (const item of bruto) {
    const tag = plainText(item, codigo, 'A tag', TAG_LENGTH_MAX);
    if (!tag) throw invalido(codigo, 'Tag vazia não é permitida.');
    const chave = tag.toLocaleLowerCase('pt-BR');
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    resultado.push(tag);
  }
  return resultado;
}

function flag(bruto: unknown, nome: string): boolean {
  if (typeof bruto !== 'boolean') throw invalido('auto_close_invalid', `"${nome}" deve ser verdadeiro ou falso.`);
  return bruto;
}

function unit(bruto: unknown, nome: string): UnitOfTime {
  if (bruto !== 'minutos' && bruto !== 'horas') {
    throw invalido('auto_close_invalid', `A unidade de "${nome}" deve ser minutos ou horas.`);
  }
  return bruto;
}

function amount(bruto: unknown, unidade: UnitOfTime, nome: string): number {
  if (typeof bruto !== 'number' || !Number.isInteger(bruto) || bruto <= 0) {
    throw invalido('auto_close_invalid', `${nome} deve ser um número inteiro maior que 0.`);
  }
  if (toMinutes(bruto, unidade) > INACTIVITY_MAX_MINUTES) {
    throw invalido('auto_close_invalid', `${nome} aceita no máximo 30 dias.`);
  }
  return bruto;
}

/** Valida e normaliza a configuração; campos desconhecidos são descartados. */
export function autoCloseChecked(bruto: unknown): AutoCloseConfig {
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) {
    throw invalido('auto_close_invalid', 'Configuração de encerramento inválida.');
  }
  const c = bruto as Record<string, unknown>;
  const alertaBruto = (c['alerta'] ?? {}) as Record<string, unknown>;
  const tagsBruto = (c['tags'] ?? {}) as Record<string, unknown>;
  if (typeof alertaBruto !== 'object' || typeof tagsBruto !== 'object') {
    throw invalido('auto_close_invalid', 'Configuração de encerramento inválida.');
  }

  const unidade = unit(c['unidade'], 'Tempo de inatividade');
  const tempo = amount(c['tempo'], unidade, 'O tempo de inatividade');

  const alertaAtivo = flag(alertaBruto['ativo'] ?? false, 'alerta.ativo');
  const alertaUnidade = unit(alertaBruto['unidade'] ?? 'minutos', 'alerta');
  let mensagem = plainText(alertaBruto['mensagem'] ?? '', 'auto_close_invalid', 'A mensagem do alerta', ALERT_MESSAGE_MAX);
  let antecedencia = 1;
  if (alertaAtivo) {
    if (!mensagem) throw invalido('auto_close_invalid', 'É necessário informar uma mensagem.');
    antecedencia = amount(alertaBruto['antecedencia'], alertaUnidade, 'O tempo antes do encerramento');
    if (toMinutes(antecedencia, alertaUnidade) >= toMinutes(tempo, unidade)) {
      throw invalido('auto_close_invalid', 'Esse valor não pode ser maior que o tempo de inatividade.');
    }
  } else {
    mensagem = '';
  }

  const tagsAtivo = flag(tagsBruto['ativo'] ?? false, 'tags.ativo');
  const tags = tagsAtivo ? tagsChecked(tagsBruto['tags'] ?? [], 'auto_close_invalid') : [];
  if (tagsAtivo && tags.length === 0) {
    throw invalido('auto_close_invalid', 'Informe ao menos uma tag de encerramento.');
  }

  return {
    ativo: flag(c['ativo'], 'ativo'),
    tempo,
    unidade,
    soSePrimeiroAtendimento: flag(c['soSePrimeiroAtendimento'] ?? false, 'soSePrimeiroAtendimento'),
    naoSeAguardandoAtendente: flag(c['naoSeAguardandoAtendente'] ?? false, 'naoSeAguardandoAtendente'),
    removerDaTela: flag(c['removerDaTela'] ?? false, 'removerDaTela'),
    alerta: { ativo: alertaAtivo, mensagem, antecedencia, unidade: alertaUnidade },
    tags: { ativo: tagsAtivo, tags },
  };
}

const ator = (usuarioId: string): Ator => ({ type: 'usuario', id: usuarioId });

async function writeConfig(
  tx: TransactionPipe,
  tid: string,
  flowId: string,
  usuarioId: string,
  queueId: string,
  campo: 'etiquetas' | 'encerramentoAutomatico',
  valor: string[] | AutoCloseConfig,
): Promise<void> {
  await requireQueueOfFlow(tx, tid, flowId, queueId);
  await requirePermission(tx, usuarioId, QUEUE_MANAGE);
  const [antes] = await tx
    .select({ etiquetas: queue.etiquetas, encerramentoAutomatico: queue.encerramentoAutomatico })
    .from(queue)
    .where(and(eq(queue.tenantId, tid), eq(queue.flowId, flowId), eq(queue.id, queueId)))
    .limit(1);
  if (!antes) throw PipeError.naoEncontrado('Fila');

  const [gravada] = await tx
    .update(queue)
    .set({ [campo]: valor, atualizadoEm: new Date() })
    .where(and(eq(queue.tenantId, tid), eq(queue.flowId, flowId), eq(queue.id, queueId)))
    .returning({ id: queue.id });
  if (!gravada) throw PipeError.naoEncontrado('Fila');

  const mudanca = diferenca({ [campo]: antes[campo] }, { [campo]: valor });
  if (Object.keys(mudanca.depois).length === 0) return;
  await registrarAuditoria(tx, tid, {
    ator: ator(usuarioId),
    acao: 'alterou',
    objetoTipo: 'fila',
    objetoId: queueId,
    antes: mudanca.antes,
    depois: mudanca.depois,
  });
}

export async function saveQueueTags(
  tx: TransactionPipe,
  tid: string,
  flowId: string,
  usuarioId: string,
  queueId: string,
  bruto: unknown,
): Promise<{ tags: string[] }> {
  const tags = tagsChecked(bruto);
  await writeConfig(tx, tid, flowId, usuarioId, queueId, 'etiquetas', tags);
  return { tags };
}

export async function saveAutoClose(
  tx: TransactionPipe,
  tid: string,
  flowId: string,
  usuarioId: string,
  queueId: string,
  bruto: unknown,
): Promise<AutoCloseConfig> {
  const config = autoCloseChecked(bruto);
  await writeConfig(tx, tid, flowId, usuarioId, queueId, 'encerramentoAutomatico', config);
  return config;
}
