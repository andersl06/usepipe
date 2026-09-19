import { api, chamarApi, motivoDaFalha } from '../../lib/api';
import { atualizarLeituras } from '../../lib/acoes';
import { irPara } from '../../lib/navegacao';

/**
 * As ações do painel de Membros — as mesmas de antes, do navegador. A permissão
 * `conta.membros.escrever` é conferida na `api`, na gravação; aqui só se monta
 * o pedido e se volta com o motivo na URL, como a tela já sabe mostrar.
 */
interface ResultadoSimples {
  ok: boolean;
  erro?: string;
}

function voltarComErro(erro: string): void {
  irPara(`/contrato/membros?erro=${encodeURIComponent(erro)}`);
}

export async function trocarPapel(dados: FormData): Promise<void> {
  const resultado = await api
    .post<ResultadoSimples>('/v1/gestao/contrato/membros/papel', {
      papelId: String(dados.get('papelId') ?? '').trim(),
      alvos: dados.getAll('alvo').map(String),
    })
    .catch((e: Error) => ({ ok: false, erro: e.message }) as ResultadoSimples);
  if (!resultado.ok) return voltarComErro(resultado.erro ?? 'Não foi possível alterar o papel.');
  atualizarLeituras();
}

export async function excluirMembros(dados: FormData): Promise<void> {
  const resultado = await api
    .post<ResultadoSimples>('/v1/gestao/contrato/membros/excluir', {
      alvos: dados.getAll('alvo').map(String),
    })
    .catch((e: Error) => ({ ok: false, erro: e.message }) as ResultadoSimples);
  if (!resultado.ok) return voltarComErro(resultado.erro ?? 'Não foi possível excluir.');
  atualizarLeituras();
}

export interface ResultadoDoConvite {
  links: { email: string; url: string }[];
  erros: string[];
}

export interface ResultadoDoReenvio {
  ok: boolean;
  email?: string;
  url?: string;
  erro?: string;
}

/**
 * Reenvia um convite pendente: mesmo e-mail, mesmo papel, link novo — o de
 * antes para de funcionar (`POST /v1/convites/:id/reenviar`). Como o Pipe não
 * entrega e-mail, o link volta na resposta para a tela mostrar de novo.
 */
export async function reenviarConvite(conviteId: string): Promise<ResultadoDoReenvio> {
  const resposta = await chamarApi(`/v1/convites/${conviteId}/reenviar`, { method: 'POST' });
  if (!resposta.ok) return { ok: false, erro: await motivoDaFalha(resposta) };
  const corpo = (await resposta.json()) as { email: string; url: string };
  atualizarLeituras();
  return { ok: true, email: corpo.email, url: corpo.url };
}

export async function convidarMembros(
  _anterior: ResultadoDoConvite | null,
  dados: FormData,
): Promise<ResultadoDoConvite> {
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
  const resultado: ResultadoDoConvite = { links: [], erros: [] };
  /* Em série, e não em `Promise.all`: são poucos e-mails, e a ordem da lista
     de links fica igual à ordem em que a pessoa digitou. */
  for (const email of emails) {
    const resposta = await chamarApi('/v1/convites', {
      method: 'POST',
      body: JSON.stringify({ email, papel }),
      headers: { 'content-type': 'application/json' },
    });
    if (resposta.ok) {
      const corpo = (await resposta.json()) as { email: string; url: string };
      resultado.links.push({ email: corpo.email, url: corpo.url });
    } else {
      resultado.erros.push(`${email}: ${await motivoDaFalha(resposta)}`);
    }
  }
  if (resultado.links.length > 0) atualizarLeituras();
  return resultado;
}
