import type { RegraSlaConfigurada } from './settings';

/**
 * Regras puras da tela de SLA: a política (nome, filas, até três metas) que a pessoa vê e as linhas `regra_sla` que o servidor guarda (uma por meta e por escopo, todas com o mesmo nome). Sem JSX e sem `./api`, para rodar em `node --test`.
 */

/** O prazo máximo que o servidor aceita: uma semana. */
export const PRAZO_MAXIMO_SEG = 7 * 86_400;

export const UNIDADES_DE_TEMPO = [
  { valor: 'segundos', rotulo: 'Segundos', seg: 1 },
  { valor: 'minutos', rotulo: 'Minutos', seg: 60 },
  { valor: 'horas', rotulo: 'Horas', seg: 3600 },
  { valor: 'dias', rotulo: 'Dias', seg: 86_400 },
] as const;
export type UnidadeDeTempo = (typeof UNIDADES_DE_TEMPO)[number]['valor'];

export type MetaDaPolitica = 'espera_fila' | 'primeira_resposta' | 'resolucao';

export const METAS_DA_POLITICA: readonly {
  alvo: MetaDaPolitica;
  sigla: string;
  titulo: string;
  ajuda: string;
  campo: string;
}[] = [
  {
    alvo: 'espera_fila',
    sigla: 'TME',
    titulo: 'Tempo de espera (TME)',
    ajuda: 'Meta de tempo de espera do cliente após o transbordo',
    campo: 'Tempo máximo de espera',
  },
  {
    alvo: 'primeira_resposta',
    sigla: 'TMR1',
    titulo: 'Tempo de primeira resposta (TMR1)',
    ajuda: 'Meta de tempo que um cliente pode esperar para receber a primeira resposta de um atendente',
    campo: 'Tempo máximo de primeira resposta',
  },
  {
    alvo: 'resolucao',
    sigla: 'TMA',
    titulo: 'Tempo de atendimento (TMA)',
    ajuda: 'Meta de tempo para a conclusão de um atendimento',
    campo: 'Tempo máximo para atendimento',
  },
];

/** Sigla de cada alvo gravado, inclusive o que a tela não edita (`resposta`). */
const SIGLA_DO_ALVO: Record<string, string> = {
  espera_fila: 'TME',
  primeira_resposta: 'TMR1',
  resolucao: 'TMA',
  resposta: 'TMR',
};

export function paraSegundos(valor: number, unidade: UnidadeDeTempo): number {
  return valor * (UNIDADES_DE_TEMPO.find((u) => u.valor === unidade)?.seg ?? 1);
}

/** Maior unidade que divide o prazo sem sobra: 7200 s vira 2 horas, 90 s continua em segundos. */
export function melhorUnidade(seg: number): { valor: number; unidade: UnidadeDeTempo } {
  for (const u of [...UNIDADES_DE_TEMPO].reverse()) {
    if (seg >= u.seg && seg % u.seg === 0) return { valor: seg / u.seg, unidade: u.valor };
  }
  return { valor: seg, unidade: 'segundos' };
}

/** Texto curto de um prazo: "2 horas", "90 segundos". */
export function descreverPrazo(seg: number): string {
  const { valor, unidade } = melhorUnidade(seg);
  const rotulo = (UNIDADES_DE_TEMPO.find((u) => u.valor === unidade)?.rotulo ?? '').toLowerCase();
  return `${valor} ${valor === 1 ? rotulo.replace(/s$/, '') : rotulo}`;
}

export interface PoliticaSla {
  /** Id de uma das linhas: basta para o servidor achar a política inteira. */
  id: string;
  name: string;
  padrao: boolean;
  filas: { id: string; name: string }[];
  metas: { alvo: string; sigla: string; prazoSeg: number }[];
}

/** Junta as linhas que dividem o mesmo nome em uma política. A ordem das metas é a da tela (TME, TMR1, TMA, depois TMR). */
export function agruparPoliticas(regras: readonly RegraSlaConfigurada[]): PoliticaSla[] {
  const porNome = new Map<string, PoliticaSla>();
  for (const r of regras) {
    let p = porNome.get(r.name);
    if (!p) {
      p = { id: r.id, name: r.name, padrao: false, filas: [], metas: [] };
      porNome.set(r.name, p);
    }
    if (r.scopeType === 'tenant') p.padrao = true;
    else if (r.scopeId && !p.filas.some((f) => f.id === r.scopeId)) {
      p.filas.push({ id: r.scopeId, name: r.scopeName ?? 'fila removida' });
    }
    if (!p.metas.some((m) => m.alvo === r.target)) {
      p.metas.push({ alvo: r.target, sigla: SIGLA_DO_ALVO[r.target] ?? r.target, prazoSeg: r.deadlineSeg });
    }
  }
  const ordem = Object.keys(SIGLA_DO_ALVO);
  return [...porNome.values()].map((p) => ({
    ...p,
    filas: p.filas.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    metas: p.metas.sort((a, b) => ordem.indexOf(a.alvo) - ordem.indexOf(b.alvo)),
  }));
}

export interface MetaEmRascunho {
  ligada: boolean;
  /** Texto do campo numérico; vazio enquanto a pessoa não digitou. */
  valor: string;
  unidade: UnidadeDeTempo;
}

/** Erro do campo de tempo de uma meta ligada, ou `null` se estiver certo. */
export function erroDaMeta(meta: MetaEmRascunho): string | null {
  if (!meta.ligada) return null;
  const n = Number(meta.valor);
  if (meta.valor.trim() === '') return 'Campo obrigatório';
  if (!Number.isInteger(n) || n < 1) return 'Informe um número inteiro maior que zero';
  if (paraSegundos(n, meta.unidade) > PRAZO_MAXIMO_SEG) return 'O prazo máximo é de 7 dias';
  return null;
}

export interface PedidoDePolitica {
  name: string;
  padrao: boolean;
  queueIds: string[];
  metas: Partial<Record<MetaDaPolitica, number>>;
}

/** O corpo que o servidor espera, ou `null` enquanto o rascunho está incompleto (Salvar fica desabilitado). */
export function pedidoDePolitica(
  nome: string,
  padrao: boolean,
  queueIds: readonly string[],
  metas: Record<MetaDaPolitica, MetaEmRascunho>,
): PedidoDePolitica | null {
  const name = nome.trim();
  if (!name || name.length > 100) return null;
  if (!padrao && queueIds.length === 0) return null;
  const gravadas: PedidoDePolitica['metas'] = {};
  for (const { alvo } of METAS_DA_POLITICA) {
    const m = metas[alvo];
    if (!m.ligada) continue;
    if (erroDaMeta(m) !== null) return null;
    gravadas[alvo] = paraSegundos(Number(m.valor), m.unidade);
  }
  if (Object.keys(gravadas).length === 0) return null;
  return { name, padrao, queueIds: [...queueIds], metas: gravadas };
}
