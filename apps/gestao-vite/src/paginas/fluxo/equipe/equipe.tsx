import type { TeamOfFlow } from '@pipe/contracts';
import { ApiError } from '../../../lib/api';
import { useRead } from '../../../lib/consulta';
import { ContactBarras, useContact } from '../contato';
import { TelaDeEquipe } from './tela';

/**
 * `/team` do contato (LEIA.md, captura 1) — agora com o RBAC POR FLUXO que a
 * origem pressupõe (migração 0035).
 *
 * Antes esta tela lia `/contrato/membros`: sem `fluxo_membro`, todo mundo com
 * acesso à conta tinha acesso a todos os fluxos, e o subconjunto por contato
 * era o conjunto inteiro. Agora a lista é a de `GET
 * /v1/gestao/fluxos/:id/equipe`, que é a equipe DESTE contato — o que
 * `TeamController._loadMembers()` faz na origem, por bot.
 *
 * Quem pode ver e quem pode mexer é decidido no servidor
 * (`dominio/gestao/equipe-do-fluxo.ts`): 403 vira o mesmo aviso de antes, em
 * vez de uma lista vazia que leria como "não há ninguém aqui".
 *
 * Sem `CascaDoModulo`: `cf-cabecalho`/`cf-container` (de `configuracoes.css`)
 * já centram em 80% sozinhos, do mesmo jeito que a `fx-coluna` do casco
 * comum — empilhar os dois apertaria o miolo a 64% (80% de 80%).
 */
export function TeamPage() {
  const { contact } = useContact();
  const read = useRead<TeamOfFlow>(`/v1/management/flows/${contact.id}/team`);
  const withoutPermission = read.error instanceof ApiError && read.error.status === 403;

  return (
    <div className="pt-app">
      <ContactBarras ativo="Equipe" />
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
