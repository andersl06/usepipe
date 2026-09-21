import { COMPARACOES, ErroDeValidacao, ehUnaria, validarCondicao } from '@pipe/core';
import type { Comparacao, CondicaoBlip } from '@pipe/core';
import type { Bloco, SaidaDoEditor } from './modelo';
import { LIMITE_DE_SAIDAS, MENSAGENS, gerarId, semDestino } from './modelo';

/**
 * As condições — das saídas do bloco e das ações — com o vocabulário do
 * motor (`packages/core/src/fluxo/condicao.ts`) e os rótulos literais da aba
 * "Condições de saída" do editor da Blip (`builder-tabs-outputs` no pacote de
 * tradução pt-BR: `sources`, `comparisons`, `and`/`or`).
 *
 * O que o motor entende, e só isso, entra no seletor: fonte `input`
 * ("Resposta do usuário") e `context` ("Variável"); as treze comparações de
 * `COMPARACOES`, na ordem do enum; o operador `or`/`and` entre os valores.
 * `intent` e `entity` existem no editor da Blip mas o Pipe não tem provedor
 * de IA — uma condição dessas carregada de um fluxo importado aparece como
 * está, com o aviso, e não se cria outra.
 *
 * A ordem das saídas é a ordem de avaliação: o motor toma a primeira que casa
 * (`FlowManager.ProcessOutputsAsync`, portado em `gerenciador.ts`), e a saída
 * padrão só depois de todas. Por isso a lista tem "subir/descer".
 */

export const FONTES_DA_TELA = [
  { valor: 'input', rotulo: 'Resposta do usuário' },
  { valor: 'context', rotulo: 'Variável' },
] as const;

/** Rótulo de qualquer fonte, inclusive as que a tela não oferece. */
export const ROTULO_DA_FONTE: Record<string, string> = {
  input: 'Resposta do usuário',
  context: 'Variável',
  intent: 'Intenção identificada',
  entity: 'Entidade identificada',
};

export const ROTULO_DA_COMPARACAO: Record<Comparacao, string> = {
  equals: 'Igual a',
  notEquals: 'Diferente de',
  contains: 'Contém',
  startsWith: 'Começa com',
  endsWith: 'Termina com',
  greaterThan: 'Maior que',
  lessThan: 'Menor que',
  greaterThanOrEquals: 'Maior ou igual a',
  lessThanOrEquals: 'Menor ou igual a',
  matches: 'Corresponde à regex',
  approximateTo: 'Parecido com',
  exists: 'Existe',
  notExists: 'Não existe',
};

export const COMPARACOES_DA_TELA = COMPARACOES.map((valor) => ({
  valor,
  rotulo: ROTULO_DA_COMPARACAO[valor],
}));

export const OPERADORES_DA_TELA = [
  { valor: 'or', rotulo: 'OU' },
  { valor: 'and', rotulo: 'E' },
] as const;

export const ROTULOS_DAS_SAIDAS = {
  titulo: 'Condições de saída',
  info: 'Defina as regras e o bloco para o qual o usuário será direcionado',
  se: 'Se',
  condicao: 'Condição',
  irPara: 'Ir para',
  valores: 'Valores',
  nomeDaVariavel: 'Nome da variável',
  adicionar: '+ Adicionar condição de saída',
  saidaPadrao: 'Saída padrão',
  saidaPadraoInfo:
    'Defina para qual bloco o usuário será direcionado se nenhuma das condições forem cumpridas',
  saidasDeAtendimento: 'Saídas de atendimento',
  semSeta: 'A seta que liga os blocos não será exibida',
  direcionar: 'Direcionar para bloco',
  naoPreenchida: 'Definição de saída não preenchida',
} as const;

/** A comparação lida como o motor lê: sem diferenciar maiúscula, `equals` por padrão. */
export function comparacaoDe(c: CondicaoBlip): Comparacao {
  const bruta = (c.comparison ?? 'equals').toLowerCase();
  return COMPARACOES.find((x) => x.toLowerCase() === bruta) ?? 'equals';
}

export const fonteDe = (c: CondicaoBlip): string => (c.source ?? 'input').toLowerCase();

/** A condição que o "+" cria: resposta do usuário igual a… (o padrão do motor). */
export function novaCondicao(): CondicaoBlip {
  return { source: 'input', comparison: 'equals', values: [] };
}

/** Trocar a comparação limpa os valores quando ela deixa de precisar deles. */
export function comComparacao(c: CondicaoBlip, comparacao: Comparacao): CondicaoBlip {
  return ehUnaria(comparacao)
    ? { ...c, comparison: comparacao, values: [] }
    : { ...c, comparison: comparacao, values: c.values ?? [] };
}

/** Trocar a fonte tira o nome de variável quando ele deixa de fazer sentido. */
export function comFonte(c: CondicaoBlip, fonte: string): CondicaoBlip {
  const resto: CondicaoBlip = { ...c, source: fonte };
  delete resto.variable;
  delete resto.entity;
  if (fonte === 'context') resto.variable = c.variable ?? '';
  return resto;
}

/** Um valor a mais na lista (o Enter do campo de valores). Repetido ou vazio não entra. */
export function adicionarValor(c: CondicaoBlip, valor: string): CondicaoBlip {
  const texto = valor.trim();
  const atuais = c.values ?? [];
  if (!texto || atuais.includes(texto)) return c;
  return { ...c, values: [...atuais, texto] };
}

export function removerValor(c: CondicaoBlip, indice: number): CondicaoBlip {
  const atuais = c.values ?? [];
  return { ...c, values: atuais.filter((_, i) => i !== indice) };
}

/** A frase de `validarCondicao` do motor, ou nada quando a condição está boa. */
export function erroDaCondicao(c: CondicaoBlip): string | null {
  try {
    validarCondicao(c);
    return null;
  } catch (erro) {
    if (erro instanceof ErroDeValidacao) return erro.message;
    throw erro;
  }
}

/** O motor não tem provedor de IA: intenção e entidade nunca casam no Pipe. */
export const fonteSemSuporte = (c: CondicaoBlip): boolean => {
  const fonte = fonteDe(c);
  return fonte === 'intent' || fonte === 'entity';
};

/* ------------------------------------------------------------- as saídas */

/** "+ Adicionar condição de saída": uma saída nova, sem destino e com uma condição vazia. */
export function novaSaida(id = gerarId()): SaidaDoEditor {
  return { $id: id, typeOfStateId: 'state', conditions: [novaCondicao()], $invalid: false };
}

export type ResultadoDeSaida = { ok: true; bloco: Bloco } | { ok: false; erro: string };

export function adicionarSaida(bloco: Bloco, saida = novaSaida()): ResultadoDeSaida {
  const saidas = bloco.$conditionOutputs ?? [];
  if (saidas.length >= LIMITE_DE_SAIDAS) return { ok: false, erro: MENSAGENS.limiteDeSaidas };
  return { ok: true, bloco: { ...bloco, $conditionOutputs: [...saidas, saida] } };
}

export function removerSaida(bloco: Bloco, indice: number): Bloco {
  const saidas = bloco.$conditionOutputs ?? [];
  return { ...bloco, $conditionOutputs: saidas.filter((_, i) => i !== indice) };
}

/** Sobe ou desce uma saída na ordem de avaliação. Fora da lista, nada muda. */
export function moverSaida(bloco: Bloco, de: number, para: number): Bloco {
  const saidas = [...(bloco.$conditionOutputs ?? [])];
  if (de < 0 || de >= saidas.length || para < 0 || para >= saidas.length || de === para) return bloco;
  const [saida] = saidas.splice(de, 1);
  saidas.splice(para, 0, saida!);
  return { ...bloco, $conditionOutputs: saidas };
}

export function definirDestinoDaSaida(bloco: Bloco, indice: number, destino: string): Bloco {
  const saidas = (bloco.$conditionOutputs ?? []).map((s, i) => {
    if (i !== indice) return s;
    if (!destino) return semDestino(s);
    return { ...s, stateId: destino, typeOfStateId: s.typeOfStateId ?? 'state' };
  });
  return { ...bloco, $conditionOutputs: saidas };
}

export function definirCondicoesDaSaida(bloco: Bloco, indice: number, condicoes: CondicaoBlip[]): Bloco {
  const saidas = (bloco.$conditionOutputs ?? []).map((s, i) =>
    i === indice ? { ...s, conditions: condicoes } : s,
  );
  return { ...bloco, $conditionOutputs: saidas };
}

export function definirSaidaPadrao(bloco: Bloco, destino: string): Bloco {
  return { ...bloco, $defaultOutput: destino ? { stateId: destino, $invalid: false } : null };
}

/** Os erros de uma saída, na frase que o painel mostra. */
export function errosDaSaida(saida: SaidaDoEditor, existe: (id: string) => boolean): string[] {
  const erros: string[] = [];
  if (!saida.stateId && !saida.$isDeskOutput) erros.push(ROTULOS_DAS_SAIDAS.naoPreenchida);
  if (saida.stateId && !existe(saida.stateId) && !/^{{.*}}$/.test(saida.stateId)) {
    erros.push(`O estado de destino '${saida.stateId}' da saída não existe.`);
  }
  for (const c of saida.conditions ?? []) {
    const erro = erroDaCondicao(c);
    if (erro && !erros.includes(erro)) erros.push(erro);
  }
  return erros;
}
