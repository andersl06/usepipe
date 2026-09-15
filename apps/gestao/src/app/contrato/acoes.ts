'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirEu } from '../../lib/banco';
import { cookieDaSessao } from '../../lib/conta';
import { chamarApi } from '../../lib/sessao';
import {
  cancelarConvite,
  definirPapelDoConvite,
  definirPapelDoMembro,
  removerMembro,
} from '../../lib/contrato';
import type { Gravacao } from '../../lib/contrato';
import { lerAlvosDeMembro } from './catalogo';

/**
 * As escritas do Painel do contrato.
 *
 * **O modo demonstração (`?demo=1`) NÃO chega aqui, e é de propósito.** Ele é
 * só visual: mostra a tela como ela ficaria com o papel e o plano mais altos,
 * para quem ainda não tem nenhum dos dois entender o que vem. Toda ação deste
 * arquivo confere a permissão de verdade em `Eu.permissoes` — que vem da sessão,
 * pela `api` — e nenhuma delas lê a URL, o `searchParams` ou qualquer bandeira
 * de demonstração. Se um dia alguém for tentado a passar o "demo" para cá para
 * "testar a tela inteira", é este o ponto que vaza: prévia vira escrita.
 *
 * A conferência é feita DE NOVO no servidor mesmo quando o botão só aparece
 * para quem pode: esconder botão é desenho, não é controle de acesso. Quem
 * mandar o POST por fora bate aqui.
 */

/** O que quem mexe em membro precisa ter. É a conferência `e` da matriz deles. */
const ESCREVER_MEMBROS = 'conta.membros.escrever';

async function exigirPermissaoDeMembros(): Promise<void> {
  const eu = await exigirEu();
  if (!eu.permissoes.includes(ESCREVER_MEMBROS)) {
    voltarComErro('Você não tem permissão para gerenciar os membros deste contrato.');
  }
}

function voltarComErro(erro: string): never {
  redirect(`/contrato/membros?erro=${encodeURIComponent(erro)}`);
}

/** A primeira falha para tudo: em lote, metade gravada e sem aviso é pior que nada. */
function conferir(gravado: Gravacao): void {
  if (!gravado.ok) voltarComErro(gravado.erro);
}

export async function trocarPapel(dados: FormData): Promise<void> {
  await exigirPermissaoDeMembros();

  const papelId = String(dados.get('papelId') ?? '').trim();
  if (!papelId) voltarComErro('Escolha o papel de quem está sendo alterado.');

  const alvos = lerAlvosDeMembro(dados.getAll('alvo').map(String));
  if (alvos.length === 0) voltarComErro('Escolha quem terá o papel alterado.');

  for (const alvo of alvos) {
    conferir(
      alvo.tipo === 'convite'
        ? await definirPapelDoConvite(alvo.id, papelId)
        : await definirPapelDoMembro(alvo.id, papelId),
    );
  }

  revalidatePath('/contrato/membros');
  revalidatePath('/contrato');
}

export async function excluirMembros(dados: FormData): Promise<void> {
  await exigirPermissaoDeMembros();

  const alvos = lerAlvosDeMembro(dados.getAll('alvo').map(String));
  if (alvos.length === 0) voltarComErro('Escolha quem sai do contrato.');

  /* Ninguém se remove sozinho: quem o fizesse perderia o acesso no clique
     seguinte, e um contrato pode ficar sem nenhum administrador. A tela nem
     mostra a própria linha (como a deles), mas quem mandar o POST por fora
     bate aqui. Para sair, o caminho é "Deixar contrato" no cartão de resumo. */
  const eu = await exigirEu();
  if (alvos.some((a) => a.tipo === 'usuario' && a.id === eu.usuario.id)) {
    voltarComErro('Você não pode excluir o seu próprio acesso a este contrato.');
  }

  for (const alvo of alvos) {
    conferir(
      alvo.tipo === 'convite' ? await cancelarConvite(alvo.id) : await removerMembro(alvo.id),
    );
  }

  revalidatePath('/contrato/membros');
  revalidatePath('/contrato');
}

/** O que o modal de convite mostra depois de enviar. */
export interface ResultadoDoConvite {
  /** Um link por pessoa convidada. O token só existe nesta resposta. */
  links: { email: string; url: string }[];
  /** Uma frase por e-mail que a `api` recusou. */
  erros: string[];
}

/**
 * Convida uma ou várias pessoas — o `inviteMany` da origem.
 *
 * Lá é UM comando LIME com a coleção inteira. Aqui a porta que já existe é
 * `POST /v1/convites`, um e-mail por chamada, e é ela que confere a
 * permissão (`conta.membros.escrever`), recusa papel de atendimento
 * (`papel_de_atendimento`), recusa quem já é membro (`ja_e_membro`) e
 * vence o convite anterior do mesmo e-mail. Nada disso é refeito aqui.
 *
 * Diferente das outras ações deste arquivo, esta NÃO redireciona com `?erro=`:
 * a resposta carrega o link do convite, e link de uso único na querystring
 * fica no histórico do navegador. Ele volta pelo estado do formulário, some
 * quando o modal fecha e nunca vira URL.
 *
 * ponytail: ninguém manda o e-mail ainda, então quem convida recebe o link para
 * enviar. Quando houver envio, os links saem desta resposta e ela vira só
 * "Convites enviados com sucesso.", como na origem.
 */
export async function convidarMembros(
  _anterior: ResultadoDoConvite | null,
  dados: FormData,
): Promise<ResultadoDoConvite> {
  await exigirPermissaoDeMembros();

  const papel = String(dados.get('papel') ?? '').trim();
  const emails = [
    ...new Set(
      String(dados.get('emails') ?? '')
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (!papel) return { links: [], erros: ['Escolha a permissão de quem está sendo convidado.'] };
  if (emails.length === 0) return { links: [], erros: ['Informe ao menos um e-mail.'] };

  const cookie = await cookieDaSessao();
  const resultado: ResultadoDoConvite = { links: [], erros: [] };

  /* Em série, e não em `Promise.all`: são poucos e-mails, e a ordem da lista
     de links fica igual à ordem em que a pessoa digitou. */
  for (const email of emails) {
    const resposta = await chamarApi(cookie, '/v1/convites', {
      method: 'POST',
      body: JSON.stringify({ email, papel }),
      headers: { 'content-type': 'application/json' },
    });
    if (resposta.ok) {
      const corpo = (await resposta.json()) as { email: string; url: string };
      resultado.links.push({ email: corpo.email, url: corpo.url });
    } else {
      resultado.erros.push(`${email}: ${await mensagemDaApi(resposta)}`);
    }
  }

  if (resultado.links.length > 0) revalidatePath('/contrato/membros');
  return resultado;
}

/** A frase que a `api` mandou em `{ erro: { mensagem } }`, ou o status. */
async function mensagemDaApi(resposta: Response): Promise<string> {
  try {
    const corpo = (await resposta.json()) as { erro?: { mensagem?: string } };
    return corpo.erro?.mensagem ?? `a API respondeu ${resposta.status}`;
  } catch {
    return `a API respondeu ${resposta.status}`;
  }
}
