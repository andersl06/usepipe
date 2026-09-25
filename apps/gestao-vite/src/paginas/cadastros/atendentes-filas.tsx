import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Botao, BotaoDeIcone, Etiqueta } from '@pipe/ui';
import { useRead } from '../../lib/consulta';
import type { QueueRegistered } from '../../lib/cadastros';
import { alternarQueue, excluirQueue } from '../../lib/cadastros-gravar';
import { numero } from '../../lib/formato';
import { ListaRegras, type RulesSection } from '../../componentes/lista-regras';
import { useContact } from '../fluxo/contato';
import { attendanceBase } from '../operacao/casca';
import { FormularioQueue } from './atendentes-filas-formulario';
import { Modal, ModalConfirmation } from './_modal';

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
function QueueActions({
  queue,
  onErrorAlternar,
  onEditar,
  onExcluir,
}: {
  queue: QueueRegistered;
  onErrorAlternar: (error: string) => void;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const alternar = async () => {
    const r = await alternarQueue(queue.id, queue.active);
    if (!r.ok) onErrorAlternar(r.error);
  };
  return (
    <>
      <button
        type="button"
        className="interruptor"
        role="switch"
        aria-checked={queue.active}
        aria-label={queue.active ? `Desativar a fila ${queue.nome}` : `Ativar a fila ${queue.nome}`}
        title={queue.active ? 'Desativar esta fila' : 'Ativar esta fila'}
        onClick={() => void alternar()}
      >
        <span className="interruptor-bolinha" />
      </button>
      <BotaoDeIcone nome="lapis" rotulo="Editar" onClick={onEditar} />
      <BotaoDeIcone nome="x" rotulo="Excluir" onClick={onExcluir} />
    </>
  );
}

export function PageQueues() {
  const navegar = useNavigate();
  const { contact } = useContact();
  const base = attendanceBase(contact.tipo, contact.id);
  const [modalAberto, setModalAberto] = useState(false);
  const [queueForExcluir, setQueueForExcluir] = useState<QueueRegistered | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [errorExclusao, setErrorExclusao] = useState<string | null>(null);
  const [errorAlternar, setErrorAlternar] = useState<string | null>(null);
  const read = useRead<{ queues: QueueRegistered[] }>('/v1/management/agents/queues');
  if (!read.data) return null;
  const { queues } = read.data;

  async function excluir() {
    if (!queueForExcluir) return;
    setExcluindo(true);
    setErrorExclusao(null);
    const resultado = await excluirQueue(queueForExcluir.id);
    setExcluindo(false);
    if (resultado.ok) setQueueForExcluir(null);
    else setErrorExclusao(resultado.error);
  }

  const sections: RulesSection[] = [
    {
      titulo: 'Filas de atendimento',
      empty: 'Ops! Você ainda não tem nenhuma fila de atendimento.',
      cards: queues.map((f) => ({
        id: f.id,
        campos: [
          { rotulo: 'Fila de atendimento', valor: f.nome },
          { rotulo: 'Atendentes atribuídos', valor: numero(f.agents.length), classe: 'num' },
        ],
        situacao: f.active ? 'Ativa' : 'Desativada',
        ativa: f.active,
        acao: (
          <QueueActions
            queue={f}
            onErrorAlternar={setErrorAlternar}
            onEditar={() => navegar(`${base}/atendentes/filas/${f.id}/editar`)}
            onExcluir={() => setQueueForExcluir(f)}
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

      {errorAlternar ? <Etiqueta tom="erro">{errorAlternar}</Etiqueta> : null}

      <ListaRegras
        sections={sections}
        placeholder="Buscar fila"
        sectionOcultarHeader
        paginar
        pageInitialTamanho={5}
      />

      <Modal aberto={modalAberto} titulo="Criar nova fila" onFechar={() => setModalAberto(false)}>
        <FormularioQueue aoSalvar={() => setModalAberto(false)} />
      </Modal>

      <ModalConfirmation
        aberto={queueForExcluir !== null}
        titulo="Confirmar exclusão"
        message={<>Excluir a fila "{queueForExcluir?.nome}"? Esta ação não pode ser desfeita.</>}
        error={errorExclusao}
        confirmando={excluindo}
        onConfirmar={() => void excluir()}
        onCancelar={() => {
          setQueueForExcluir(null);
          setErrorExclusao(null);
        }}
      />
    </>
  );
}
