import { cookies } from 'next/headers';
import { COOKIE_SESSAO, chamarApi } from '../../../../../lib/sessao';

/**
 * Baixar o CSV das linhas rejeitadas de uma importação (`failed_records`).
 *
 * A Gestão só repassa: quem confere a sessão, a permissão e o tenant é a `api`.
 * O download não pode ser um link direto para a `api` porque, fora da produção,
 * o cookie da sessão não vale no domínio dela.
 */
export async function GET(
  _requisicao: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const cookie = (await cookies()).get(COOKIE_SESSAO);
  const resposta = await chamarApi(
    cookie ? `${COOKIE_SESSAO}=${cookie.value}` : '',
    `/v1/contatos/importacoes/${encodeURIComponent(id)}/falhas`,
  );
  if (!resposta.ok) return new Response('Relatório não encontrado.', { status: resposta.status });
  return new Response(await resposta.text(), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="rejeitadas-${id.replace(/[^\w-]/g, '')}.csv"`,
    },
  });
}
