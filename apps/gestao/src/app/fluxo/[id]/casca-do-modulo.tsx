import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { BarraDoPortal } from '../../../componentes/barra-do-portal';
import { BarraDoContato, UUID, carregarContato } from './barra-do-contato';
import { carregarCascaDoPortal } from '../../../lib/portal';
import './fluxo.css';

export async function CascaDoModulo({
  id,
  ativo,
  children,
}: {
  id: string;
  ativo?: string;
  children: ReactNode;
}) {
  if (!UUID.test(id)) notFound();
  const [casca, contato] = await Promise.all([carregarCascaDoPortal(), carregarContato(id)]);
  if (!contato) notFound();

  return (
    <div className="pt-app">
      <BarraDoPortal dados={casca} />
      <BarraDoContato contato={contato} ativo={ativo} />
      <main className="pt-conteudo fx-miolo">
        <div className="fx-coluna">{children}</div>
      </main>
    </div>
  );
}
