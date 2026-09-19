import { useContato } from '../../contato';
import { TelaDeChaves } from './tela';

/**
 * `/configurations/keys` — estado `auth.application.detail.configurations.accessToken`
 * (portal.js, template do módulo 76179, controlador `lP`). Só existe com
 * `isTokenManagementEnable`; sem a flag a origem manda para a lista de bots.
 *
 * No Pipe a chave é do FLUXO (`chave_api.fluxo_id`, migração 0032): a tabela
 * sempre foi da conta, e a tela virou real emitindo/revogando uma chave por
 * fluxo — `GET/POST/DELETE /v1/gestao/fluxos/:id/chaves`.
 */
export function PaginaChavesDoBot() {
  const { contato } = useContato();
  return <TelaDeChaves fluxoId={contato.id} />;
}
