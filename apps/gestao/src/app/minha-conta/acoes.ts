'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { contaEmVigor, cookieDaSessao } from '../../lib/conta';
import { chamarApi } from '../../lib/sessao';
import { conferir } from './regras';

/**
 * Salvar os dados da empresa — e, com isso, concluir o onboarding.
 *
 * Não há botão "concluir" à parte: salvar É o passo, como na origem. Quem já
 * concluiu e volta aqui está editando, e a data do primeiro salvamento não se
 * mexe (a `api` usa `coalesce`).
 *
 * A conferência acontece AQUI também, e não só nos atributos do formulário: os
 * atributos param o navegador, esta função para o resto. É a mesma régua, do
 * mesmo arquivo.
 */
export async function salvarConta(dados: FormData): Promise<void> {
  const corpo = {
    nome: String(dados.get('nome') ?? '').trim(),
    site: String(dados.get('site') ?? '').trim(),
    funcionarios: String(dados.get('funcionarios') ?? '').trim(),
    cidade: String(dados.get('cidade') ?? '').trim(),
    estado: String(dados.get('estado') ?? '').trim(),
    pais: String(dados.get('pais') ?? '').trim(),
    telefone: String(dados.get('telefone') ?? '').trim(),
    optinWhatsapp: dados.get('optinWhatsapp') === 'on',
    idioma: String(dados.get('idioma') ?? '').trim(),
    fuso: String(dados.get('fuso') ?? '').trim(),
  };

  /* As listas válidas vêm da `api`, e não de uma cópia daqui: lista duplicada é
     lista que envelhece do lado errado. */
  const conta = await contaEmVigor();
  const recusa = conferir({
    ...corpo,
    faixas: conta?.faixasDeFuncionarios ?? [],
    idiomas: conta?.idiomas ?? [],
    fusos: conta?.fusos ?? [],
  });
  if (recusa) voltarComErro(recusa.motivo, recusa.campo);

  const resposta = await chamarApi(await cookieDaSessao(), '/v1/conta', {
    method: 'PATCH',
    body: JSON.stringify(corpo),
    headers: { 'content-type': 'application/json' },
  });

  if (!resposta.ok) voltarComErro(await motivoDaFalha(resposta));

  revalidatePath('/minha-conta');
  revalidatePath('/portal');
  redirect('/portal');
}

/**
 * Volta para a mesma tela com o motivo, e não para uma tela de erro.
 *
 * Leva junto o NOME do campo recusado: é ele que acende o anel vermelho na
 * caixa certa, em vez de deixar a pessoa procurar qual dos oito campos era.
 */
function voltarComErro(motivo: string, campo?: string): never {
  const busca = new URLSearchParams({ erro: motivo });
  if (campo) busca.set('campo', campo);
  redirect(`/minha-conta?${busca}`);
}

async function motivoDaFalha(resposta: Response): Promise<string> {
  try {
    const corpo = (await resposta.json()) as { erro?: { mensagem?: string } };
    return corpo.erro?.mensagem ?? `A API respondeu ${resposta.status}.`;
  } catch {
    return `A API respondeu ${resposta.status}.`;
  }
}
