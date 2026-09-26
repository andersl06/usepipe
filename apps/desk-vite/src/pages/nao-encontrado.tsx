import { Link } from '../components/link';

/** Reference `/not-found` is brief: the route does not exist. */
export function NaoEncontrado() {
  return (
    <main className="dk-conversation dk-conversation-empty" style={{ flexBasis: '100%', width: '100%' }}>
      <h1>Página não encontrada</h1>
      <p>
        O endereço não existe. <Link href="/">Voltar aos atendimentos</Link>
      </p>
    </main>
  );
}
