import { useState } from 'react';
import { Botao, BotaoDeIcone, Carregando, Etiqueta } from '@pipe/ui';
import { ConfirmModal } from '@pipe/ui/modal';
import { useRead } from '../../lib/query';
import type { Horarios, HorarioCadastrado } from '../../lib/registrations';
import { excluirHorario } from '../../lib/registrations-gravar';
import { avisoDeExclusao, resumoDaProgramacao } from '../../lib/horarios';
import { ListaRegras, type RulesSection } from '../../components/lista-regras';
import { FormularioDeHorario } from './regras-horarios-formulario';

/**
 * Regras > Horários. Lista de cartões (nome, programação, filas, editar e excluir) e, no lugar dela e na mesma URL, o formulário de criar/editar (`ref/verificacao/attendance-hours-blip.md`). A fila que usa um horário é a fila com esse `horario_id`; quem sai de um horário (ou o perde ao excluí-lo) usa o horário regular da operação e, sem regular, conta 24 horas.
 */
export function PageHours() {
  // `null` = lista; `{}` = formulário de novo horário; `{ horario }` = edição.
  const [formulario, setFormulario] = useState<{ horario?: HorarioCadastrado } | null>(null);
  const [paraExcluir, setParaExcluir] = useState<HorarioCadastrado | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [errorDeletion, setErrorDeletion] = useState<string | null>(null);
  const read = useRead<Horarios & { fuso: string }>('/v1/management/rules/schedules');
  if (read.isError) return <Etiqueta tom="erro">Não foi possível carregar os horários.</Etiqueta>;
  if (!read.data) return <Carregando />;
  const { fuso, horarios, queueList } = read.data;

  async function excluir() {
    if (!paraExcluir) return;
    setExcluindo(true);
    setErrorDeletion(null);
    const resultado = await excluirHorario(paraExcluir.id);
    setExcluindo(false);
    if (resultado.ok) {
      setParaExcluir(null);
      setFormulario(null);
    } else setErrorDeletion(resultado.error);
  }

  const confirmacao = (
    <ConfirmModal
      aberto={paraExcluir !== null}
      titulo="Tem certeza que deseja excluir este horário?"
      message={paraExcluir ? avisoDeExclusao(paraExcluir, horarios) : null}
      error={errorDeletion}
      confirmando={excluindo}
      onConfirmar={() => void excluir()}
      onCancelar={() => {
        setParaExcluir(null);
        setErrorDeletion(null);
      }}
    />
  );

  if (formulario) {
    const { horario } = formulario;
    return (
      <>
        <FormularioDeHorario
          horario={horario}
          fuso={horario?.fuso ?? fuso}
          filas={queueList}
          onFechar={() => setFormulario(null)}
          onExcluir={horario ? () => setParaExcluir(horario) : undefined}
        />
        {confirmacao}
      </>
    );
  }

  const sections: RulesSection[] = [
    {
      titulo: 'Regras de horários',
      empty: 'Nenhum horário cadastrado.',
      cards: horarios.map((h) => ({
        id: h.id,
        selo: h.regular ? 'Horário regular' : undefined,
        campos: [
          { rotulo: 'Horário', value: h.name },
          ...(h.description ? [{ rotulo: 'Descrição', value: h.description }] : []),
          { rotulo: 'Programação', value: resumoDaProgramacao(h.faixas) },
          { rotulo: 'Filas', value: h.queues.length > 0 ? h.queues.join(', ') : 'Nenhuma' },
        ],
        situation: 'Em uso',
        active: true,
        acao: (
          <>
            <BotaoDeIcone
              nome="lapis"
              title="Editar"
              rotulo={`Editar o horário ${h.name}`}
              onClick={() => setFormulario({ horario: h })}
            />
            <BotaoDeIcone
              nome="lixeira"
              title="Excluir"
              rotulo={`Excluir o horário ${h.name}`}
              onClick={() => setParaExcluir(h)}
            />
          </>
        ),
        procura: `${h.name} ${h.description ?? ''} ${h.queues.join(' ')}`.toLowerCase(),
      })),
    },
  ];

  return (
    <>
      <div className="board-head">
        <h2>Regras de horários</h2>
        <Botao variante="primario" icone="mais" className="board-acao" onClick={() => setFormulario({})}>
          Criar horário
        </Botao>
      </div>

      <ListaRegras sections={sections} sectionHideHeader hideSearch />

      {confirmacao}
    </>
  );
}
