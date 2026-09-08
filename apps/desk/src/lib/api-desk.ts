/**
 * A fronteira do Desk com a `api` para o que ESCREVE.
 *
 * Até aqui a tela gravava a mensagem direto no banco e marcava `enviada` — o
 * que era mentira: nada saía para a Meta, e o atendente via o tique de enviada
 * numa mensagem que o cliente nunca recebeu. Agora quem grava é a `api`, que
 * põe a linha no outbox e devolve `pendente`; o tique só aparece quando a Meta
 * confirmar.
 *
 * `lib/sessao.ts` faz o mesmo para o que é de entrada (quem está logado, login,
 * convite). Os dois seguem a mesma regra: **o cookie chega como TEXTO, por
 * parâmetro**, e nada aqui sabe de JSX nem de `revalidatePath`. É o que mantém
 * este arquivo mudável de lugar quando a tela migrar para o Vite.
 */

const URL_API = (process.env['PIPE_URL_API'] ?? 'http://localhost:3000').replace(/\/$/, '');

/** O envelope de erro da `api`: `{ erro: { codigo, mensagem } }`. */
export interface FalhaDaApi {
  codigo: string;
  mensagem: string;
}

export type RespostaDaApi<T> = { ok: true; dados: T } | { ok: false; erro: FalhaDaApi };

/**
 * A mensagem que a `api` devolve **já vem em português e já é a certa** — ela é
 * escrita do lado que conhece a regra. A tela não a reescreve: duas redações da
 * mesma recusa divergem na primeira vez que uma das duas mudar.
 *
 * O que fica aqui é só o que a `api` não tem como saber: que do outro lado há
 * uma pessoa esperando, e que rede caída não é recusa de regra.
 */
const SEM_RESPOSTA: FalhaDaApi = {
  codigo: 'sem_resposta',
  mensagem: 'Não consegui falar com o servidor. Sua mensagem não foi enviada — tente de novo.',
};

async function lerFalha(resposta: Response): Promise<FalhaDaApi> {
  try {
    const corpo = (await resposta.json()) as { erro?: Partial<FalhaDaApi> };
    if (corpo.erro?.mensagem) {
      return { codigo: corpo.erro.codigo ?? 'desconhecido', mensagem: corpo.erro.mensagem };
    }
  } catch {
    // Resposta sem JSON (502 de proxy, HTML de erro). Cai no genérico abaixo.
  }
  return {
    codigo: `http_${resposta.status}`,
    mensagem: 'O servidor recusou a operação e não disse por quê. Tente de novo.',
  };
}

/**
 * `POST` na API em nome de quem está logado.
 *
 * `cache: 'no-store'` não é otimização: sem ele o Next pode servir a resposta
 * de um envio anterior para um envio novo com o mesmo corpo.
 */
export async function postNaApi<T = unknown>(
  caminho: string,
  cookie: string,
  corpo?: unknown,
): Promise<RespostaDaApi<T>> {
  let resposta: Response;
  try {
    resposta = await fetch(`${URL_API}${caminho}`, {
      method: 'POST',
      headers: {
        cookie,
        accept: 'application/json',
        ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, erro: SEM_RESPOSTA };
  }
  if (!resposta.ok) return { ok: false, erro: await lerFalha(resposta) };
  // 204 e afins não têm corpo; quem chama nesses casos ignora `dados`.
  try {
    return { ok: true, dados: (await resposta.json()) as T };
  } catch {
    return { ok: true, dados: undefined as T };
  }
}
