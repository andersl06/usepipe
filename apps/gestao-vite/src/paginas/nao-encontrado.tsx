import { Link } from '../componentes/link';

/** O 404 do aplicativo: o Next tinha o dele por padrão; aqui é uma tela nossa, curta. */
export function NaoEncontrado() {
  return (
    <main className="pt-conteudo fx-miolo">
      <div className="fx-coluna">
        <h1>Página não encontrada</h1>
        <p>
          O endereço não existe ou não pertence a esta conta.{' '}
          <Link href="/portal">Voltar ao portal</Link>
        </p>
      </div>
    </main>
  );
}
