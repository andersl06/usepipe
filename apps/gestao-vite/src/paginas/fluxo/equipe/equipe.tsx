import { useEu } from '../../../contexto/sessao';
import { useLeitura } from '../../../lib/consulta';
import type { MembroDoContrato, PapelDaConta } from '../../../lib/contrato';
import { PAPEIS_DA_ORIGEM, ehPapelDeConta } from '../../contrato/catalogo';
import { BarrasDoContato } from '../contato';
import { TelaDeEquipe } from './tela';

/**
 * `/team` do roteador (LEIA.md, captura 1). O Pipe ainda não tem RBAC por
 * fluxo (`../itens.ts`) — a lista é a mesma conferência de `conta.membros.ler`
 * que `/contrato/membros` usa, e é a mesma consulta: `GET
 * /v1/gestao/contrato/membros`. Sem essa permissão, a tela avisa em vez de
 * fingir uma lista vazia.
 *
 * Sem `CascaDoModulo`: `cf-cabecalho`/`cf-container` (de `configuracoes.css`)
 * já centram em 80% sozinhos, do mesmo jeito que a `fx-coluna` do casco
 * comum — empilhar os dois apertaria o miolo a 64% (80% de 80%). A mesma
 * razão pela qual `Serviços` e `Canais` também desenham o próprio `<main>`.
 *
 * O selo de papel nunca fica em branco: todo usuário de verdade tem um papel
 * de conta (migração 0021), mas `packages/db/src/semente-demo.ts` cria os
 * atendentes de demonstração (`garantirUsuario`) sem gravar `usuario_papel` —
 * quem semeou esses e-mails antes da migração ficou sem o backfill. Em vez de
 * um selo vazio (que lê como "o papel sumiu"), mostra o nome cru do papel se
 * houver um fora dos três de conta, e "Sem papel" se não houver nenhum.
 */
function rotuloDoPapel(papelNome: string | null): string {
  if (ehPapelDeConta(papelNome)) return PAPEIS_DA_ORIGEM[papelNome].rotulo;
  return papelNome ?? 'Sem papel';
}

export function PaginaDeEquipe() {
  const eu = useEu();
  const podeLer = eu.permissoes.includes('conta.membros.ler');
  const podeEscrever = eu.permissoes.includes('conta.membros.escrever');
  const leitura = useLeitura<{ membros: MembroDoContrato[]; papeis: PapelDaConta[] }>(
    podeLer ? '/v1/gestao/contrato/membros' : null,
  );

  return (
    <div className="pt-app">
      <BarrasDoContato ativo="Equipe" />
      <main>
        {!podeLer ? (
          <p className="cf-aviso cf-container" role="alert">
            Você não tem permissão para ver a equipe.
          </p>
        ) : !leitura.data ? null : (
          <TelaDeEquipe
            podeEscrever={podeEscrever}
            membros={leitura.data.membros
              .filter((m) => !(m.tipo === 'usuario' && m.id === eu.usuario.id))
              .map((m) => ({
                id: m.id,
                nome: m.nome,
                email: m.email,
                papel: rotuloDoPapel(m.papelNome),
              }))}
          />
        )}
      </main>
    </div>
  );
}
