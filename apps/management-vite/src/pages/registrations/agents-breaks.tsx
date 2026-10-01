import { useState } from 'react';
import { Botao, BotaoDeIcone, Carregando, Etiqueta } from '@pipe/ui';
import { useRead } from '../../lib/query';
import type { MotivoDePausa, UsoDePausas } from '../../lib/registrations';
import { excluirMotivoPausa } from '../../lib/registrations-gravar';
import { numero } from '../../lib/format';
import { ListaRegras, type RulesSection } from '../../components/lista-regras';
import { FormularioMotivoPausa } from './agents-breaks-formulario';
import { Modal, ConfirmModal } from '@pipe/ui/modal';

/**
 * Only "Excluir" — the source has no toggle or edit on this row, and no "Resultados por página" in the footer (`FICHA-atendentes-filas-pausas.md` §a.5 and §b.3: "There's no edit icon, no toggle" / "just the arrows + page number + counter"). `alternarMotivoPausa` (`cadastros-gravar.ts`) goes unused on this screen for that reason — it wasn't deleted because the `PATCH .../pausas/:id` route is still valid and tested.
 */
function ReasonActions({ motivo, onExcluir }: { motivo: MotivoDePausa; onExcluir: () => void }) {
  return <BotaoDeIcone nome="lixeira" title="Excluir" rotulo={`Excluir a pausa ${motivo.name}`} onClick={onExcluir} />;
}

/**
 * Custom breaks — the list.
 *
 * Skeleton and copy measured in `FICHA-atendentes-filas-pausas.md` §b.3/§c: header "Pausas personalizadas" with "Nova Pausa" (capital P) on the right, no search, a card with only "Nome da pausa"/"Duração" as columns and only "Excluir" on the right, a footer with just a counter + arrows (no "Resultados por página" — `ocultarTamanhoDePagina` in `ListaRegras`).
 *
 * **What left the card.** The real-usage footer (counts as, number of breaks, average vs. suggested) doesn't exist in the source (§d.3: "remove"). The `semMotivo`/`abertas` pair that gave that context now lives only in the header's `title` — information that doesn't appear as visible text, so it doesn't compete with the literal form.
 */
export function PageBreaks() {
  const [modalAberto, setModalAberto] = useState(false);
  const [motivoParaExcluir, setMotivoParaExcluir] = useState<MotivoDePausa | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [errorDeletion, setErrorDeletion] = useState<string | null>(null);
  const read = useRead<UsoDePausas>('/v1/management/agents/pauses');
  if (read.isError) return <Etiqueta tom="erro">Não foi possível carregar as pausas personalizadas.</Etiqueta>;
  if (!read.data) return <Carregando />;
  const { motivos, dias, semMotivo, abertas } = read.data;

  async function excluir() {
    if (!motivoParaExcluir) return;
    setExcluindo(true);
    setErrorDeletion(null);
    const resultado = await excluirMotivoPausa(motivoParaExcluir.id);
    setExcluindo(false);
    if (resultado.ok) setMotivoParaExcluir(null);
    else setErrorDeletion(resultado.error);
  }

  const sections: RulesSection[] = [
    {
      titulo: 'Pausas personalizadas',
      empty: 'Que tal personalizar os tipos de pausa disponíveis para sua equipe de atendimento?',
      emptyDescription:
        'Pausas personalizadas ajudam atendentes a ter mais autonomia na gestão de tempo e te dão mais controle sobre sua operação.',
      cards: motivos.map((m) => ({
        id: m.id,
        campos: [
          { rotulo: 'Nome da pausa', value: m.name },
          {
            rotulo: 'Duração',
            value: m.durationSuggestedMin === null ? '—' : `${numero(m.durationSuggestedMin)} minutos`,
          },
        ],
        situation: m.active ? 'Ativo' : 'Desativado',
        active: m.active,
        acao: <ReasonActions motivo={m} onExcluir={() => setMotivoParaExcluir(m)} />,
        procura: m.name.toLowerCase(),
      })),
    },
  ];

  return (
    <>
      <div className="board-head">
        <h2
          title={
            semMotivo > 0 || abertas > 0
              ? [
                  semMotivo > 0
                    ? `${numero(semMotivo)} pausa(s) encerrada(s) nos últimos ${dias} dias sem motivo — não entram em nenhuma linha.`
                    : '',
                  abertas > 0
                    ? `${numero(abertas)} pausa(s) em aberto agora: ainda não terminaram e ficam fora da média.`
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')
              : undefined
          }
        >
          Pausas personalizadas
        </h2>
        <Botao variante="primario" icone="mais" className="board-acao" onClick={() => setModalAberto(true)}>
          Nova Pausa
        </Botao>
      </div>

      <ListaRegras
        sections={sections}
        sectionHideHeader
        hideSearch
        paginar
        pageInitialSize={5}
        pageHideSize
      />

      <Modal aberto={modalAberto} titulo="Criar nova pausa personalizada" onFechar={() => setModalAberto(false)}>
        <FormularioMotivoPausa aoSalvar={() => setModalAberto(false)} />
      </Modal>

      <ConfirmModal
        aberto={motivoParaExcluir !== null}
        titulo="Excluir pausa"
        rotuloConfirmar="Excluir pausa"
        message={<>Esta ação não pode ser desfeita.</>}
        error={errorDeletion}
        confirmando={excluindo}
        onConfirmar={() => void excluir()}
        onCancelar={() => {
          setMotivoParaExcluir(null);
          setErrorDeletion(null);
        }}
      />
    </>
  );
}
