import { saveContact } from '../gravar';
import { irPara } from '../../../lib/navigation';
import { RECADOS } from './regras';

/**
 * Criar um roteador: grava pela `api` e vai para a tela do contato recém-criado
 * — o `goToApplicationDetails()` da origem. Com erro, volta ao passo do nome
 * com o motivo e o nome digitado na URL.
 */
export async function createRouter(data: FormData): Promise<void> {
  const resultado = await saveContact(data, { tipo: 'roteador', recados: RECADOS });
  if (resultado.error) return voltarWithError(resultado.error, String(data.get('nome') ?? ''));
  irPara(`/router/${resultado.id}`);
}

function voltarWithError(motivo: string, nome: string): void {
  /* Passo no path (D-31, `std/nav-contract.md` §Gestão); erro/nome
     continuam na query, classificados em separado. */
  const search = new URLSearchParams({ error: motivo });
  if (nome) search.set('nome', nome);
  irPara(`/create/router/name?${search}`);
}
