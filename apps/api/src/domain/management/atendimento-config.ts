import { sql } from 'drizzle-orm';
import { registrarAuditoria } from '@pipe/db';
import type { TransactionPipe } from '@pipe/db';
import { PipeError } from '../../errors.js';
import { requirePermission } from '../../session.js';
import { autoCloseChecked } from './queue-auto-close.js';
import type { AutoCloseConfig } from './queue-auto-close.js';

/**
 * Preferências globais do atendimento (Configurações gerais), um documento por tenant em
 * `tenant.configuracao_atendimento`. Só entram aqui as preferências que alguma parte do sistema lê;
 * as demais seções da página seguem desabilitadas. O que não foi gravado vale o padrão, que preserva
 * o comportamento anterior à existência da configuração. A fila vence a global no encerramento
 * automático.
 */
export const CONFIG_PERMISSION = 'tenant.configurar';

export const MODOS_DE_DISTRIBUICAO = ['menos_ativos', 'mais_tempo_sem_receber'] as const;
export type ModoDeDistribuicao = (typeof MODOS_DE_DISTRIBUICAO)[number];

/** Teto do disparo de mensagens ativas na Blip; a configuração só pode reduzi-lo. */
export const LIMITE_DISPARO_MAX = 15;
export const ATENDIMENTOS_POR_ATENDENTE_MAX = 500;

export interface ConfigAtendimento {
  modoEspera: { ativo: boolean };
  encerramentoAutomatico: AutoCloseConfig | null;
  distribuicao: {
    modo: ModoDeDistribuicao;
    /** 0 desliga o limite global; a capacidade da fila continua valendo. */
    atendimentosPorAtendente: number;
    bloquearSolicitacaoManual: boolean;
  };
  transferencia: { habilitada: boolean; atendentesEspecificos: boolean; offline: boolean };
  midia: { audio: boolean; emoji: boolean; arquivos: boolean };
  esconderAguardando: { ativo: boolean };
  historico: { ativo: boolean };
  mensagensAtivas: { ativo: boolean; limitePorDisparo: number };
}

export type SecaoDeAtendimento = keyof ConfigAtendimento;

export const CONFIG_PADRAO: ConfigAtendimento = {
  modoEspera: { ativo: true },
  encerramentoAutomatico: null,
  distribuicao: { modo: 'menos_ativos', atendimentosPorAtendente: 0, bloquearSolicitacaoManual: false },
  transferencia: { habilitada: true, atendentesEspecificos: true, offline: true },
  midia: { audio: true, emoji: true, arquivos: true },
  esconderAguardando: { ativo: false },
  historico: { ativo: true },
  mensagensAtivas: { ativo: true, limitePorDisparo: LIMITE_DISPARO_MAX },
};

const invalido = (codigo: string, mensagem: string) => PipeError.request(codigo, mensagem);

function objeto(bruto: unknown, secao: string): Record<string, unknown> {
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) {
    throw invalido('config_invalid', `A seção "${secao}" deve ser um objeto.`);
  }
  return bruto as Record<string, unknown>;
}

/** Seção completa: exatamente as chaves esperadas, nem a mais nem a menos. */
function chavesExatas(o: Record<string, unknown>, secao: string, esperadas: readonly string[]): void {
  const extra = Object.keys(o).find((k) => !esperadas.includes(k));
  if (extra) throw invalido('config_key_unknown', `A chave "${extra}" não existe na seção "${secao}".`);
  const falta = esperadas.find((k) => !(k in o));
  if (falta) throw invalido('config_key_missing', `A seção "${secao}" precisa da chave "${falta}".`);
}

function booleano(o: Record<string, unknown>, secao: string, chave: string): boolean {
  const v = o[chave];
  if (typeof v !== 'boolean') {
    throw invalido('config_invalid', `"${secao}.${chave}" deve ser verdadeiro ou falso.`);
  }
  return v;
}

function inteiro(o: Record<string, unknown>, secao: string, chave: string, min: number, max: number): number {
  const v = o[chave];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw invalido('config_invalid', `"${secao}.${chave}" deve ser um inteiro de ${min} a ${max}.`);
  }
  return v;
}

const VALIDADORES: { [K in SecaoDeAtendimento]: (bruto: unknown) => ConfigAtendimento[K] } = {
  modoEspera: (bruto) => {
    const o = objeto(bruto, 'modoEspera');
    chavesExatas(o, 'modoEspera', ['ativo']);
    return { ativo: booleano(o, 'modoEspera', 'ativo') };
  },
  encerramentoAutomatico: (bruto) => {
    if (bruto === null) return null;
    const o = objeto(bruto, 'encerramentoAutomatico');
    const permitidas = ['ativo', 'tempo', 'unidade', 'soSePrimeiroAtendimento', 'naoSeAguardandoAtendente', 'removerDaTela', 'alerta', 'tags'];
    const extra = Object.keys(o).find((k) => !permitidas.includes(k));
    if (extra) throw invalido('config_key_unknown', `A chave "${extra}" não existe na seção "encerramentoAutomatico".`);
    return autoCloseChecked(o);
  },
  distribuicao: (bruto) => {
    const o = objeto(bruto, 'distribuicao');
    chavesExatas(o, 'distribuicao', ['modo', 'atendimentosPorAtendente', 'bloquearSolicitacaoManual']);
    if (!(MODOS_DE_DISTRIBUICAO as readonly unknown[]).includes(o['modo'])) {
      throw invalido('config_invalid', 'O modo de distribuição não é conhecido.');
    }
    return {
      modo: o['modo'] as ModoDeDistribuicao,
      atendimentosPorAtendente: inteiro(o, 'distribuicao', 'atendimentosPorAtendente', 0, ATENDIMENTOS_POR_ATENDENTE_MAX),
      bloquearSolicitacaoManual: booleano(o, 'distribuicao', 'bloquearSolicitacaoManual'),
    };
  },
  transferencia: (bruto) => {
    const o = objeto(bruto, 'transferencia');
    chavesExatas(o, 'transferencia', ['habilitada', 'atendentesEspecificos', 'offline']);
    return {
      habilitada: booleano(o, 'transferencia', 'habilitada'),
      atendentesEspecificos: booleano(o, 'transferencia', 'atendentesEspecificos'),
      offline: booleano(o, 'transferencia', 'offline'),
    };
  },
  midia: (bruto) => {
    const o = objeto(bruto, 'midia');
    chavesExatas(o, 'midia', ['audio', 'emoji', 'arquivos']);
    return { audio: booleano(o, 'midia', 'audio'), emoji: booleano(o, 'midia', 'emoji'), arquivos: booleano(o, 'midia', 'arquivos') };
  },
  esconderAguardando: (bruto) => {
    const o = objeto(bruto, 'esconderAguardando');
    chavesExatas(o, 'esconderAguardando', ['ativo']);
    return { ativo: booleano(o, 'esconderAguardando', 'ativo') };
  },
  historico: (bruto) => {
    const o = objeto(bruto, 'historico');
    chavesExatas(o, 'historico', ['ativo']);
    return { ativo: booleano(o, 'historico', 'ativo') };
  },
  mensagensAtivas: (bruto) => {
    const o = objeto(bruto, 'mensagensAtivas');
    chavesExatas(o, 'mensagensAtivas', ['ativo', 'limitePorDisparo']);
    return {
      ativo: booleano(o, 'mensagensAtivas', 'ativo'),
      limitePorDisparo: inteiro(o, 'mensagensAtivas', 'limitePorDisparo', 1, LIMITE_DISPARO_MAX),
    };
  },
};

/**
 * Valida um pedido de gravação: um objeto não vazio cujas chaves são seções conhecidas, cada uma
 * completa. Seção ou chave desconhecida é recusada (nada é descartado em silêncio).
 */
export function pedidoValidado(bruto: unknown): Partial<ConfigAtendimento> {
  const o = objeto(bruto, 'configuração');
  const nomes = Object.keys(o);
  if (nomes.length === 0) throw invalido('config_empty', 'Informe ao menos uma seção.');
  const saida: Record<string, unknown> = {};
  for (const nome of nomes) {
    if (!(nome in VALIDADORES)) throw invalido('config_section_unknown', `A seção "${nome}" não existe.`);
    saida[nome] = VALIDADORES[nome as SecaoDeAtendimento](o[nome]);
  }
  return saida as Partial<ConfigAtendimento>;
}

/**
 * Lê o documento gravado e completa com os padrões, seção por seção. Seção gravada que não passa mais
 * na validação (versão antiga, edição direta) cai no padrão em vez de derrubar o consumidor.
 */
export function comPadroes(gravado: unknown): ConfigAtendimento {
  const base: Record<string, unknown> = { ...CONFIG_PADRAO };
  if (typeof gravado === 'object' && gravado !== null && !Array.isArray(gravado)) {
    for (const [nome, valor] of Object.entries(gravado as Record<string, unknown>)) {
      if (!(nome in VALIDADORES)) continue;
      try {
        base[nome] = VALIDADORES[nome as SecaoDeAtendimento](valor);
      } catch {
        /* fica o padrão */
      }
    }
  }
  return base as unknown as ConfigAtendimento;
}

export async function lerConfigAtendimento(tx: TransactionPipe, tenantId: string): Promise<ConfigAtendimento> {
  const { rows } = await tx.execute<{ c: unknown }>(sql`
    select configuracao_atendimento as c from tenant where id = ${tenantId}::uuid
  `);
  return comPadroes(rows[0]?.c);
}

/** Grava as seções informadas (as outras ficam como estão) e audita o antes e o depois. */
export async function gravarConfigAtendimento(
  tx: TransactionPipe,
  tenantId: string,
  usuarioId: string,
  bruto: unknown,
): Promise<ConfigAtendimento> {
  await requirePermission(tx, usuarioId, CONFIG_PERMISSION);
  const pedido = pedidoValidado(bruto);
  const { rows } = await tx.execute<{ c: unknown }>(sql`
    select configuracao_atendimento as c from tenant where id = ${tenantId}::uuid for update
  `);
  if (!rows[0]) throw PipeError.naoEncontrado('tenant');
  const antes = comPadroes(rows[0].c);
  const novoDocumento = { ...(rows[0].c as Record<string, unknown>), ...pedido };
  await tx.execute(sql`
    update tenant set configuracao_atendimento = ${JSON.stringify(novoDocumento)}::jsonb, atualizado_em = now()
     where id = ${tenantId}::uuid
  `);
  const depois = comPadroes(novoDocumento);
  const secoes = Object.keys(pedido) as SecaoDeAtendimento[];
  await registrarAuditoria(tx, tenantId, {
    ator: { type: 'usuario', id: usuarioId },
    acao: 'alterou',
    objetoTipo: 'tenant',
    objetoId: tenantId,
    antes: Object.fromEntries(secoes.map((s) => [s, antes[s]])),
    depois: Object.fromEntries(secoes.map((s) => [s, depois[s]])),
  });
  return depois;
}
