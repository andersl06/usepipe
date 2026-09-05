/** Formatação da tela. Mesma régua da Gestão, para as três telas lerem igual. */

export function numero(valor: number | null | undefined, casas = 0): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

export function percentual(fracao: number | null | undefined): string {
  if (fracao === null || fracao === undefined || Number.isNaN(fracao)) return '—';
  return `${(fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
}

export function dinheiro(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

/** Soma de coluna do funil: `R$ 812 mil` cabe onde `R$ 812.400` não cabe. */
export function dinheiroCurto(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  if (Math.abs(valor) >= 1_000_000) return `R$ ${numero(valor / 1_000_000, 1)} mi`;
  if (Math.abs(valor) >= 1_000) return `R$ ${numero(valor / 1_000)} mil`;
  return dinheiro(valor);
}

export function dataHora(instante: Date | null | undefined, fuso: string): string {
  if (!instante) return '—';
  return instante.toLocaleString('pt-BR', {
    timeZone: fuso,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function data(instante: Date | null | undefined, fuso: string): string {
  if (!instante) return '—';
  return instante.toLocaleDateString('pt-BR', {
    timeZone: fuso,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** "há 4 min", "há 3 h", "ontem", "27/08" — a coluna de última atividade da listagem. */
export function desde(instante: Date | null | undefined, fuso: string, agora = new Date()): string {
  if (!instante) return '—';
  const seg = Math.max(0, Math.round((agora.getTime() - instante.getTime()) / 1000));
  if (seg < 60) return 'agora';
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `há ${Math.floor(seg / 3600)} h`;
  const dias = Math.floor(seg / 86400);
  if (dias === 1) return 'ontem';
  if (dias < 7) return `há ${dias} dias`;
  return data(instante, fuso);
}

/** Pontos da explicação do score: sinal explícito, porque a regra pode tirar ponto. */
export function pontos(valor: number): string {
  return valor >= 0 ? `+${valor}` : `−${Math.abs(valor)}`;
}

/**
 * A cor da faixa. Acima do corte de 60 é verde, entre 40 e 59 é âmbar, abaixo é
 * neutro: a mesma leitura do mockup, sem depender do nome que o tenant deu à faixa.
 */
export function classeDaFaixa(score: number | null): string {
  if (score === null) return 'pill q';
  if (score >= 60) return 'pill ok';
  if (score >= 40) return 'pill med';
  return 'pill q';
}
