import { Icone } from '@pipe/ui';
import { ManagementIcon } from '../../components/icones-management';
import { Selection } from '../../components/selection';
import type { Block, Mapa, SaidaDoEditor } from './model';
import { OUTPUTS_OF_ATTENDANCE, ehAttendance } from './model';
import {
  ROTULOS_DAS_SAIDAS,
  adicionarSaida,
  outputSetConditions,
  outputSetDestination,
  definirSaidaPadrao,
  outputErrors,
  moverSaida,
  removerSaida,
} from './conditions';
import { ConditionsEditor } from './condition';
import { CabecalhoInfo } from './cabecalho-info';

/**
 * The editor's "Condições de saída" tab: the opening text ("Defina as regras e o bloco para o qual o usuário será direcionado"), one card per output (`output-card-container`: surface-2 background, radius 10) with the conditions and the "Ir para", the "+ Adicionar condição de saída", and finally the "Saída padrão" with the notice that its arrow isn't shown.
 *
 * The cards' order is the order the engine evaluates them in — the first match wins — which is why each card has move up/down.
 *
 * On the attendance block (`desk:`), the four outputs the editor created are the "Saídas de atendimento": a fixed condition (the closed `Ticket`, or the forwarding that failed), with only the destination to choose.
 */

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

  const destinationSelector = (value: string, onEscolher: (id: string) => void, rotulo: string) => (
    <label className="bl-campo">
      <span className="sub">{rotulo}</span>
      <Selection
        value={existe(value) ? value : value ? '__outro' : ''}
        onChange={(e) => onEscolher(e.target.value === '__outro' ? value : e.target.value)}
      >
        <option value="">{ROTULOS_DAS_SAIDAS.direcionar}</option>
        {destinos.map((b) => (
          <option key={b.id} value={b.id}>
            {b.$title || b.id}
          </option>
        ))}
        {value && !existe(value) ? <option value="__outro">{value} (não existe)</option> : null}
      </Selection>
    </label>
  );

  function adicionar(): void {
    const r = adicionarSaida(block);
    if (r.ok) onMudar(r.block);
    else onAviso(r.error);
  }

  return (
    <div className="bl-aba-corpo">
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
                {destinationSelector(
                  saidas[indice]!.stateId ?? '',
                  (id) => onMudar(outputSetDestination(block, indice, id)),
                  ROTULOS_DAS_SAIDAS.irPara,
                )}
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
          return (
            <section
              key={saida.$id ?? i}
              className={`bl-saida${fixa ? ' bl-output--attendance' : ''}${errors.length > 0 ? ' bl-output--error' : ''}`}
            >
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
                  rotuloAdicionar="+ Adicionar condição"
                />
              )}
              {destinationSelector(
                saida.stateId ?? '',
                (id) => onMudar(outputSetDestination(block, i, id)),
                ROTULOS_DAS_SAIDAS.irPara,
              )}
              {errors.length > 0 ? (
                <ul className="bl-errors">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>

      <button type="button" className="bl-mais" onClick={adicionar}>
        {ROTULOS_DAS_SAIDAS.adicionar}
      </button>

      <section className="bl-saida bl-saida--padrao">
        <CabecalhoInfo titulo={ROTULOS_DAS_SAIDAS.saidaPadrao} aberto>
          <p>{ROTULOS_DAS_SAIDAS.saidaPadraoInfo}</p>
        </CabecalhoInfo>
        {destinationSelector(
          block.$defaultOutput?.stateId ?? '',
          (id) => onMudar(definirSaidaPadrao(block, id)),
          ROTULOS_DAS_SAIDAS.irPara,
        )}
        <p className="bl-ajuda">{ROTULOS_DAS_SAIDAS.semSeta}</p>
      </section>
    </div>
  );
}
