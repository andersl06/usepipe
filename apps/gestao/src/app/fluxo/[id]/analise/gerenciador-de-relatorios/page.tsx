import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fusoDoTenant } from '../../../../../lib/banco';
import { carregarContato, UUID } from '../../barra-do-contato';
import { GerenciadorDeRelatorios } from './tela';
import './gerenciador.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Gerenciador de Relatórios · Pipe',
};

export default async function PaginaDoGerenciador({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const contato = await carregarContato(id);
  if (!contato) notFound();

  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: await fusoDoTenant() }).format(
    new Date(),
  );
  return <GerenciadorDeRelatorios bot={contato.nome} hoje={hoje} />;
}
