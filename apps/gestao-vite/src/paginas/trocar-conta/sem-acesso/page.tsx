import Link from '../../../componentes/link';
import { useSearchParams } from 'react-router-dom';
import { useRead } from '../../../lib/consulta';
import type { AccountInLista } from '../../../lib/casca';
import '../../bem-vindo/boas-vindas.css';

/**
 * "Você faz parte de X?" — o endereço é de uma conta em que a pessoa não tem
 * acesso.
 *
 * É a saída da plataforma de origem para o mesmo caso, e a razão dela é que
 * negar seco manda embora quem só precisava de um convite.
 *
 * **A conta pode até não existir, e a tela é a MESMA de propósito.** Dizer
 * "essa conta existe, mas não é sua" conta a qualquer curioso que empresa usa o
 * Pipe — é a mesma simetria que a descoberta por e-mail já mantém na entrada.
 */
export function PageNoAccess() {
  const [search] = useSearchParams();
  const slug = (search.get('para') ?? '').trim().toLowerCase();
  const read = useRead<AccountInLista[]>('/v1/accounts/my');
  const accounts = read.data ?? [];
  const emVigor = accounts.find((c) => c.emVigor);

  return (
    <main className="entrada-passo">
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap"
      />
      <section className="entrada-passo-cartao">
        <img className="entrar-lockup" src="/pipe/lockup.svg" alt="Pipe" />

        <h1>Você faz parte de {slug || 'outra conta'}?</h1>
        <p className="entrada-passo-sub">
          Este endereço é de outra conta, e o seu acesso ainda não está nela. Peça a quem administra
          essa conta para convidar o seu e-mail — o convite entra direto, sem depender do domínio.
        </p>

        <div className="bv-acao">
          <Link href={emVigor ? '/portal' : '/bem-vindo'}>
            {emVigor ? `Voltar para ${emVigor.nome}` : 'Voltar'}
          </Link>
        </div>
      </section>
    </main>
  );
}
