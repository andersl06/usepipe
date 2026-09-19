import type { EquipeDoFluxo } from '@pipe/contracts';
import { ErroDaApi } from '../../../lib/api';
import { useLeitura } from '../../../lib/consulta';
import { BarrasDoContato, useContato } from '../contato';
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
export function PaginaDeEquipe() {
  const { contato } = useContato();
  const leitura = useLeitura<EquipeDoFluxo>(`/v1/gestao/fluxos/${contato.id}/equipe`);
  const semPermissao = leitura.error instanceof ErroDaApi && leitura.error.status === 403;

  return (
    <div className="pt-app">
      <BarrasDoContato ativo="Equipe" />
      <main>
        {semPermissao ? (
          <p className="cf-aviso cf-container" role="alert">
            Você não tem permissão para ver a equipe.
          </p>
        ) : leitura.error ? (
          <p className="cf-aviso cf-container" role="alert">
            Não foi possível carregar a equipe: {leitura.error.message}
          </p>
        ) : !leitura.data ? null : (
          <TelaDeEquipe
            fluxoId={contato.id}
            podeGerir={leitura.data.podeGerir}
            recursos={leitura.data.recursos}
            membros={leitura.data.membros}
          />
        )}
      </main>
    </div>
  );
}
