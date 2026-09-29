import { Fragment, useState } from 'react';
import { Icone } from '@pipe/ui';
import { ManagementIcon } from '../../components/icones-management';
import { IconePortal } from '@pipe/ui/icones-portal';
import { Interruptor } from '../flow/integrations/interruptor';
import type { Block, Mapa, SaidaDoEditor } from './model';
import {
  OUTPUTS_OF_ATTENDANCE,
  ehAttendance,
  isSurveyBlock,
  setSurveyQuestion,
  surveyQuestion,
} from './model';
import {
  ROTULOS_DAS_SAIDAS,
  adicionarSaida,
  flowHasSurvey,
  outputSetConditions,
  outputSetDestination,
  definirSaidaPadrao,
  outputErrors,
  moverSaida,
  removeCondition,
  removerSaida,
} from './conditions';
import { ConditionsEditor } from './condition';
import { CabecalhoInfo } from './cabecalho-info';
import { DestinationPicker } from './destination-picker';

/**
 * The editor's "Condições de saída" tab: the opening text ("Defina as regras e o bloco para o qual o usuário será direcionado"), one card per output (`output-card-container`: surface-2 background, radius 10) with the conditions and the "Ir para", the "+ Adicionar condição de saída", and finally the "Saída padrão" with the notice that its arrow isn't shown.
 *
 * The cards' order is the order the engine evaluates them in — the first match wins — which is why each card has move up/down.
 *
 * On the attendance block (`desk:`), the four outputs the editor created are the "Saídas de atendimento": a fixed condition (the closed `Ticket`, or the forwarding that failed), with only the destination to choose.
 */

/** F-1/F-6: the invalid card's own icon, outside the card at `left:-28px; top:5px` — the messages live in its `title`, never as text in the card. */
function OutputErrorIcon({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <span className="bl-output-erro" title={errors.join('\n')}>
      <IconePortal nome="informacao-cheia" tamanho={16} />
    </span>
  );
}

function labelOfOutputOfAttendance(saida: SaidaDoEditor): string {
  if (saida.$isDeskDefaultOutput) return 'sem atendente disponível (erro ao encaminhar)';
  const status = saida.conditions?.find((c) => c.variable === 'input.content@status')?.values?.[0];
  return OUTPUTS_OF_ATTENDANCE.find((s) => s.status === status)?.rotulo ?? 'saída de atendimento';
}

export function OutputsPanel({
  block,
  mapa,
  onMudar,
  onAviso,
}: {
  block: Block;
  mapa: Mapa;
  onMudar: (block: Block) => void;
  onAviso: (texto: string) => void;
}) {
  const saidas = block.$conditionOutputs ?? [];
  // The editor allows a loopback (`allowLoopback`): the block itself can also be a destination.
  const destinos = Object.values(mapa);
  const existe = (id: string): boolean => id in mapa;
  const attendance = ehAttendance(block.id);
  const survey = isSurveyBlock(block);
  const flowSurvey = flowHasSurvey(mapa);
  // "Exibir pesquisa de satisfação" (D-08): a filter of the destination picker, one toggle per
  // output row, not a special branching rule (`ref/inventario-satisfacao-e-tags.md` §1). Only
  // shown when the flow actually has a survey block to filter for.
  const [somentePesquisa, setSomentePesquisa] = useState<Set<number>>(new Set());
  const destinosDaSaida = (i: number): Block[] =>
    somentePesquisa.has(i) ? destinos.filter(isSurveyBlock) : destinos;
  function alternarFiltroDePesquisa(i: number): void {
    setSomentePesquisa((atual) => {
      const novo = new Set(atual);
      if (novo.has(i)) novo.delete(i);
      else novo.add(i);
      return novo;
    });
  }

  function adicionar(): void {
    const r = adicionarSaida(block);
    if (r.ok) onMudar(r.block);
    else onAviso(r.error);
  }

  const defaultOutputStateId = block.$defaultOutput?.stateId;
  const defaultOutputErrors =
    defaultOutputStateId && !existe(defaultOutputStateId) && !/^{{.*}}$/.test(defaultOutputStateId)
      ? [`O estado de destino '${defaultOutputStateId}' da saída não existe.`]
      : [];

  return (
    <div className="bl-aba-corpo">
      {survey ? (
        <section className="bl-survey-config">
          <CabecalhoInfo titulo="Pergunta da pesquisa" aberto>
            <p>Pergunta enviada ao cliente, que responde de 1 a 5 (D-06).</p>
          </CabecalhoInfo>
          <label className="bl-campo">
            <span className="sub">Pergunta</span>
            <input
              type="text"
              className="campo"
              value={surveyQuestion(block)}
              onChange={(e) => onMudar(setSurveyQuestion(block, e.target.value))}
            />
          </label>
        </section>
      ) : null}
      {attendance ? (
        <section className="bl-availability">
          <CabecalhoInfo titulo="Disponibilidade de atendimento" aberto>
            <p>
              Defina o bloco para o qual a conversa seguirá se a sua equipe de atendimento não
              estiver disponível
            </p>
          </CabecalhoInfo>
          {[
            { status: 'OutOfAttendanceHour', titulo: '+ Condição para horário de atendimento' },
            { status: 'NoAgentAvailable', titulo: '+ Condição para atendentes indisponíveis' },
          ].map(({ status, titulo }) => {
            const indice = saidas.findIndex(
              (s) => s.$isDeskCustomOutput && s.conditions?.some((c) => c.values?.includes(status)),
            );
            return indice < 0 ? (
              <button
                type="button"
                className="bl-mais"
                key={status}
                onClick={() => {
                  if (saidas.length >= 25) {
                    onAviso('Limite de 25 condições de saída atingidos');
                    return;
                  }
                  onMudar({
                    ...block,
                    $conditionOutputs: [
                      {
                        $id: crypto.randomUUID(),
                        $isDeskOutput: true,
                        $isDeskCustomOutput: true,
                        stateId: '',
                        conditions: [
                          {
                            source: 'context',
                            variable: 'desk_forwardToDeskState_status',
                            comparison: 'equals',
                            values: [status],
                          },
                        ],
                      },
                      ...saidas,
                    ],
                  });
                }}
              >
                {titulo}
              </button>
            ) : (
              <div key={status} className="bl-saida">
                <p>{titulo.replace('+ Condição para ', '')}</p>
                <DestinationPicker
                  valor={saidas[indice]!.stateId ?? ''}
                  blocos={destinos}
                  rotulo={ROTULOS_DAS_SAIDAS.irPara}
                  onEscolher={(id) => onMudar(outputSetDestination(block, indice, id))}
                />
                <button
                  type="button"
                  className="iconbtn"
                  aria-label="Excluir condição de disponibilidade"
                  onClick={() =>
                    onMudar({ ...block, $conditionOutputs: saidas.filter((_, i) => i !== indice) })
                  }
                >
                  <ManagementIcon nome="lixeira" tamanho={18} />
                </button>
              </div>
            );
          })}
        </section>
      ) : null}
      <CabecalhoInfo
        titulo={ROTULOS_DAS_SAIDAS.titulo}
        contador={`${saidas.filter((s) => !s.$isDeskCustomOutput).length}/25`}
        aberto={saidas.length === 0}
      >
        <p>{ROTULOS_DAS_SAIDAS.info}</p>
        <a
          href="https://help.blip.ai/hc/pt-br/articles/4474424985623-Condi%C3%A7%C3%B5es-de-sa%C3%ADda-do-Builder"
          target="_blank"
          rel="noreferrer"
        >
          Entenda como funcionam as condições de saída
        </a>
      </CabecalhoInfo>

      <div className="bl-lista-de-saidas">
        {saidas.map((saida, i) => {
          if (saida.$isDeskCustomOutput) return null;
          const errors = outputErrors(saida, existe);
          const fixa = !!saida.$isDeskOutput;
          const haOutraVisivelDepois = saidas.slice(i + 1).some((s) => !s.$isDeskCustomOutput);
          return (
            <Fragment key={saida.$id ?? i}>
              <section
                className={`bl-saida${fixa ? ' bl-output--attendance' : ''}${errors.length > 0 ? ' bl-output--error' : ''}`}
              >
                <OutputErrorIcon errors={errors} />
                <header className="bl-saida-cabecalho">
                  <b>
                    {fixa
                      ? labelOfOutputOfAttendance(saida)
                      : `${ROTULOS_DAS_SAIDAS.condicao} ${i + 1}`}
                  </b>
                  <span className="bl-output-order">
                    <button
                      type="button"
                      className="iconbtn"
                      title="Subir"
                      aria-label="Subir"
                      disabled={i === 0}
                      onClick={() => onMudar(moverSaida(block, i, i - 1))}
                    >
                      <Icone nome="cima" tamanho={16} />
                    </button>
                    <button
                      type="button"
                      className="iconbtn"
                      title="Descer"
                      aria-label="Descer"
                      disabled={i === saidas.length - 1}
                      onClick={() => onMudar(moverSaida(block, i, i + 1))}
                    >
                      <Icone nome="baixo" tamanho={16} />
                    </button>
                    {!fixa ? (
                      <button
                        type="button"
                        className="iconbtn"
                        title="Deletar"
                        aria-label="Deletar"
                        onClick={() => onMudar(removerSaida(block, i))}
                      >
                        <ManagementIcon nome="lixeira" tamanho={18} />
                      </button>
                    ) : null}
                  </span>
                </header>
                {fixa ? null : (
                  <ConditionsEditor
                    conditions={saida.conditions ?? []}
                    onMudar={(conditions) => onMudar(outputSetConditions(block, i, conditions))}
                    onRemoverCondicao={(conditionIndex) => onMudar(removeCondition(block, i, conditionIndex))}
                    rotuloAdicionar="+ Adicionar condição"
                  />
                )}
                {!saida.$isDeskDefaultOutput && flowSurvey ? (
                  <label className="bl-survey-filtro">
                    <Interruptor
                      id={`survey-filter-${saida.$id ?? i}`}
                      curto
                      ligado={somentePesquisa.has(i)}
                      rotulo="Exibir pesquisa de satisfação"
                      aoMudar={() => alternarFiltroDePesquisa(i)}
                    />
                    Exibir pesquisa de satisfação
                  </label>
                ) : null}
                <DestinationPicker
                  valor={saida.stateId ?? ''}
                  blocos={destinosDaSaida(i)}
                  rotulo={ROTULOS_DAS_SAIDAS.irPara}
                  onEscolher={(id) => onMudar(outputSetDestination(block, i, id))}
                />
              </section>
              {haOutraVisivelDepois ? (
                <div className="bl-ou" aria-hidden="true">
                  <span />
                  OU
                  <span />
                </div>
              ) : null}
            </Fragment>
          );
        })}
      </div>

      <button type="button" className="bl-mais" onClick={adicionar}>
        {ROTULOS_DAS_SAIDAS.adicionar}
      </button>

      <section
        className={`bl-saida bl-saida--padrao${defaultOutputErrors.length > 0 ? ' bl-output--error' : ''}`}
      >
        <OutputErrorIcon errors={defaultOutputErrors} />
        <CabecalhoInfo titulo={ROTULOS_DAS_SAIDAS.saidaPadrao} aberto>
          <p>{ROTULOS_DAS_SAIDAS.saidaPadraoInfo}</p>
        </CabecalhoInfo>
        <DestinationPicker
          valor={block.$defaultOutput?.stateId ?? ''}
          blocos={destinos}
          rotulo={ROTULOS_DAS_SAIDAS.irPara}
          onEscolher={(id) => onMudar(definirSaidaPadrao(block, id))}
        />
        <p className="bl-ajuda">{ROTULOS_DAS_SAIDAS.semSeta}</p>
      </section>
    </div>
  );
}
