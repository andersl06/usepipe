import { TelaDoWebhook } from './tela';

/** `/integrations/webhook` da origem: cabeçalho com volta, interruptor e o papel de abas. */
export default async function PaginaWebhook({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TelaDoWebhook fluxoId={id} />;
}
