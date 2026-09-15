import { redirect } from 'next/navigation';
import { ABA_PADRAO } from './abas';

/** `/analytics` tem `redirectTo` para o Dashboard; aqui, o mesmo. */
export default async function IndiceDaAnalise({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/fluxo/${id}/analise/${ABA_PADRAO}`);
}
