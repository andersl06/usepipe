/**
 * As variáveis do corpo de um template, e como elas viram texto.
 *
 * Duas numerações convivem, e confundi-las é o que fazia o Desk mandar
 * `{{1}}` cru para o cliente:
 *
 * - **Resposta pronta** escreve o nome no corpo: `Olá {{contato.nome}}`.
 * - **Template da Meta** só tem posição: `Olá {{1}}`, e quem diz o que é a
 *   posição 1 é a coluna `template_mensagem.variaveis`, que guarda os nomes
 *   NA ORDEM (`["contato.nome", "atendente.primeiro_nome"]`).
 *
 * Este arquivo é puro de propósito — nada de `pg`, nada de React. Ele é
 * importado pelo compositor (componente de cliente) e pela Server Action, e
 * as duas precisam resolver o texto EXATAMENTE igual: a pré-visualização que
 * mente é pior do que não ter pré-visualização.
 */

/** O que a tela sabe preencher sozinha, sem perguntar nada ao atendente. */
export type VariaveisDoContato = {
  'contato.nome': string;
  'contato.email': string;
  'contato.telefone': string;
  'atendente.nome': string;
  'atendente.primeiro_nome': string;
  'atendente.email': string;
};

/** `{{contato.nome}}` no corpo de uma resposta pronta. Nome desconhecido fica como está. */
export function aplicarVariaveis(corpo: string, variaveis: VariaveisDoContato): string {
  return corpo.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (inteiro, chave: string) => {
    const valor = (variaveis as Record<string, string | undefined>)[chave];
    return valor && valor.length > 0 ? valor : inteiro;
  });
}

export interface TemplateRenderizado {
  /** O corpo com as posições resolvidas, até onde deu. */
  corpo: string;
  /**
   * Os nomes que a tela NÃO sabe preencher — `data`, `protocolo`, o que o
   * gestor cadastrou e só um humano informa. Enquanto o compositor não tiver
   * campo para eles, o envio para: mandar `{{2}}` para o cliente é pior do
   * que dizer ao atendente que falta um valor.
   */
  faltando: string[];
  /**
   * Os valores resolvidos, **na ordem das posições** — é o formato que a `api`
   * espera em `parametros`. Quem envia manda estes; quem pré-visualiza usa o
   * `corpo`. Os dois saem da mesma passada, e por isso não podem divergir.
   */
  valores: string[];
}

/**
 * Resolve `{{1}}`, `{{2}}`, … pelo nome que ocupa cada posição.
 *
 * `variaveis` vem do banco como `jsonb`; um template sem variável nenhuma
 * chega como `null` ou `[]`, e o corpo sai inteiro.
 */
export function renderizarTemplate(
  corpo: string,
  nomesPorPosicao: unknown,
  valores: VariaveisDoContato,
): TemplateRenderizado {
  const nomes = Array.isArray(nomesPorPosicao) ? nomesPorPosicao.map(String) : [];
  const faltando: string[] = [];
  const resolvidos: string[] = [];
  const mapa = valores as Record<string, string | undefined>;

  const texto = corpo.replace(/\{\{\s*(\d+)\s*\}\}/g, (inteiro, posicao: string) => {
    const nome = nomes[Number(posicao) - 1];
    if (!nome) {
      // Posição sem nome cadastrado: o template e a coluna `variaveis`
      // discordam. Não há palpite honesto aqui.
      faltando.push(`posição ${posicao}`);
      resolvidos[Number(posicao) - 1] = '';
      return inteiro;
    }
    const valor = mapa[nome];
    if (!valor) {
      faltando.push(nome);
      resolvidos[Number(posicao) - 1] = '';
      return inteiro;
    }
    resolvidos[Number(posicao) - 1] = valor;
    return valor;
  });

  // `Array.from` sobre o esparso troca buraco por string vazia: posição que o
  // template não usa não pode virar `undefined` num JSON que vai para a rede.
  return {
    corpo: texto,
    faltando: [...new Set(faltando)],
    valores: Array.from(resolvidos, (v) => v ?? ''),
  };
}
