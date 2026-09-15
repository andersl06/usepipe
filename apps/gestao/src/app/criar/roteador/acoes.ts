'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { gravarContato } from '../gravar';
import { RECADOS } from './regras';

/**
 * Criar o roteador — o clique no botão "Criar roteador" do passo do nome.
 *
 * Na origem é a `createApplication()` do `CreateApplicationController` chamando
 * `CreateApplicationService.createApplication(application, 'master')`. Os sete
 * passos desse serviço — e o porquê de SEIS deles não acontecerem para o
 * roteador — estão comentados em `../gravar.ts`, que é o que grava para as duas
 * telas de criação.
 *
 * O que sobra aqui é o que é DESTA tela: para onde a pessoa vai quando dá certo
 * e para onde volta quando não dá.
 */
export async function criarRoteador(dados: FormData): Promise<void> {
  const resultado = await gravarContato(dados, { tipo: 'roteador', recados: RECADOS });

  if (resultado.erro) voltarComErro(resultado.erro, String(dados.get('nome') ?? ''));

  /* A grade do portal muda: um cartão a mais, e ele é o PRIMEIRO (a lista vem
     do mais novo para o mais antigo). */
  revalidatePath('/portal');

  /* `goToApplicationDetails()` deles termina em
     `$state.go('auth.application.detail.home', { shortName })` — ou seja, a
     tela do contato recém-criado, e não a lista de onde a pessoa veio.

     Uma observação do mesmo método: para `master` ele PULA o rastro
     `create-chatbot-flowtest`, que é o do teste do fluxo. Roteador não tem
     conversa para testar.

     Essa tela existe: `app/fluxo/[id]`. Vai pelo `id` e não pelo `short_name`
     porque a coluna ainda não tem índice único — a nota inteira está no
     cabeçalho da página. */
  redirect(`/fluxo/${resultado.id}`);
}

/**
 * Volta para o passo do nome com o motivo — e não para uma tela de erro.
 *
 * É o que a origem faz: no `catch` do `createApplication()` ela chama
 * `$state.go('^.name')` e só então mostra o aviso vermelho
 * (`BlipToastService.show('danger', …)`). A pessoa continua no formulário, com
 * o passo certo aberto.
 *
 * O nome digitado volta junto para o campo não nascer vazio depois da recusa —
 * lá o modelo do formulário nunca é perdido, porque a tela não recarrega.
 */
function voltarComErro(motivo: string, nome: string): never {
  const busca = new URLSearchParams({ passo: 'nome', erro: motivo });
  if (nome) busca.set('nome', nome);
  redirect(`/criar/roteador?${busca}`);
}
