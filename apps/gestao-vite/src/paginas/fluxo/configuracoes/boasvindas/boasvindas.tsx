import type { ConfiguracaoDeBoasVindas } from '@pipe/contracts';
import { useLeitura } from '../../../../lib/consulta';
import { useContato } from '../../contato';
import { TelaDeBoasVindas } from './tela';

/**
 * `/configurations/welcome` — estado `auth.application.detail.configurations.welcome`.
 * `GET /v1/gestao/fluxos/:id/boas-vindas` (`configuracao-do-fluxo.ts`).
 */
export function PaginaDeBoasVindas() {
  const { contato } = useContato();
  const leitura = useLeitura<ConfiguracaoDeBoasVindas>(
    `/v1/gestao/fluxos/${contato.id}/boas-vindas`,
  );
  if (!leitura.data) return null;
  return <TelaDeBoasVindas id={contato.id} inicial={leitura.data} />;
}
