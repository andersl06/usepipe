import { redirect } from 'next/navigation';

export default async function PaginaConfiguracoes({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/fluxo/${id}/configuracoes/api`);
}
