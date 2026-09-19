import { useContato } from '../../contato';
import { TelaDeConexao } from './tela';

/**
 * `/configurations/apikey` — estado `auth.application.detail.configurations.apikey`
 * (portal.js, template do módulo 83981, controlador `iP`). O título e a frase
 * vêm de `modules.application.detail.templates.api.pageTitle/pageDescription`.
 *
 * Leitura e escrita reais via `GET/PUT /v1/gestao/fluxos/:id/conexao`
 * (`dominio/gestao/integracoes.ts`): identificador, endpoint, prefixo da
 * chave ativa e as duas URLs do formulário HTTP.
 */
export function PaginaApiDoBot() {
  const { contato } = useContato();
  return <TelaDeConexao fluxoId={contato.id} />;
}
