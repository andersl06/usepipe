import type { Metadata } from 'next';
import { Simbolo } from '@pipe/ui';
import { urlDeEntradaComGoogle, verConvite } from '../../../lib/sessao';

/**
 * O convite visto por quem ainda está do lado de fora.
 *
 * Rota pública, como a de entrada — e pelo mesmo motivo da API não exigir
 * sessão em `GET /v1/convites/:token`: pedir a conta que o convite existe para
 * criar seria um ciclo.
 *
 * Ela mostra o MÍNIMO que a API devolve: para quem é, com que papel, de que
 * empresa e até quando vale. Quem tem o link já sabe o e-mail; o resto da conta
 * não é assunto de quem ainda não entrou.
 *
 * O botão manda para `/v1/auth/google?convite=<token>`, que é o caminho de quem
 * não tem domínio verificado: é o convite que decide o tenant, e não o domínio.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Convite · Pipe Desk',
  description: 'Aceitar um convite para o Pipe Desk.',
};

const DATA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });

export default async function PaginaConvite({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const convite = await verConvite(token);

  return (
    <main className="entrar">
      <section className="entrar-cartao" aria-labelledby="convite-titulo">
        <div className="entrar-marca">
          <Simbolo tamanho={40} />
          <b>Pipe Desk</b>
        </div>

        {convite ? (
          <>
            <h1 id="convite-titulo">Você foi convidado</h1>
            <p className="entrar-sub">
              {convite.tenant.nome} convidou você para o Pipe. Entrar com o Google já cria a sua
              conta.
            </p>

            <dl className="entrar-dados">
              <dt>Para</dt>
              <dd>{convite.email}</dd>
              <dt>Papel</dt>
              <dd>{convite.papel}</dd>
              <dt>Vale até</dt>
              <dd>{DATA.format(new Date(convite.expiraEm))}</dd>
            </dl>

            <a
              className="btn primario entrar-google"
              href={urlDeEntradaComGoogle({ convite: token })}
            >
              Entrar com Google e aceitar
            </a>

            <p className="entrar-rodape">
              Entre com a conta do Google deste mesmo e-mail. Com outra conta, o convite não é
              aceito — ele vale para um endereço só.
            </p>
          </>
        ) : (
          <>
            <h1 id="convite-titulo">Este convite não serve mais</h1>
            {/* Vencido, já usado e inexistente dão a MESMA tela: separar
                contaria a quem tem o link se aquele token um dia existiu. */}
            <p className="entrar-sub">
              Convite vale sete dias e uma vez só. Peça um novo a quem administra o Pipe na sua
              empresa.
            </p>
            <a className="btn entrar-google" href="/entrar">
              Ir para a tela de entrada
            </a>
          </>
        )}
      </section>
    </main>
  );
}
