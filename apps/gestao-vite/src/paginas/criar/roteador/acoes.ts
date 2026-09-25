import { saveContact } from '../gravar';
import { irPara } from '../../../lib/navegacao';
import { RECADOS } from './regras';

/**
 * Criar um roteador: grava pela `api` e vai para a tela do contato recém-criado
 * — o `goToApplicationDetails()` da origem. Com erro, volta ao passo do nome
 * com o motivo e o nome digitado na URL.
 */
export async function createRouter(data: FormData): Promise<void> {
  const resultado = await saveContact(data, { tipo: 'roteador', recados: RECADOS });
  if (resultado.error) return voltarWithError(resultado.error, String(data.get('nome') ?? ''));
  irPara(`/roteador/${resultado.id}`);
}

function voltarWithError(motivo: string, nome: string): void {
  const search = new URLSearchParams({ passo: 'nome', erro: motivo });
  if (nome) search.set('nome', nome);
  irPara(`/criar/roteador?${search}`);
}
