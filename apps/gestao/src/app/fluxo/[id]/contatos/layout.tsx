import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { BarraDoPortal } from '../../../../componentes/barra-do-portal';
import { carregarCascaDoPortal } from '../../../../lib/portal';
import { BarraDoContato, carregarContato, UUID } from '../barra-do-contato';
import '../fluxo.css';
import './contatos.css';

export default async function LayoutContatos({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [casca, contato] = await Promise.all([carregarCascaDoPortal(), carregarContato(id)]);
  if (!contato) notFound();
  return (
    <div className="pt-app">
      <BarraDoPortal dados={casca} />
      <BarraDoContato contato={contato} ativo="Contatos" />
      <main>{children}</main>
    </div>
  );
}
