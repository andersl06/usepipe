import type { RequestOfService, RouterService } from '@pipe/contracts';

/** Principal hides persistence and expiration; persistent hides expiration. */
export function serviceFieldsVisible(principal: boolean, persistente: boolean) {
  return {
    mostrarPersistente: !principal,
    mostrarExpiracao: !principal && !persistente,
  };
}

/** The form as the screen stores it: all text and checkbox. */
export interface ServiceForm {
  nome: string;
  chatbotId: string;
  principal: boolean;
  persistente: boolean;
  expiration: string;
}

/**
 * The request that goes to the `api`: the hidden field doesn't go — it's the same rule the `api` (`servicos-do-roteador.ts`) has, which would ignore it too.
 */
export function pedidoDoFormulario(f: ServiceForm): RequestOfService {
  const campos = serviceFieldsVisible(f.principal, f.persistente);
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

/** The "Associate a chatbot" search: by name, excluding what's already a service. */
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
