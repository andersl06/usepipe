import { dataIso } from './formato';

/**
 * Atalhos de período — os rótulos exatos do campo "Período" do painel de
 * filtros deles (`referencias-blip/portal/dom/history.html`: Hoje, Ontem, Últimos
 * 7/15/30/60/90/120/180 dias, Personalizado). O mesmo `bds-select` aparece
 * no Histórico (`last30days`) e nos Relatórios de atendimento (`last7days`)
 * e de satisfação (`last30days`). "Personalizado" é o nosso par de datas de
 * sempre; os outros só calculam `de`/`ate`.
 */
export const PERIODOS = [
  { chave: 'hoje', rotulo: 'Hoje' },
  { chave: 'ontem', rotulo: 'Ontem' },
  { chave: '7', rotulo: 'Últimos 7 dias' },
  { chave: '15', rotulo: 'Últimos 15 dias' },
  { chave: '30', rotulo: 'Últimos 30 dias' },
  { chave: '60', rotulo: 'Últimos 60 dias' },
  { chave: '90', rotulo: 'Últimos 90 dias' },
  { chave: '120', rotulo: 'Últimos 120 dias' },
  { chave: '180', rotulo: 'Últimos 180 dias' },
] as const;

export function calcularPeriod(
  key: string,
  fuso: string,
): { de: string; ate: string } | undefined {
  const agora = new Date();
  const hoje = dataIso(agora, fuso);
  if (key === 'hoje') return { de: hoje, ate: hoje };
  if (key === 'ontem') {
    const ontem = dataIso(new Date(agora.getTime() - 86_400_000), fuso);
    return { de: ontem, ate: ontem };
  }
  const dias = Number(key);
  if (!Number.isInteger(dias)) return undefined;
  const inicio = dataIso(new Date(agora.getTime() - (dias - 1) * 86_400_000), fuso);
  return { de: inicio, ate: hoje };
}

/** Qual atalho corresponde ao `de`/`ate` atuais, se algum — senão, "personalizado". */
export function periodCurrent(de: string, ate: string, fuso: string): string {
  const achado = PERIODOS.find((p) => {
    const calc = calcularPeriod(p.chave, fuso);
    return calc !== undefined && calc.de === de && calc.ate === ate;
  });
  return achado?.chave ?? 'personalizado';
}

export function periodRotulo(key: string): string {
  return PERIODOS.find((p) => p.chave === key)?.rotulo ?? 'Personalizado';
}
