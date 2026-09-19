import { useState } from 'react';
import { Botao, BotaoDeIcone, Etiqueta } from '@pipe/ui';
import { useLeitura } from '../../lib/consulta';
import type { FilaParaEscolher, RegraDeFilaCadastrada } from '../../lib/cadastros';
import { descreverRegra, regrasInalcancaveis, rotuloDoCampo } from '../../lib/regra-fila';
import { ListaRegras, type SecaoDeRegras } from '../../componentes/lista-regras';
import { alternarRegraFila } from '../../lib/acoes';
import { editarRegraFila, excluirRegraFila } from '../../lib/cadastros-gravar';
import { Modal, ModalConfirmacao } from './_modal';
import { FormularioRegraFila } from './regras-atendimento-formulario';

interface RegrasDeFila {
  regras: RegraDeFilaCadastrada[];
  filas: FilaParaEscolher[];
  padroes: { inbox: string; fila: string | null }[];
}

/**
 * Regras ├ Atendimento — a regra de entrada.
 *
 * Esqueleto medido em `FICHA-rules.md` §2: cabeçalho com "Criar nova regra"
 * à direita (sem subtítulo), busca sozinha embaixo, cartão-linha com só
 * "Nome da Regra"/"Fila" como coluna (§4) e o rodapé de paginação (§2.5). O
 * cartão-linha em si — rótulo 12/400 sobre valor 16/700, interruptor que liga
 * e desliga o registro na própria lista — é o mesmo de sempre.
 *
 * O combinador, a ordem de avaliação e o aviso de regra inalcançável não são
 * coluna na ficha (ela só documenta "Nome da Regra" e "Fila"), mas continuam
 * decisivos para prever o que a regra faz — por isso ficam no rodapé do
 * cartão (`descreverRegra`/avisos), que é anotação por linha, não uma coluna
 * nova nem um bloco novo na página. "Criar nova regra" abre modal — a Blip
 * não mostra o formulário na página, ele mora dentro do modal fechado que o
 * material capturou para as telas irmãs (`FICHA-queue-management.md` §2.6).
 *
 * Editar/excluir (item 1, segunda parte) entraram: o ícone "Editar" reabre o
 * mesmo modal, com `FormularioRegraFila` em modo edição; o ícone "Excluir"
 * pede confirmação em `ModalConfirmacao` — nunca `window.confirm`, que é o
 * padrão provisório que `atendentes-filas.tsx` ainda usa (comentário lá
 * mesmo diz isso). REORDENAR é as duas setas do rodapé: cada clique troca a
 * regra de posição com a vizinha e manda um `PATCH` por regra cuja `ordem`
 * mudou — sem endpoint próprio (decisão registrada em `cadastros.ts`).
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

/** Switch + setas de reordenar + editar/excluir — o slot `acao` do cartão-linha. */
function AcoesDaRegra({
  regra,
  primeira,
  ultima,
  onMover,
  onEditar,
  onExcluir,
}: {
  regra: RegraDeFilaCadastrada;
  primeira: boolean;
  ultima: boolean;
  onMover: (direcao: -1 | 1) => void;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  return (
    <>
      <Interruptor id={regra.id} ativa={regra.ativa} nome={regra.nome} />
      <BotaoDeIcone
        nome="cima"
        rotulo={`Mover "${regra.nome}" para cima — avalia antes`}
        onClick={() => onMover(-1)}
        disabled={primeira}
      />
      <BotaoDeIcone
        nome="baixo"
        rotulo={`Mover "${regra.nome}" para baixo — avalia depois`}
        onClick={() => onMover(1)}
        disabled={ultima}
      />
      <BotaoDeIcone nome="lapis" rotulo={`Editar a regra ${regra.nome}`} onClick={onEditar} />
      <BotaoDeIcone nome="x" rotulo={`Excluir a regra ${regra.nome}`} onClick={onExcluir} />
    </>
  );
}

export function PaginaRegrasDeAtendimento() {
  const [modalAberto, setModalAberto] = useState(false);
  const [regraEmEdicao, setRegraEmEdicao] = useState<RegraDeFilaCadastrada | null>(null);
  const [regraParaExcluir, setRegraParaExcluir] = useState<RegraDeFilaCadastrada | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const [erroReordenar, setErroReordenar] = useState<string | null>(null);
  const leitura = useLeitura<RegrasDeFila>('/v1/gestao/regras/atendimento');
  if (!leitura.data) return null;
  const { regras, filas, padroes } = leitura.data;
  const mortas = new Set(regrasInalcancaveis(regras));

  // `regras` já vem ordenada por `ordem`/id (mesma ordem que `ordenarRegras`
  // aplica no motor) — trocar de posição na lista é trocar de posição de
  // avaliação. Renumera sequencialmente em vez de só trocar `ordem` entre as
  // duas: se as duas empatarem (o padrão de toda regra nova é `ordem: 0`),
  // trocar valores iguais não move nada.
  async function mover(id: string, direcao: -1 | 1) {
    const i = regras.findIndex((r) => r.id === id);
    const j = i + direcao;
    if (i < 0 || j < 0 || j >= regras.length) return;
    setErroReordenar(null);
    const nova = [...regras];
    const tmp = nova[i]!;
    nova[i] = nova[j]!;
    nova[j] = tmp;
    for (const [indice, r] of nova.entries()) {
      if (r.ordem === indice) continue;
      const resultado = await editarRegraFila(r.id, { ordem: indice });
      if (!resultado.ok) {
        setErroReordenar(resultado.erro);
        return;
      }
    }
  }

  async function excluir() {
    if (!regraParaExcluir) return;
    setExcluindo(true);
    setErroExclusao(null);
    const resultado = await excluirRegraFila(regraParaExcluir.id);
    setExcluindo(false);
    if (resultado.ok) setRegraParaExcluir(null);
    else setErroExclusao(resultado.erro);
  }

  const secoes: SecaoDeRegras[] = [
    {
      titulo: 'Regras de atendimento',
      vazio:
        'Nenhuma regra de entrada. Toda conversa cai na fila padrão da caixa de entrada por onde ela chegou.',
      cartoes: regras.map((r, indice) => ({
        id: r.id,
        campos: [
          { rotulo: 'Nome da Regra', valor: r.nome },
          { rotulo: 'Fila', valor: r.filaDestinoNome },
        ],
        situacao: r.ativa ? 'Ativa' : 'Desativada',
        ativa: r.ativa,
        acao: (
          <AcoesDaRegra
            regra={r}
            primeira={indice === 0}
            ultima={indice === regras.length - 1}
            onMover={(direcao) => void mover(r.id, direcao)}
            onEditar={() => setRegraEmEdicao(r)}
            onExcluir={() => setRegraParaExcluir(r)}
          />
        ),
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
        <Botao
          variante="primario"
          icone="mais"
          className="board-acao"
          onClick={() => setModalAberto(true)}
        >
          Criar nova regra
        </Botao>
      </div>

      {erroReordenar ? <Etiqueta tom="erro">{erroReordenar}</Etiqueta> : null}

      {/* "Resultados por página" nasce em 5, como o `bds-select value="5"` do
          rodapé deles (`dom/rules.html`). */}
      <ListaRegras
        secoes={secoes}
        placeholder="Buscar regras de atendimento"
        ocultarCabecalhoDeSecao
        paginar
        tamanhoDePaginaInicial={5}
      />

      <Modal aberto={modalAberto} titulo="Nova regra" onFechar={() => setModalAberto(false)}>
        <p className="sub">
          As regras são avaliadas <b>de cima para baixo</b>, na ordem da lista, e a{' '}
          <b>primeira que casa vence</b> — as de baixo nem chegam a ser testadas. Dentro de cada
          regra, as condições se combinam com <b>E</b> (todas precisam casar) ou com <b>OU</b>
          (basta uma). Não casou nenhuma? A conversa segue para a fila padrão da caixa de entrada
          por onde ela chegou —{' '}
          {padroes.length === 0
            ? 'e não há caixa de entrada cadastrada.'
            : padroes.map((p) => `${p.inbox}: ${p.fila ?? 'sem fila padrão'}`).join(' · ')}
          .
        </p>
        <FormularioRegraFila filas={filas} aoSalvar={() => setModalAberto(false)} />
      </Modal>

      <Modal
        aberto={regraEmEdicao !== null}
        titulo="Editar regra"
        onFechar={() => setRegraEmEdicao(null)}
      >
        {regraEmEdicao ? (
          <FormularioRegraFila
            filas={filas}
            regraExistente={regraEmEdicao}
            aoSalvar={() => setRegraEmEdicao(null)}
          />
        ) : null}
      </Modal>

      <ModalConfirmacao
        aberto={regraParaExcluir !== null}
        titulo="Excluir regra"
        mensagem={
          <>
            Excluir a regra “{regraParaExcluir?.nome}”? Esta ação não pode ser desfeita.
          </>
        }
        erro={erroExclusao}
        confirmando={excluindo}
        onConfirmar={() => void excluir()}
        onCancelar={() => {
          setRegraParaExcluir(null);
          setErroExclusao(null);
        }}
      />
    </>
  );
}
