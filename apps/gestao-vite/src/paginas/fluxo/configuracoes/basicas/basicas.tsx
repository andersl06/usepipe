import { useContato } from '../../contato';
import { TelaDeConfiguracoesBasicas } from './tela';

/**
 * `/configurations/basic` — estado `auth.application.detail.configurations.basic`
 * (título real "Editar Fluxo", confirmado na cópia rodável, `docs/capturas/regua.md`:
 * `/application/detail/pipeprincipal/configurations/basic`). É a PRIMEIRA aba da
 * lateral de Configurações (`../navegacao.tsx`), e até aqui era o único item sem
 * `rota` (`rota: null`) — este arquivo fecha essa lacuna.
 *
 * Nome e imagem são reais (`useContato`, o mesmo `GET /v1/gestao/fluxos/:id` que
 * a barra do contato já lê). Descrição não tem de onde vir: `fluxo` (schema)
 * não tem coluna pra ela — ver o ponytail em `tela.tsx`.
 */
export function PaginaDeConfiguracoesBasicas() {
  const { contato } = useContato();
  return <TelaDeConfiguracoesBasicas nome={contato.nome} imagemUrl={contato.imagemUrl} />;
}
