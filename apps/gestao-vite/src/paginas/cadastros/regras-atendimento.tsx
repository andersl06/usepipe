import { useLeitura } from '../../lib/consulta';
import type { FilaParaEscolher, RegraDeFilaCadastrada } from '../../lib/cadastros';
import { descreverRegra, regrasInalcancaveis, rotuloDoCampo } from '../../lib/regra-fila';
import { numero } from '../../lib/formato';
import { ListaRegras, type SecaoDeRegras } from '../../componentes/lista-regras';
import { alternarRegraFila } from '../../lib/acoes';
import { FormularioRegraFila } from './regras-atendimento-formulario';

interface RegrasDeFila {
  regras: RegraDeFilaCadastrada[];
  filas: FilaParaEscolher[];
  padroes: { inbox: string; fila: string | null }[];
}

/**
 * Regras ├ Atendimento — a regra de entrada.
 *
 * A lacuna que `estrutura-gestao.tsx` registrava: eles têm o item, nós tínhamos
 * SLA e Horários e faltava a regra que decide para QUAL FILA a conversa cai.
 *
 * Disposição: o cartão-linha deles (`blip-telas-cadastro.md` §2) — rótulo 12/400
 * sobre valor 16/700, controles à direita, e o interruptor que liga e desliga o
 * registro na própria lista, sem abrir formulário.
 *
 * O que a tela mostra e a deles não: a ORDEM de avaliação como primeira coluna,
 * o combinador escrito por extenso no pé do cartão, e o aviso de regra
 * inalcançável. São as duas coisas que a §8 da spec define e a documentação
 * deles não resolve — sem elas, ninguém consegue prever o que a regra faz.
 */

/** O interruptor do cartão. Formulário de um botão: não há nada digitado a preservar. */
function Interruptor({ id, ativa, nome }: { id: string; ativa: boolean; nome: string }) {
  return (
    <form action={(dados: FormData) => void alternarRegraFila({ ok: true }, dados)}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="interruptor"
        role="switch"
        aria-checked={ativa}
        aria-label={ativa ? `Desativar a regra ${nome}` : `Ativar a regra ${nome}`}
        title={ativa ? 'Desativar esta regra' : 'Ativar esta regra'}
      >
        <span className="interruptor-bolinha" />
      </button>
    </form>
  );
}

export function PaginaRegrasDeAtendimento() {
  const leitura = useLeitura<RegrasDeFila>('/v1/gestao/regras/atendimento');
  if (!leitura.data) return null;
  const { regras, filas, padroes } = leitura.data;
  const mortas = new Set(regrasInalcancaveis(regras));
  const semDestino = regras.filter((r) => r.ativa && !r.filaDestinoAtiva);

  const secoes: SecaoDeRegras[] = [
    {
      titulo: 'Ordem de avaliação',
      vazio:
        'Nenhuma regra de entrada. Toda conversa cai na fila padrão da caixa de entrada por onde ela chegou.',
      cartoes: regras.map((r, i) => ({
        id: r.id,
        campos: [
          { rotulo: 'Avaliada em', valor: `${numero(i + 1)}º`, classe: 'num' },
          { rotulo: 'Nome da regra', valor: r.nome },
          { rotulo: 'Fila de destino', valor: r.filaDestinoNome },
          { rotulo: 'Combina com', valor: r.combinador === 'e' ? 'E — todas' : 'OU — qualquer' },
          { rotulo: 'Condições', valor: numero(r.condicoes.length), classe: 'num' },
        ],
        situacao: r.ativa ? 'Ativa' : 'Desativada',
        ativa: r.ativa,
        acao: <Interruptor id={r.id} ativa={r.ativa} nome={r.nome} />,
        rodape: [
          descreverRegra(r),
          ...(mortas.has(r.id) ? ['Inalcançável — uma regra acima já casa o mesmo caso'] : []),
          ...(r.ativa && !r.filaDestinoAtiva
            ? [`Fila “${r.filaDestinoNome}” está desativada — a conversa cai nela e para`]
            : []),
        ],
        procura: `${r.nome} ${r.filaDestinoNome} ${r.condicoes
          .map((c) => `${rotuloDoCampo(c.campo)} ${c.valor}`)
          .join(' ')}`.toLowerCase(),
      })),
    },
  ];

  return (
    <>
      <div className="board-head">
        <h2>Regras de atendimento</h2>
        <span className="sub">
          {numero(regras.length)} regras de entrada. Elas decidem em qual fila a conversa cai quando
          chega, antes de qualquer atendente ver.
        </span>
      </div>

      <section className="card">
        <h3>Como a regra é avaliada</h3>
        <p className="sub">
          As regras são avaliadas <b>de cima para baixo</b>, na ordem da lista, e a{' '}
          <b>primeira que casa vence</b> — as de baixo nem chegam a ser testadas. Dentro de cada
          regra, as condições se combinam com <b>E</b> (todas precisam casar) ou com <b>OU</b>
          (basta uma), e o combinador aparece no cartão porque sem ele ninguém consegue prever o que
          a regra faz.
        </p>
        <p className="sub">
          Não casou nenhuma? A conversa segue para a <b>fila padrão da caixa de entrada</b> por onde
          ela chegou —{' '}
          {padroes.length === 0
            ? 'e não há caixa de entrada cadastrada.'
            : padroes.map((p) => `${p.inbox}: ${p.fila ?? 'sem fila padrão'}`).join(' · ')}
          .
        </p>
        <p className="note">
          A comparação ignora acento e caixa: “BOLETO”, “boleto” e “Boléto” casam a mesma condição.
          É a mesma normalização que o motor de score do <code>@pipe/core</code> usa — uma segunda
          definição de “contém” seria uma segunda regra.
        </p>
      </section>

      <FormularioRegraFila filas={filas} />

      {mortas.size > 0 ? (
        <div className="note">
          {numero(mortas.size)} regra(s) nunca serão alcançadas: ou estão sem condição, ou repetem
          uma regra que já vem antes na ordem. Elas estão marcadas na lista.
        </div>
      ) : null}

      {semDestino.length > 0 ? (
        <div className="note">
          {numero(semDestino.length)} regra(s) ativa(s) apontam para fila desativada. Fila
          desativada não recebe conversa nova — a conversa casa a regra e fica parada.
        </div>
      ) : null}

      <ListaRegras secoes={secoes} placeholder="Buscar por regra, fila de destino ou condição" />
    </>
  );
}
