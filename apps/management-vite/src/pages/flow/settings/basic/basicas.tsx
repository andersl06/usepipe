import { useEu } from '../../../../context/session';
import { useContact } from '../../contact';
import { SettingsBasicScreen } from './tela';

/**
 * `/configurations/basic` — state `auth.application.detail.configurations.basic` (real title "Editar Fluxo", confirmed in the runnable copy, `docs/capturas/regua.md`: `/application/detail/pipeprincipal/configurations/basic`). It's the FIRST tab of the Settings sidebar (`../navegacao.tsx`), and until now was the only item without a `rota` (`rota: null`) — this file closes that gap.
 *
 * Name, description and image come from `useContato` (the same `GET /v1/gestao/fluxos/:id` the contact bar already reads). `podeExcluir` is their `canDeleteBot`: the `automacao.fluxo.excluir` permission, which only admins have — the `api` checks it again on `DELETE`, because a disabled button isn't a locked door.
 */
export function SettingsBasicPage() {
  const { contact } = useContact();
  const eu = useEu();
  return (
    <SettingsBasicScreen
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
