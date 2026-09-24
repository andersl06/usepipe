import { useState } from 'react';
import { Botao, BotaoDeIcone } from '@pipe/ui';
import { useLeitura } from '../../lib/consulta';
import { ROTULO_ALVO, type FilaConfigurada, type RegraSlaConfigurada } from '../../lib/configuracoes';
import { editarRegraSla, excluirRegraSla } from '../../lib/configuracoes-gravar';
import { duracao } from '../../lib/formato';
import { ListaRegras, type SecaoDeRegras } from '../../componentes/lista-regras';
import { Modal, ModalConfirmacao } from './_modal';
import { FormularioRegraSla } from './regras-sla-formulario';

/**
 * A sigla que a coluna "Metas" deles usa para cada alvo (`dom/sla-policy.html`:
 * "TME, TMR1, TMA" — tempo médio de espera, tempo médio da 1ª resposta,
 * tempo médio de atendimento; `FICHA-sla-policy.md` §8). O nosso alvo é um
 * só por regra, então a coluna traz uma sigla; o prazo e o alerta vão no
 * `title` da célula, que é onde cabem sem abrir coluna que a tela deles não
 * tem.
 */
const SIGLA_DO_ALVO: Record<string, string> = {
  espera_fila: 'TME',
  primeira_resposta: 'TMR1',
  resposta: 'TMR',
  resolucao: 'TMA',
};

/**
 * Regras ├ SLA — `attendance/desk/sla-policy` da origem, medido em
 * `referencias-blip/fichas/FICHA-sla-policy.md` e conferido na foto
 * `fotos/original-sla-policy.png`.
 *
 * Esqueleto igual ao deles (§2): cabeçalho, busca sozinha embaixo ("Buscar
 * regras de SLA", §3), lista de cartões e rodapé de paginação (§5). O cartão
 * tem QUATRO colunas — "Regras de SLA", "Metas", "Filas atribuídas" e o selo
 * "Padrão" sem rótulo (§4) — e nada mais na linha além das ações.
 *
 * Divergências de DADO, não de layout:
 * - **Uma meta por regra.** Lá uma política combina vários alvos ("TME,
 *   TMR1"); aqui `regra_sla.alvo` é um valor só. A coluna traz a sigla do
 *   alvo, e o prazo/alerta ficam no `title`.
 * - **"Padrão" vem do escopo.** O que a origem chama de política padrão é,
 *   aqui, a regra de escopo `tenant` — a que `escolherRegra` usa como
 *   respaldo. O selo é essa regra, não um bit novo.
 * - **"Filas atribuídas"** é no máximo uma fila (ou toda a operação):
 *   `escopoTipo`/`escopoId` prendem a regra a um escopo só.
 *
 * `TODO(escrita)` removido: `PATCH`/`POST`/`DELETE` de verdade em
 * `/v1/gestao/configuracoes/regras` (item 2 da tarefa de cadastros do
 * Atendimento) — "Criar regra" e os ícones "Editar"/"Excluir" do cartão
 * (§5) entram, ligados como `regras-atendimento.tsx`: interruptor +
 * `ModalConfirmacao` para excluir, nunca `window.confirm`.
 */

/** Switch + editar/excluir — o slot `acao` do cartão-linha. */
function AcoesDaRegraSla({
  regra,
  onEditar,
  onExcluir,
}: {
  regra: RegraSlaConfigurada;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const alternar = async () => {
    await editarRegraSla(regra.id, { ativa: !regra.ativa });
  };
  return (
    <>
      <button
        type="button"
        className="interruptor"
        role="switch"
        aria-checked={regra.ativa}
        aria-label={regra.ativa ? `Desativar a regra ${regra.nome}` : `Ativar a regra ${regra.nome}`}
        title={regra.ativa ? 'Desativar esta regra' : 'Ativar esta regra'}
        onClick={() => void alternar()}
      >
        <span className="interruptor-bolinha" />
      </button>
      <BotaoDeIcone nome="lapis" rotulo={`Editar a regra ${regra.nome}`} onClick={onEditar} />
      <BotaoDeIcone nome="x" rotulo={`Excluir a regra ${regra.nome}`} onClick={onExcluir} />
    </>
  );
}

export function PaginaRegrasDeSla() {
  const [modalAberto, setModalAberto] = useState(false);
  const [regraEmEdicao, setRegraEmEdicao] = useState<RegraSlaConfigurada | null>(null);
  const [regraParaExcluir, setRegraParaExcluir] = useState<RegraSlaConfigurada | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const leitura = useLeitura<{ filas: FilaConfigurada[]; regras: RegraSlaConfigurada[] }>(
    '/v1/gestao/configuracoes/regras',
  );
  if (!leitura.data) return null;
  const { filas, regras } = leitura.data;

  async function excluir() {
    if (!regraParaExcluir) return;
    setExcluindo(true);
    setErroExclusao(null);
    const resultado = await excluirRegraSla(regraParaExcluir.id);
    setExcluindo(false);
    if (resultado.ok) setRegraParaExcluir(null);
    else setErroExclusao(resultado.erro);
  }

  const secoes: SecaoDeRegras[] = [
    {
      titulo: 'Regras de SLA',
      vazio: 'Nenhuma regra de SLA cadastrada',
      vazioDescricao: 'Toda conversa aparece como “Sem regra” no Monitoramento.',
      cartoes: regras.map((r) => {
        const filaAtribuida = r.escopoTipo === 'tenant' ? '' : (r.escopoNome ?? 'fila removida');
        const meta = SIGLA_DO_ALVO[r.alvo] ?? r.alvo;
        const prazo = `${ROTULO_ALVO[r.alvo] ?? r.alvo}: prazo ${duracao(r.prazoSeg)}${
          r.alertaSeg === null ? '' : `, alerta ${duracao(r.alertaSeg)}`
        }`;
        return {
          id: r.id,
          campos: [
            { rotulo: 'Regras de SLA', valor: r.nome },
            { rotulo: 'Metas', valor: meta, titulo: prazo },
            { rotulo: 'Filas atribuídas', valor: filaAtribuida },
          ],
          selo: r.escopoTipo === 'tenant' ? 'Padrão' : undefined,
          situacao: r.ativa ? 'Ativa' : 'Desativada',
          ativa: r.ativa,
          acao: (
            <AcoesDaRegraSla
              regra={r}
              onEditar={() => setRegraEmEdicao(r)}
              onExcluir={() => setRegraParaExcluir(r)}
            />
          ),
          procura: `${r.nome} ${meta} ${ROTULO_ALVO[r.alvo] ?? r.alvo} ${filaAtribuida}`.toLowerCase(),
        };
      }),
    },
  ];

  return (
    <>
      <div className="board-head">
        <h2>Regras de SLA</h2>
        <Botao
          variante="primario"
          icone="mais"
          className="board-acao"
          onClick={() => setModalAberto(true)}
        >
          Nova regra
        </Botao>
      </div>

      <ListaRegras
        secoes={secoes}
        placeholder="Buscar regras de SLA"
        ocultarCabecalhoDeSecao
        paginar
        tamanhoDePaginaInicial={5}
      />

      <Modal aberto={modalAberto} titulo="Nova regra de SLA" onFechar={() => setModalAberto(false)}>
        <FormularioRegraSla filas={filas} aoSalvar={() => setModalAberto(false)} />
      </Modal>

      <Modal
        aberto={regraEmEdicao !== null}
        titulo="Editar regra de SLA"
        onFechar={() => setRegraEmEdicao(null)}
      >
        {regraEmEdicao ? (
          <FormularioRegraSla
            filas={filas}
            regraExistente={regraEmEdicao}
            aoSalvar={() => setRegraEmEdicao(null)}
          />
        ) : null}
      </Modal>

      <ModalConfirmacao
        aberto={regraParaExcluir !== null}
        titulo="Excluir regra de SLA"
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
