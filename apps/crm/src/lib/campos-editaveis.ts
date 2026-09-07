/**
 * O catálogo dos campos da ficha que se editam no lugar.
 *
 * **Este arquivo não importa banco, e é de propósito.** A célula inline é
 * componente de cliente; qualquer `import` daqui que puxe `pg` para o bundle do
 * navegador derruba a página com 500 — a mesma armadilha que `busca-tipos.ts`
 * existe para evitar. Catálogo é fato (nome, rótulo, tipo, teto), e fato não
 * precisa de conexão.
 *
 * O catálogo também é a **lista branca da escrita**: `atualizarCampoDoLead` não
 * aceita nome de coluna vindo da tela, aceita chave daqui. Concatenar o que o
 * navegador mandou com um `update` é como se escreve na tabela errada.
 */

export type TipoCampo = 'texto' | 'selecao';

export interface CampoEditavel {
  rotulo: string;
  tipo: TipoCampo;
  /** Teto de caracteres. Vale no navegador (`maxlength`) e de novo no servidor. */
  maximo: number;
}

export const CAMPOS_EDITAVEIS = {
  email: { rotulo: 'E-mail', tipo: 'texto', maximo: 254 },
  telefone: { rotulo: 'Telefone', tipo: 'texto', maximo: 32 },
  origem: { rotulo: 'Origem', tipo: 'texto', maximo: 120 },
  campanha: { rotulo: 'Campanha', tipo: 'texto', maximo: 120 },
  /** O valor é o id do usuário, não o nome: nome muda e atribuição não pode mudar junto. */
  proprietario: { rotulo: 'Proprietário', tipo: 'selecao', maximo: 36 },
} as const satisfies Record<string, CampoEditavel>;

export type ChaveCampo = keyof typeof CAMPOS_EDITAVEIS;

const CHAVES: readonly string[] = Object.keys(CAMPOS_EDITAVEIS);

export function campoValido(valor: string): valor is ChaveCampo {
  return CHAVES.includes(valor);
}

/** Espaço nas pontas fora; campo em branco é nulo, não string vazia. */
export function normalizar(valor: string): string | null {
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}

/**
 * O que a tela recusa antes de chamar o servidor, e o servidor recusa de novo.
 *
 * Nenhuma das duas é validação de verdade de e-mail ou telefone — isso só o
 * envio prova. É o filtro que impede o erro de digitação óbvio de virar dado
 * gravado: e-mail sem arroba, telefone com letra.
 *
 * Devolve a queixa, ou `null` quando está bom.
 */
export function recusar(campo: ChaveCampo, valor: string | null): string | null {
  if (valor === null) return null;
  if (valor.length > CAMPOS_EDITAVEIS[campo].maximo) {
    return `Passa de ${CAMPOS_EDITAVEIS[campo].maximo} caracteres.`;
  }
  if (campo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) {
    return 'E-mail sem arroba ou sem domínio.';
  }
  if (campo === 'telefone' && !/^[+\d][\d\s().-]*$/.test(valor)) {
    return 'Telefone só aceita dígitos, espaço, parênteses, traço e +.';
  }
  return null;
}
