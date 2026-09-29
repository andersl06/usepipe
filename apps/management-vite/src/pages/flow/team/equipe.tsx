import type { TeamOfFlow } from '@pipe/contracts';
import { ApiError } from '@pipe/ui/api';
import { useRead } from '../../../lib/query';
import { ContactBars, useContact } from '../contact';
import { TelaDeEquipe } from './tela';

/**
 * `/team` for the contact (LEIA.md, capture 1) — now with the PER-FLOW RBAC the origin assumes (migration 0035).
 *
 * Before, this screen read `/contrato/membros`: without `fluxo_membro`, anyone with account access had access to every flow, and the per-contact subset was the whole set. Now the list is `GET /v1/gestao/fluxos/:id/equipe`'s, which is THIS contact's team — what `TeamController._loadMembers()` does in the origin, per bot.
 *
 * Who can view and who can change is decided on the server (`dominio/gestao/equipe-do-fluxo.ts`): a 403 becomes the same notice as before, instead of an empty list that would read as "there's no one here".
 *
 * No `CascaDoModulo`: `cf-cabecalho`/`cf-container` (from `configuracoes.css`) already center at 80% on their own, the same way the common shell's `fx-coluna` does — stacking both would squeeze the body to 64% (80% of 80%).
 */
export function TeamPage() {
  const { contact } = useContact();
  const read = useRead<TeamOfFlow>(`/v1/management/flows/${contact.id}/team`);
  const withoutPermission = read.error instanceof ApiError && read.error.status === 403;

  return (
    <div className="pt-app">
      <ContactBars ativo="Equipe" />
      <main>
        {withoutPermission ? (
          <p className="cf-aviso cf-container" role="alert">
            Você não tem permissão para ver a equipe.
          </p>
        ) : read.error ? (
          <p className="cf-aviso cf-container" role="alert">
            Não foi possível carregar a equipe: {read.error.message}
          </p>
        ) : !read.data ? null : (
          <TelaDeEquipe
            flowId={contact.id}
            podeGerir={read.data.podeGerir}
            members={read.data.members}
          />
        )}
      </main>
    </div>
  );
}
