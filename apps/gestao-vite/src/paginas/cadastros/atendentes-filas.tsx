import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Botao, BotaoDeIcone, Etiqueta } from '@pipe/ui';
import { useLeitura } from '../../lib/consulta';
import type { FilaCadastrada } from '../../lib/cadastros';
import { alternarFila, excluirFila } from '../../lib/cadastros-gravar';
import { numero } from '../../lib/formato';
import { ListaRegras, type SecaoDeRegras } from '../../componentes/lista-regras';
import { useContato } from '../fluxo/contato';
import { baseDoAtendimento } from '../operacao/casca';
import { FormularioFila } from './atendentes-filas-formulario';
import { Modal, ModalConfirmacao } from './_modal';

/**
 * Filas de atendimento — a lista.
 *
 * Esqueleto e textos medidos em `referencias-blip/portal/dom/
 * FICHA-atendentes-filas-pausas.md` §b.1: cabeçalho "Filas de atendimento" com
 * "Nova fila" à direita e sem subtítulo, busca "Buscar fila" sozinha na linha
 * abaixo, cartão-linha de 86px com DUAS colunas — "Fila de atendimento" e
 * "Atendentes atribuídos" — e, à direita, interruptor + "Editar" + "Excluir".
 * Rodapé "Resultados por página" com as opções da origem.
 *
 * **O que saiu do cartão, e por quê.** Ele carregava um rodapé com cor,
 * capacidade padrão, ordem, horário, teto simultâneo e a lista de atendentes
 * habilitados — seis linhas de informação que a origem não põe aqui (§d.1 da
 * ficha: "Rodapé do cartão: não existe"). Tudo isso mudou de casa para a
 * página de edição da fila, que é onde a origem também põe o que é
 * configuração. O cartão voltou a ser o cartão.
 *
 * **"Editar" abre PÁGINA, não modal.** É o que o dono cobrou, e é o que o
 * roteador da origem diz: `attendance.desk.queueManagement.edit` tem
 * `url:"/edit/:id"` (§a.1 da ficha). Aqui: `atendentes/filas/:id/editar`.
 *
 * Toggle e exclusão continuam no cartão (`PATCH`/`DELETE` em
 * `/v1/gestao/atendentes/filas/:id`), com a confirmação em `ModalConfirmacao`
 * — nunca `window.confirm`/`window.alert`. A recusa do toggle vira `Etiqueta`
 * acima da lista, porque não há modal aberto onde ela pudesse morar.
 */

/** O interruptor + editar/excluir do cartão-linha — o slot `acao` de `lista-regras.tsx`. */
function AcoesDaFila({
  fila,
  onErroAlternar,
  onEditar,
  onExcluir,
}: {
  fila: FilaCadastrada;
  onErroAlternar: (erro: string) => void;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const alternar = async () => {
    const r = await alternarFila(fila.id, fila.ativa);
    if (!r.ok) onErroAlternar(r.erro);
  };
  return (
    <>
      <button
        type="button"
        className="interruptor"
        role="switch"
        aria-checked={fila.ativa}
        aria-label={fila.ativa ? `Desativar a fila ${fila.nome}` : `Ativar a fila ${fila.nome}`}
        title={fila.ativa ? 'Desativar esta fila' : 'Ativar esta fila'}
        onClick={() => void alternar()}
      >
        <span className="interruptor-bolinha" />
      </button>
      <BotaoDeIcone nome="lapis" rotulo="Editar" onClick={onEditar} />
      <BotaoDeIcone nome="x" rotulo="Excluir" onClick={onExcluir} />
    </>
  );
}

export function PaginaFilas() {
  const navegar = useNavigate();
  const { contato } = useContato();
  const base = baseDoAtendimento(contato.tipo, contato.id);
  const [modalAberto, setModalAberto] = useState(false);
  const [filaParaExcluir, setFilaParaExcluir] = useState<FilaCadastrada | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  const [erroAlternar, setErroAlternar] = useState<string | null>(null);
  const leitura = useLeitura<{ filas: FilaCadastrada[] }>('/v1/gestao/atendentes/filas');
  if (!leitura.data) return null;
  const { filas } = leitura.data;

  async function excluir() {
    if (!filaParaExcluir) return;
    setExcluindo(true);
    setErroExclusao(null);
    const resultado = await excluirFila(filaParaExcluir.id);
    setExcluindo(false);
    if (resultado.ok) setFilaParaExcluir(null);
    else setErroExclusao(resultado.erro);
  }

  const secoes: SecaoDeRegras[] = [
    {
      titulo: 'Filas de atendimento',
      vazio: 'Ops! Você ainda não tem nenhuma fila de atendimento.',
      cartoes: filas.map((f) => ({
        id: f.id,
        campos: [
          { rotulo: 'Fila de atendimento', valor: f.nome },
          { rotulo: 'Atendentes atribuídos', valor: numero(f.atendentes.length), classe: 'num' },
        ],
        situacao: f.ativa ? 'Ativa' : 'Desativada',
        ativa: f.ativa,
        acao: (
          <AcoesDaFila
            fila={f}
            onErroAlternar={setErroAlternar}
            onEditar={() => navegar(`${base}/atendentes/filas/${f.id}/editar`)}
            onExcluir={() => setFilaParaExcluir(f)}
          />
        ),
        procura: f.nome.toLowerCase(),
      })),
    },
  ];

  return (
    <>
      <div className="board-head">
        <h2>Filas de atendimento</h2>
        <Botao
          variante="primario"
          icone="mais"
          className="board-acao"
          onClick={() => setModalAberto(true)}
        >
          Nova fila
        </Botao>
      </div>

      {erroAlternar ? <Etiqueta tom="erro">{erroAlternar}</Etiqueta> : null}

      <ListaRegras
        secoes={secoes}
        placeholder="Buscar fila"
        ocultarCabecalhoDeSecao
        paginar
        tamanhoDePaginaInicial={5}
      />

      <Modal aberto={modalAberto} titulo="Criar nova fila" onFechar={() => setModalAberto(false)}>
        <FormularioFila aoSalvar={() => setModalAberto(false)} />
      </Modal>

      <ModalConfirmacao
        aberto={filaParaExcluir !== null}
        titulo="Confirmar exclusão"
        mensagem={<>Excluir a fila "{filaParaExcluir?.nome}"? Esta ação não pode ser desfeita.</>}
        erro={erroExclusao}
        confirmando={excluindo}
        onConfirmar={() => void excluir()}
        onCancelar={() => {
          setFilaParaExcluir(null);
          setErroExclusao(null);
        }}
      />
    </>
  );
}
