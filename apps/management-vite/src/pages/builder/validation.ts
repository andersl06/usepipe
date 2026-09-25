import type { BlockError } from '@pipe/contracts';
import type { Block, Mapa } from './model';
import { contentErrors } from './conteudo';
import { outputErrors } from './conditions';
import { actionErrors } from './actions-of-block';

const ERRORS_OF_RASCUNHO_OF_OUTPUT = new Set([
  'Definição de saída não preenchida',
  'A condição precisa de valores quando a comparação não é exists nem notExists.',
]);

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

export function blockErrors(block: Block, mapa: Mapa): string[] {
  const errors: string[] = [];
  const anotar = (message: string): void => {
    if (!errors.includes(message)) errors.push(message);
  };
  if (!block.$title?.trim()) anotar('Nome do bloco: campo obrigatório.');
  if ((block.$title ?? '').length > LIMITE_DO_TITULO) anotar(`Nome do bloco: no máximo ${LIMITE_DO_TITULO} caracteres.`);
  for (const e of contentErrors(block)) anotar(e);
  const existe = (id: string): boolean => id in mapa;
  for (const saida of block.$conditionOutputs ?? []) {
    for (const e of outputErrors(saida, existe)) {
      // O Builder mantém o rascunho incompleto no cartão, sem o promover ao alerta do fluxo.
      if (!ERRORS_OF_RASCUNHO_OF_OUTPUT.has(e)) anotar(e);
    }
  }
  const padrao = block.$defaultOutput?.stateId;
  if (padrao && !existe(padrao) && !/^{{.*}}$/.test(padrao)) {
    anotar(`O estado de destino '${padrao}' da saída não existe.`);
  }
  for (const acao of [...(block.$enteringCustomActions ?? []), ...(block.$leavingCustomActions ?? [])]) {
    for (const e of actionErrors(acao)) {
      // A extração do Builder marca a URL no cartão ProcessHttp, sem promovê-la ao alerta do fluxo.
      if (acao.type === 'ProcessHttp' && e === 'URL: campo obrigatório.') continue;
      anotar(e);
    }
  }
  return errors;
}

/** Os erros locais de todos os blocos, no mesmo formato dos da `api`. */
export function errorsLocal(mapa: Mapa): BlockError[] {
  const lista: BlockError[] = [];
  for (const block of Object.values(mapa)) {
    for (const message of blockErrors(block, mapa)) lista.push({ block: block.id, message });
  }
  return lista;
}

/** Junta listas de erro sem repetir (mesmo bloco, mesma frase). */
export function juntarErrors(...listas: BlockError[][]): BlockError[] {
  const saida: BlockError[] = [];
  for (const lista of listas) {
    for (const e of lista) {
      if (!saida.some((x) => x.block === e.block && x.mensagem === e.mensagem)) saida.push(e);
    }
  }
  return saida;
}
