import { useState } from 'react';
import { Botao, BotaoDeIcone, Etiqueta } from '@pipe/ui';
import { useRead } from '../../lib/query';
import type { RespostaProntaListada } from '../../lib/communication';
import { alternarRespostaPronta, excluirRespostaPronta } from '../../lib/communication-gravar';
import { ListaRegras, type RulesSection } from '../../components/lista-regras';
import { FormularioRespostaPronta } from './communication-respostas-formulario';
import { Modal, ModalConfirmation } from './_modal';

/** The switch and the "Excluir" on the row card — `PATCH`/`DELETE` on `.../respostas-prontas/:id`. */
function ResponseActions({
  resposta,
  onErrorToggle,
  onExcluir,
}: {
  resposta: RespostaProntaListada;
  onErrorToggle: (error: string) => void;
  onExcluir: () => void;
}) {
  const alternar = async () => {
    const r = await alternarRespostaPronta(resposta.id, resposta.active);
    if (!r.ok) onErrorToggle(r.error);
  };
  return (
    <>
      <button
        type="button"
        className="interruptor"
        role="switch"
        aria-checked={resposta.active}
        aria-label={
          resposta.active ? `Desativar a resposta ${resposta.titulo}` : `Ativar a resposta ${resposta.titulo}`
        }
        title={resposta.active ? 'Desativar esta resposta' : 'Ativar esta resposta'}
        onClick={() => void alternar()}
      >
        <span className="interruptor-bolinha" />
      </button>
      <BotaoDeIcone nome="x" rotulo={`Excluir a resposta ${resposta.titulo}`} onClick={onExcluir} />
    </>
  );
}

/**
 * Canned replies — the company's ones. Personal ones are created and organized by the attendant alone in Desk (§5 of `docs/specs/2026-09-05-desk-requisitos.md`), so they don't appear on this management screen. `FICHA-replies.md` was captured with an empty list — the material only confirms the header with "Criar categoria" on the right (§2.1) and the empty-state text (§6); there's no column or row with real data to copy. A structural mismatch the ficha doesn't resolve: Blip organizes replies into CATEGORIES (you create the category first, the reply lives inside it); our registration is a flat list, with no category — changing that is new-data design (table/API), beyond what this screen alone decides. That's why the header button here reads "Nova resposta pronta" (what the screen actually does) instead of "Criar categoria". Reuses `ListaRegras`, the same search-enabled list card from the Rules screen — the card already handles search, grouping and empty state without rewriting any of that here.
 */
export function PageCannedResponses() {
  const [modalAberto, setModalAberto] = useState(false);
  const [respostaParaExcluir, setRespostaParaExcluir] = useState<RespostaProntaListada | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [errorDeletion, setErrorDeletion] = useState<string | null>(null);
  const [errorToggle, setErrorToggle] = useState<string | null>(null);
  const read = useRead<RespostaProntaListada[]>('/v1/management/communication/responses-ready');
  if (!read.data) return null;
  const respostas = read.data;

  async function excluir() {
    if (!respostaParaExcluir) return;
    setExcluindo(true);
    setErrorDeletion(null);
    const resultado = await excluirRespostaPronta(respostaParaExcluir.id);
    setExcluindo(false);
    if (resultado.ok) setRespostaParaExcluir(null);
    else setErrorDeletion(resultado.error);
  }

  const sections: RulesSection[] = [
    {
      titulo: 'Respostas prontas',
      /*
       * Their literal empty-state text — `FICHA-replies.md` §6, the only part of the material not subject to the category mismatch described above: the text doesn't mention category or #, so it's copied without caveat.
       */
      empty: 'Você ainda não criou respostas prontas',
      emptyDescription: 'Crie respostas para agilizar seus atendimentos',
      cards: respostas.map((r) => ({
        id: r.id,
        campos: [
          { rotulo: 'Atalho', value: `#${r.atalho}` },
          { rotulo: 'Título', value: r.titulo },
          { rotulo: 'Fila / canal', value: r.categoria ?? '—' },
          { rotulo: 'Corpo', value: r.corpo },
        ],
        situation: r.active ? 'Ativa' : 'Desativada',
        active: r.active,
        acao: (
          <ResponseActions
            resposta={r}
            onErrorToggle={setErrorToggle}
            onExcluir={() => setRespostaParaExcluir(r)}
          />
        ),
        procura: `${r.titulo} ${r.atalho}`.toLowerCase(),
      })),
    },
  ];

  return (
    <>
      <div className="board-head">
        <h2>Respostas prontas</h2>
        <Botao
          variante="primario"
          icone="mais"
          className="board-acao"
          onClick={() => setModalAberto(true)}
        >
          Nova resposta pronta
        </Botao>
      </div>

      {errorToggle ? <Etiqueta tom="erro">{errorToggle}</Etiqueta> : null}

      <ListaRegras sections={sections} placeholder="Buscar por título ou por atalho" sectionHideHeader />

      <Modal
        aberto={modalAberto}
        titulo="Nova resposta pronta"
        onFechar={() => setModalAberto(false)}
      >
        <FormularioRespostaPronta aoSalvar={() => setModalAberto(false)} />
      </Modal>

      <ModalConfirmation
        aberto={respostaParaExcluir !== null}
        titulo="Excluir resposta"
        message={
          <>Excluir a resposta "{respostaParaExcluir?.titulo}"? Esta ação não pode ser desfeita.</>
        }
        error={errorDeletion}
        confirmando={excluindo}
        onConfirmar={() => void excluir()}
        onCancelar={() => {
          setRespostaParaExcluir(null);
          setErrorDeletion(null);
        }}
      />
    </>
  );
}
