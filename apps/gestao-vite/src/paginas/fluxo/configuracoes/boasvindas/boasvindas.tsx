import type { ConfigurationOfWelcome } from '@pipe/contracts';
import { useRead } from '../../../../lib/consulta';
import { useContact } from '../../contato';
import { TelaDeBoasVindas } from './tela';

/**
 * `/configurations/welcome` — estado `auth.application.detail.configurations.welcome`.
 * `GET /v1/gestao/fluxos/:id/boas-vindas` (`configuracao-do-fluxo.ts`).
 */
export function WelcomePage() {
  const { contact } = useContact();
  const read = useRead<ConfigurationOfWelcome>(
    `/v1/gestao/fluxos/${contact.id}/boas-vindas`,
  );
  if (!read.data) return null;
  return <TelaDeBoasVindas id={contact.id} inicial={read.data} />;
}
