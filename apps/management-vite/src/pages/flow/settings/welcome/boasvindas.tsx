import type { ConfigurationOfWelcome } from '@pipe/contracts';
import { useRead } from '../../../../lib/query';
import { useContact } from '../../contact';
import { TelaDeBoasVindas } from './tela';

/**
 * `/configurations/welcome` — estado `auth.application.detail.configurations.welcome`.
 * `GET /v1/gestao/fluxos/:id/boas-vindas` (`configuracao-do-fluxo.ts`).
 */
export function WelcomePage() {
  const { contact } = useContact();
  const read = useRead<ConfigurationOfWelcome>(
    `/v1/management/flows/${contact.id}/welcome`,
  );
  if (!read.data) return null;
  return <TelaDeBoasVindas id={contact.id} inicial={read.data} />;
}
