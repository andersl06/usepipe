import { useContato } from '../../contato';
import { TelaDeConexao } from './tela';

/**
 * `/configurations/apikey` — estado `auth.application.detail.configurations.apikey`
 * (portal.js, template do módulo 83981, controlador `iP`). O título e a frase
 * vêm de `modules.application.detail.templates.api.pageTitle/pageDescription`.
 *
 * ponytail: os valores de conexão (endpoints WS/TCP/HTTP, URLs, OAuth) não
 * existem no Pipe ainda; a tela mostra os campos vazios e o "Salvar" devolve
 * o erro controlado de indisponível. Só o identificador é real (o id do fluxo).
 */
export function PaginaApiDoBot() {
  const { contato } = useContato();
  return <TelaDeConexao identificador={contato.id} />;
}
