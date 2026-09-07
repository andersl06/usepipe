/**
 * A escala da pesquisa — §6 da spec de métricas.
 *
 * Existem dois modelos incompatíveis no mercado, e a Blip convive com os dois
 * sem unificar. O Pipe suporta os dois, mas exige que o tenant **escolha um por
 * pesquisa** e guarda a escala junto da resposta. Sem isso, um 4 de CSAT e um 4
 * de NPS acabam somados no mesmo gráfico.
 *
 * O tipo é que manda: a escala não é digitável na tela de configuração, é
 * consequência dele. Escala editável à mão é como aparece um "CSAT de 0 a 10"
 * que nenhum relatório sabe classificar.
 *
 * Módulo puro — é o cartão de configuração (`'use client'`) que o importa.
 */

export const TIPOS_DE_PESQUISA = ['csat', 'nps'] as const;
export type TipoDePesquisa = (typeof TIPOS_DE_PESQUISA)[number];

export interface EscalaDePesquisa {
  min: number;
  max: number;
  /** Fronteiras da §6, em texto, para a tela não repetir o número à mão. */
  faixas: string;
}

export const ESCALA_POR_TIPO: Record<TipoDePesquisa, EscalaDePesquisa> = {
  csat: { min: 1, max: 5, faixas: 'detrator 1–2 · neutro 3 · promotor 4–5' },
  nps: { min: 0, max: 10, faixas: 'detrator 0–6 · neutro 7–8 · promotor 9–10' },
};

export const ROTULO_TIPO_PESQUISA: Record<TipoDePesquisa, string> = {
  csat: 'CSAT — satisfação, 1 a 5',
  nps: 'NPS — recomendação, 0 a 10',
};

export function tipoDePesquisaValido(bruto: string): bruto is TipoDePesquisa {
  return (TIPOS_DE_PESQUISA as readonly string[]).includes(bruto);
}

/** Quando a pesquisa é disparada. O banco aceita texto livre; a tela, estes três. */
export const DISPAROS_DE_PESQUISA = ['encerramento', 'primeira_resposta', 'manual'] as const;
export type DisparoDePesquisa = (typeof DISPAROS_DE_PESQUISA)[number];

export const ROTULO_DISPARO: Record<DisparoDePesquisa, string> = {
  encerramento: 'Ao encerrar a conversa',
  primeira_resposta: 'Depois da primeira resposta',
  manual: 'Só quando o atendente pedir',
};

export function disparoValido(bruto: string): bruto is DisparoDePesquisa {
  return (DISPAROS_DE_PESQUISA as readonly string[]).includes(bruto);
}

/**
 * A classe de uma nota, na escala do próprio tipo.
 *
 * Vive aqui, e não em `satisfacao.ts`, porque `satisfacao.ts` LÊ a classe que o
 * banco gravou junto da resposta — é o retrato histórico. Esta função é o que a
 * tela de configuração usa para mostrar, antes de salvar, o que cada nota vai
 * significar. Duas funções, dois momentos, e nenhuma reclassifica o passado.
 */
export function classeDaNota(tipo: TipoDePesquisa, nota: number): string | null {
  const escala = ESCALA_POR_TIPO[tipo];
  if (!Number.isFinite(nota) || nota < escala.min || nota > escala.max) return null;
  if (tipo === 'csat') return nota <= 2 ? 'detrator' : nota === 3 ? 'neutro' : 'promotor';
  return nota <= 6 ? 'detrator' : nota <= 8 ? 'neutro' : 'promotor';
}
