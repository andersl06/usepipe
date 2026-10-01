import { useState } from 'react';
import { Botao, BotaoDeIcone, Carregando, Etiqueta } from '@pipe/ui';
import { ConfirmModal } from '@pipe/ui/modal';
import { useRead } from '../../lib/query';
import type { QueueConfigured, RegraSlaConfigurada } from '../../lib/settings';
import { excluirPoliticaSla } from '../../lib/settings-gravar';
import { agruparPoliticas, descreverPrazo, type PoliticaSla } from '../../lib/politica-sla';
import { ListaRegras, type RulesSection } from '../../components/lista-regras';
import { FormularioRegraSla } from './regras-sla-formulario';

/**
 * Regras > SLA. Lista de cartões (nome, metas, filas atribuídas, etiqueta "Padrão", editar e excluir; sem interruptor) e, no lugar dela e na mesma URL, o formulário de criar/editar. Cada cartão é uma política: o servidor guarda uma linha por meta e por escopo, e a tela as junta pelo nome.
 */

export function SlaPageRules() {
  // `null` = lista; `{}` = formulário de nova regra; `{ politica }` = edição.
  const [formulario, setFormulario] = useState<{ politica?: PoliticaSla } | null>(null);
  const [paraExcluir, setParaExcluir] = useState<PoliticaSla | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [errorDeletion, setErrorDeletion] = useState<string | null>(null);
  const read = useRead<{ queues: QueueConfigured[]; regras: RegraSlaConfigurada[] }>(
    '/v1/management/settings/rules',
  );
  if (read.isError) return <Etiqueta tom="erro">Não foi possível carregar as regras de SLA.</Etiqueta>;
  if (!read.data) return <Carregando />;
  const { queues, regras } = read.data;

  if (formulario) {
    return (
      <FormularioRegraSla
        queues={queues}
        politica={formulario.politica}
        onFechar={() => setFormulario(null)}
      />
    );
  }

  async function excluir() {
    if (!paraExcluir) return;
    setExcluindo(true);
    setErrorDeletion(null);
    const resultado = await excluirPoliticaSla(paraExcluir.id);
    setExcluindo(false);
    if (resultado.ok) setParaExcluir(null);
    else setErrorDeletion(resultado.error);
  }

  const sections: RulesSection[] = [
    {
      titulo: 'Regras de SLA',
      empty: 'Você ainda não possui nenhuma regra de SLA',
      emptyDescription:
        'Defina as regras de SLA para determinar os prazos e condições de atendimento dos tickets.',
      cards: agruparPoliticas(regras).map((p) => {
        const filas = p.filas.map((f) => f.name).join(', ');
        const metas = p.metas.map((m) => m.sigla).join(', ');
        return {
          id: p.id,
          campos: [
            { rotulo: 'Regras de SLA', value: p.name },
            {
              rotulo: 'Metas',
              value: metas,
              titulo: p.metas.map((m) => `${m.sigla}: ${descreverPrazo(m.prazoSeg)}`).join(' · '),
            },
            { rotulo: 'Filas atribuídas', value: filas },
          ],
          selo: p.padrao ? 'Padrão' : undefined,
          situation: 'Ativa',
          active: true,
          acao: (
            <>
              <BotaoDeIcone
                nome="lapis"
                rotulo={`Editar a regra ${p.name}`}
                onClick={() => setFormulario({ politica: p })}
              />
              <BotaoDeIcone
                nome="lixeira"
                rotulo={`Excluir a regra ${p.name}`}
                onClick={() => setParaExcluir(p)}
              />
            </>
          ),
          procura: `${p.name} ${metas} ${filas}`.toLowerCase(),
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
          onClick={() => setFormulario({})}
        >
          Criar regra
        </Botao>
      </div>

      <ListaRegras
        sections={sections}
        placeholder="Buscar regras de SLA"
        sectionHideHeader
        paginar
        pageInitialSize={5}
      />

      <ConfirmModal
        aberto={paraExcluir !== null}
        titulo="Excluir regra de SLA"
        message={
          <>
            Ao excluir, novos tickets das filas que seguiam essa regra não serão mais considerados
            nos indicadores de SLA em Relatórios e em Monitoramento. Deseja realmente excluir a
            regra de SLA?
          </>
        }
        error={errorDeletion}
        confirmando={excluindo}
        onConfirmar={() => void excluir()}
        onCancelar={() => {
          setParaExcluir(null);
          setErrorDeletion(null);
        }}
      />
    </>
  );
}
