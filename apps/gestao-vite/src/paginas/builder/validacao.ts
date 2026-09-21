import type { ErroDoBloco } from '@pipe/contracts';
import type { Bloco, Mapa } from './modelo';
import { errosDoConteudo } from './conteudo';
import { errosDaSaida } from './condicoes';
import { errosDaAcao } from './acoes-do-bloco';

/**
 * O que a TELA sabe apontar antes de mandar ao servidor — o `$invalid` do
 * editor da Blip, bloco a bloco: campo obrigatório vazio, saída sem destino,
 * condição sem valores, variável com nome inválido. É a primeira das duas
 * listas que o cartão do bloco pinta; a segunda vem da `api` (`errosDoFluxo`
 * do motor: raiz sem entrada, laço sem entrada, destino inexistente), depois
 * de cada salvar e no 409 de publicar.
 *
 * As frases são as do painel e as do motor — nunca dois textos para o mesmo
 * problema, e por isso `juntarErros` tira o repetido.
 */

export const LIMITE_DO_TITULO = 50;

export function errosDoBloco(bloco: Bloco, mapa: Mapa): string[] {
  const erros: string[] = [];
  const anotar = (mensagem: string): void => {
    if (!erros.includes(mensagem)) erros.push(mensagem);
  };
  if (!bloco.$title?.trim()) anotar('Nome do bloco: campo obrigatório.');
  if ((bloco.$title ?? '').length > LIMITE_DO_TITULO) anotar(`Nome do bloco: no máximo ${LIMITE_DO_TITULO} caracteres.`);
  for (const e of errosDoConteudo(bloco)) anotar(e);
  const existe = (id: string): boolean => id in mapa;
  for (const saida of bloco.$conditionOutputs ?? []) for (const e of errosDaSaida(saida, existe)) anotar(e);
  const padrao = bloco.$defaultOutput?.stateId;
  if (padrao && !existe(padrao) && !/^{{.*}}$/.test(padrao)) {
    anotar(`O estado de destino '${padrao}' da saída não existe.`);
  }
  for (const acao of [...(bloco.$enteringCustomActions ?? []), ...(bloco.$leavingCustomActions ?? [])]) {
    for (const e of errosDaAcao(acao)) anotar(e);
  }
  return erros;
}

/** Os erros locais de todos os blocos, no mesmo formato dos da `api`. */
export function errosLocais(mapa: Mapa): ErroDoBloco[] {
  const lista: ErroDoBloco[] = [];
  for (const bloco of Object.values(mapa)) {
    for (const mensagem of errosDoBloco(bloco, mapa)) lista.push({ bloco: bloco.id, mensagem });
  }
  return lista;
}

/** Junta listas de erro sem repetir (mesmo bloco, mesma frase). */
export function juntarErros(...listas: ErroDoBloco[][]): ErroDoBloco[] {
  const saida: ErroDoBloco[] = [];
  for (const lista of listas) {
    for (const e of lista) {
      if (!saida.some((x) => x.bloco === e.bloco && x.mensagem === e.mensagem)) saida.push(e);
    }
  }
  return saida;
}
