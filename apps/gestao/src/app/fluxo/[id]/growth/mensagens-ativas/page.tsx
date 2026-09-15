import { notFound } from 'next/navigation';
import { UUID } from '../../barra-do-contato';
import { carregarGrowth } from '../../../../../lib/growth';
import { TelaDeMensagensAtivas } from './tela';

export const dynamic = 'force-dynamic';

export default async function PaginaMensagensAtivas({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const dados = await carregarGrowth();
  return <TelaDeMensagensAtivas dados={dados} />;
}
