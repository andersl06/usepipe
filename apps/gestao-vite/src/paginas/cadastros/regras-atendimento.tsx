import { useState } from 'react';
import { Botao } from '@pipe/ui';
import { useLeitura } from '../../lib/consulta';
import type { FilaParaEscolher, RegraDeFilaCadastrada } from '../../lib/cadastros';
import { descreverRegra, regrasInalcancaveis, rotuloDoCampo } from '../../lib/regra-fila';
import { ListaRegras, type SecaoDeRegras } from '../../componentes/lista-regras';
import { alternarRegraFila } from '../../lib/acoes';
import { Modal } from './_modal';
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
 * Sem edição por id nem exclusão: `lib/acoes.ts`/a API só têm criar e
 * alternar ativo/inativo para esta regra hoje — os ícones "Editar"/"Excluir"
 * do cartão deles (`FICHA-rules.md` §5) ficam de fora em vez de simular uma
 * ação que não existe.
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
  const [modalAberto, setModalAberto] = useState(false);
  const leitura = useLeitura<RegrasDeFila>('/v1/gestao/regras/atendimento');
  if (!leitura.data) return null;
  const { regras, filas, padroes } = leitura.data;
  const mortas = new Set(regrasInalcancaveis(regras));

  const secoes: SecaoDeRegras[] = [
    {
      titulo: 'Regras de atendimento',
      vazio:
        'Nenhuma regra de entrada. Toda conversa cai na fila padrão da caixa de entrada por onde ela chegou.',
      cartoes: regras.map((r) => ({
        id: r.id,
        campos: [
          { rotulo: 'Nome da Regra', valor: r.nome },
          { rotulo: 'Fila', valor: r.filaDestinoNome },
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
        <Botao
          variante="primario"
          icone="mais"
          className="board-acao"
          onClick={() => setModalAberto(true)}
        >
          Criar nova regra
        </Botao>
      </div>

      <ListaRegras
        secoes={secoes}
        placeholder="Buscar regras de atendimento"
        ocultarCabecalhoDeSecao
        paginar
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
    </>
  );
}
