import type { RequestOfService, RouterService } from '@pipe/contracts';

/** Principal esconde persistência e expiração; persistente esconde a expiração. */
export function serviceFieldsVisiveis(principal: boolean, persistente: boolean) {
  return {
    mostrarPersistente: !principal,
    mostrarExpiracao: !principal && !persistente,
  };
}

/** O formulário como a tela guarda: tudo texto e caixinha. */
export interface ServiceFormulario {
  nome: string;
  chatbotId: string;
  principal: boolean;
  persistente: boolean;
  expiration: string;
}

/**
 * O pedido que vai para a `api`: o campo escondido não vai — é a mesma regra da
 * `api` (`servicos-do-roteador.ts`), que também o ignoraria.
 */
export function pedidoDoFormulario(f: ServiceFormulario): RequestOfService {
  const campos = serviceFieldsVisiveis(f.principal, f.persistente);
  const persistente = campos.mostrarPersistente && f.persistente;
  const expiration = f.expiration.trim();
  return {
    nome: f.nome.trim(),
    chatbotId: f.chatbotId,
    principal: f.principal,
    persistente,
    expiracaoMin: campos.mostrarExpiracao && expiration !== '' ? Number(expiration) : null,
  };
}

/** A busca de "Associe um chatbot": por nome, sem o que já é serviço. */
export function searchChatbots(
  search: readonly RouterService[],
  texto: string,
  jaUsados: ReadonlySet<string>,
): RouterService[] {
  const alvo = texto.trim().toLocaleLowerCase('pt-BR');
  return search.filter(
    (item) => !jaUsados.has(item.id) && item.nome.toLocaleLowerCase('pt-BR').includes(alvo),
  );
}
