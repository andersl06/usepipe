import { gravarContato } from '../gravar';
import { irPara } from '../../../lib/navegacao';
import { RECADOS } from './regras';

/**
 * Criar um roteador: grava pela `api` e vai para a tela do contato recém-criado
 * — o `goToApplicationDetails()` da origem. Com erro, volta ao passo do nome
 * com o motivo e o nome digitado na URL.
 */
export async function criarRoteador(dados: FormData): Promise<void> {
  const resultado = await gravarContato(dados, { tipo: 'roteador', recados: RECADOS });
  if (resultado.erro) return voltarComErro(resultado.erro, String(dados.get('nome') ?? ''));
  irPara(`/roteador/${resultado.id}`);
}

function voltarComErro(motivo: string, nome: string): void {
  const busca = new URLSearchParams({ passo: 'nome', erro: motivo });
  if (nome) busca.set('nome', nome);
  irPara(`/criar/roteador?${busca}`);
}
