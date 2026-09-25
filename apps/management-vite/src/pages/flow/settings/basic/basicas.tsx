import { useEu } from '../../../../context/session';
import { useContact } from '../../contact';
import { SettingsBasicTela } from './tela';

/**
 * `/configurations/basic` — estado `auth.application.detail.configurations.basic`
 * (título real "Editar Fluxo", confirmado na cópia rodável, `docs/capturas/regua.md`:
 * `/application/detail/pipeprincipal/configurations/basic`). É a PRIMEIRA aba da
 * lateral de Configurações (`../navegacao.tsx`), e até aqui era o único item sem
 * `rota` (`rota: null`) — este arquivo fecha essa lacuna.
 *
 * Nome, descrição e imagem vêm de `useContato` (o mesmo `GET /v1/gestao/fluxos/:id`
 * que a barra do contato já lê). `podeExcluir` é o `canDeleteBot` deles: a
 * permissão `automacao.fluxo.excluir`, que só o admin tem — a `api` confere de
 * novo no `DELETE`, porque botão desligado não é porta trancada.
 */
export function SettingsBasicPage() {
  const { contact } = useContact();
  const eu = useEu();
  return (
    <SettingsBasicTela
      key={contact.id}
      id={contact.id}
      nome={contact.nome}
      description={contact.description ?? ''}
      imageUrl={contact.imageUrl}
      shortName={contact.shortName}
      podeExcluir={eu.permissions.includes('automacao.fluxo.excluir')}
    />
  );
}
