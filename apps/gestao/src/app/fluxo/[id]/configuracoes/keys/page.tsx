import { TelaDeChaves } from './tela';

/**
 * `/configurations/keys` — estado `auth.application.detail.configurations.accessToken`
 * (portal.js, template do módulo 76179, controlador `lP`). Só existe com
 * `isTokenManagementEnable`; sem a flag a origem manda para a lista de bots.
 *
 * ponytail: não há gestão de chaves por fluxo no Pipe (o `chave_api` do banco
 * é por conta e o segredo nunca volta em claro). A lista começa vazia e as
 * ações de criar/excluir devolvem o erro controlado de indisponível.
 */
export default function PaginaChavesDoBot() {
  return <TelaDeChaves chaves={[]} />;
}
