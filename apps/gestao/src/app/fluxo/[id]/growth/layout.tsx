import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { BarraDoPortal } from '../../../../componentes/barra-do-portal';
import { BarraDoContato, UUID, carregarContato } from '../barra-do-contato';
import { carregarCascaDoPortal } from '../../../../lib/portal';
import '../fluxo.css';
import './growth.css';

export const dynamic = 'force-dynamic';

export default async function LayoutDeGrowth({
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
      <BarraDoContato contato={contato} ativo="Growth" />
      <main className="gr-miolo">{children}</main>
    </div>
  );
}
