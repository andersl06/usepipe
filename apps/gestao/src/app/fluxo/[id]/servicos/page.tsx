import { notFound } from 'next/navigation';
import { BarraDoPortal } from '../../../../componentes/barra-do-portal';
import { BarraDoContato, UUID, carregarContato } from '../barra-do-contato';
import { carregarCascaDoPortal } from '../../../../lib/portal';
import { carregarServicos } from '../../../../lib/servicos';
import { TelaDeServicos } from './tela';
import '../fluxo.css';
import './servicos.css';

export const dynamic = 'force-dynamic';

/** Serviços do roteador: equivalente à configuração `master.services`. */
export default async function PaginaDeServicos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [casca, contato, dados] = await Promise.all([
    carregarCascaDoPortal(),
    carregarContato(id),
    carregarServicos(id),
  ]);
  if (!contato || contato.tipo !== 'roteador' || !dados.principal) notFound();

  return (
    <div className="pt-app">
      <BarraDoPortal dados={casca} />
      <BarraDoContato contato={contato} ativo="Serviços" />
      <main className="sv-miolo">
        <TelaDeServicos dados={dados} podeEditar={casca.podeCriar} />
      </main>
    </div>
  );
}
