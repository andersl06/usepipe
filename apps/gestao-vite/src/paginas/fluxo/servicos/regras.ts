import type { PedidoDeServico, ServicoDoRoteador } from '@pipe/contracts';

/** Principal esconde persistência e expiração; persistente esconde a expiração. */
export function camposVisiveisDoServico(principal: boolean, persistente: boolean) {
  return {
    mostrarPersistente: !principal,
    mostrarExpiracao: !principal && !persistente,
  };
}

/** O formulário como a tela guarda: tudo texto e caixinha. */
export interface FormularioDeServico {
  nome: string;
  chatbotId: string;
  principal: boolean;
  persistente: boolean;
  expiracao: string;
}

/**
 * O pedido que vai para a `api`: o campo escondido não vai — é a mesma regra da
 * `api` (`servicos-do-roteador.ts`), que também o ignoraria.
 */
export function pedidoDoFormulario(f: FormularioDeServico): PedidoDeServico {
  const campos = camposVisiveisDoServico(f.principal, f.persistente);
  const persistente = campos.mostrarPersistente && f.persistente;
  const expiracao = f.expiracao.trim();
  return {
    nome: f.nome.trim(),
    chatbotId: f.chatbotId,
    principal: f.principal,
    persistente,
    expiracaoMin: campos.mostrarExpiracao && expiracao !== '' ? Number(expiracao) : null,
  };
}

/** A busca de "Associe um chatbot": por nome, sem o que já é serviço. */
export function chatbotsDaBusca(
  busca: readonly ServicoDoRoteador[],
  texto: string,
  jaUsados: ReadonlySet<string>,
): ServicoDoRoteador[] {
  const alvo = texto.trim().toLocaleLowerCase('pt-BR');
  return busca.filter(
    (item) => !jaUsados.has(item.id) && item.nome.toLocaleLowerCase('pt-BR').includes(alvo),
  );
}
