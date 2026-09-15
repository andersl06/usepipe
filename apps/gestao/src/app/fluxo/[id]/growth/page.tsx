import { redirect } from 'next/navigation';

export default async function PaginaGrowth({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/fluxo/${id}/growth/mensagens-ativas`);
}
