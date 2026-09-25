import { useState } from 'react';
import { Botao, BotaoDeIcone } from '@pipe/ui';
import { useRead } from '../../lib/query';
import type { MotivoDePausa, UsoDePausas } from '../../lib/registrations';
import { excluirMotivoPausa } from '../../lib/registrations-gravar';
import { numero } from '../../lib/format';
import { ListaRegras, type RulesSection } from '../../components/lista-regras';
import { FormularioMotivoPausa } from './agents-breaks-formulario';
import { Modal, ModalConfirmation } from './_modal';

/**
 * Só "Excluir" — a origem não tem interruptor nem editar nesta linha, e não
 * tem "Resultados por página" no rodapé (`FICHA-atendentes-filas-pausas.md`
 * §a.5 e §b.3: "Não há ícone de editar, não há interruptor" / "apenas as
 * setas + o número da página + o contador"). `alternarMotivoPausa`
 * (`cadastros-gravar.ts`) fica sem uso nesta tela por isso — não foi apagado
 * porque a rota `PATCH .../pausas/:id` continua válida e testada.
 */
function MotivoActions({ motivo, onExcluir }: { motivo: MotivoDePausa; onExcluir: () => void }) {
  return <BotaoDeIcone nome="x" rotulo={`Excluir o motivo ${motivo.nome}`} onClick={onExcluir} />;
}

/**
 * Pausas personalizadas — a lista.
 *
 * Esqueleto e textos medidos em `FICHA-atendentes-filas-pausas.md` §b.3/§c:
 * cabeçalho "Pausas personalizadas" com "Nova Pausa" (P maiúsculo) à direita,
 * sem busca, cartão com só "Nome da pausa"/"Duração" como colunas e à direita
 * só "Excluir", rodapé com apenas contador + setas (sem "Resultados por
 * página" — `ocultarTamanhoDePagina` em `ListaRegras`).
 *
 * **O que saiu do cartão.** O rodapé de uso real (conta como, nº de pausas,
 * média, contra a sugerida) não existe na origem (§d.3: "tirar"). O par
 * `semMotivo`/`abertas` que dava esse contexto fica só no `title` do
 * cabeçalho — informação que não aparece como texto na tela, então não
 * compete com a forma literal.
 */
export function PageBreaks() {
  const [modalAberto, setModalAberto] = useState(false);
  const [motivoParaExcluir, setMotivoParaExcluir] = useState<MotivoDePausa | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [errorExclusao, setErrorExclusao] = useState<string | null>(null);
  const read = useRead<UsoDePausas>('/v1/management/agents/pauses');
  if (!read.data) return null;
  const { motivos, dias, semMotivo, abertas } = read.data;

  async function excluir() {
    if (!motivoParaExcluir) return;
    setExcluindo(true);
    setErrorExclusao(null);
    const resultado = await excluirMotivoPausa(motivoParaExcluir.id);
    setExcluindo(false);
    if (resultado.ok) setMotivoParaExcluir(null);
    else setErrorExclusao(resultado.error);
  }

  const sections: RulesSection[] = [
    {
      titulo: 'Pausas personalizadas',
      empty: 'Nenhum motivo cadastrado.',
      cards: motivos.map((m) => ({
        id: m.id,
        campos: [
          { rotulo: 'Nome da pausa', valor: m.nome },
          {
            rotulo: 'Duração',
            valor: m.durationSuggestedMin === null ? '—' : `${numero(m.durationSuggestedMin)} minutos`,
          },
        ],
        situacao: m.ativo ? 'Ativo' : 'Desativado',
        ativa: m.ativo,
        acao: <MotivoActions motivo={m} onExcluir={() => setMotivoParaExcluir(m)} />,
        procura: m.nome.toLowerCase(),
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
        sectionOcultarHeader
        ocultarSearch
        paginar
        pageInitialTamanho={5}
        pageOcultarTamanho
      />

      <Modal aberto={modalAberto} titulo="Criar nova pausa personalizada" onFechar={() => setModalAberto(false)}>
        <FormularioMotivoPausa aoSalvar={() => setModalAberto(false)} />
      </Modal>

      <ModalConfirmation
        aberto={motivoParaExcluir !== null}
        titulo="Excluir motivo"
        message={<>Excluir o motivo "{motivoParaExcluir?.nome}"? Esta ação não pode ser desfeita.</>}
        error={errorExclusao}
        confirmando={excluindo}
        onConfirmar={() => void excluir()}
        onCancelar={() => {
          setMotivoParaExcluir(null);
          setErrorExclusao(null);
        }}
      />
    </>
  );
}
