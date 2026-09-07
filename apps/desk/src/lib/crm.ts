/**
 * A fronteira com a `api` para o que o CRM sabe de um contato.
 *
 * **O Desk não fala com o Twenty.** Regra do dono: front é front, requisição é da
 * `api`. Aqui só existe uma chamada a `GET /v1/crm/contato/:id`, que é quem conhece a
 * instância do cliente e a chave dele.
 *
 * Mesmo desenho de `sessao.ts`: nada de tela, cookie por parâmetro como texto, para o
 * arquivo mudar de lugar sem reescrita quando a tela migrar para o Vite.
 */

const URL_API = (process.env['PIPE_URL_API'] ?? 'http://localhost:3000').replace(/\/$/, '');

export interface FichaDoCrm {
  nome: string;
  email: string | null;
  empresa: string | null;
  /** Link para a FICHA daquele cliente no CRM. Nunca a home. */
  link: string;
}

/**
 * O que o CRM sabe do contato, ou `null`.
 *
 * `null` cobre, de propósito, os quatro casos com a MESMA resposta: o tenant não tem
 * CRM, o contato ainda não foi espelhado, o contato não é deste tenant, e a `api` não
 * respondeu. O painel não tem o que fazer de diferente em nenhum deles — e distinguir
 * na tela contaria a quem olha se um id existe em outro cliente.
 *
 * **Nunca lança.** O CRM fora do ar não pode derrubar o painel do atendente: a
 * conversa vale mais que o cartão do CRM.
 */
export async function buscarFichaDoCrm(
  cookie: string,
  contatoId: string,
): Promise<FichaDoCrm | null> {
  try {
    const resposta = await fetch(`${URL_API}/v1/crm/contato/${encodeURIComponent(contatoId)}`, {
      headers: { cookie, accept: 'application/json' },
      cache: 'no-store',
    });
    if (!resposta.ok) return null;
    const corpo = (await resposta.json()) as { ficha: FichaDoCrm | null };
    return corpo.ficha;
  } catch {
    return null;
  }
}
