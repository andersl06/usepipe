import { Icone } from '@pipe/ui';
import { IconeManagement } from '../../componentes/icones-gestao';
import { Selection } from '../../componentes/selecao';
import type { Block, Mapa, SaidaDoEditor } from './modelo';
import { OUTPUTS_OF_ATTENDANCE, ehAttendance } from './modelo';
import {
  ROTULOS_DAS_SAIDAS,
  adicionarSaida,
  outputDefinirConditions,
  outputDefinirDestination,
  definirSaidaPadrao,
  outputErrors,
  moverSaida,
  removerSaida,
} from './condicoes';
import { ConditionsEditor } from './condicao';
import { CabecalhoInfo } from './cabecalho-info';

/**
 * A aba "Condições de saída" do editor: o texto de abertura ("Defina as regras
 * e o bloco para o qual o usuário será direcionado"), um cartão por saída
 * (`output-card-container`: fundo de superfície 2, raio 10) com as condições e
 * o "Ir para", o "+ Adicionar condição de saída" e, por fim, a "Saída padrão"
 * com o aviso de que a seta dela não é exibida.
 *
 * A ordem dos cartões é a ordem em que o motor avalia — a primeira que casa
 * vence — e por isso cada cartão tem subir/descer.
 *
 * No bloco de atendimento (`desk:`), as quatro saídas que o editor criou são
 * as "Saídas de atendimento": condição fixa (o `Ticket` encerrado, ou o
 * encaminhamento que falhou), e só o destino se escolhe.
 */

function rotuloOfOutputOfAttendance(saida: SaidaDoEditor): string {
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
  // O editor permite laço (`allowLoopback`): o próprio bloco também é destino.
  const destinos = Object.values(mapa);
  const existe = (id: string): boolean => id in mapa;
  const attendance = ehAttendance(block.id);

  const destinationSeletor = (value: string, onEscolher: (id: string) => void, rotulo: string) => (
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
        <section className="bl-disponibilidade">
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
                {destinationSeletor(
                  saidas[indice]!.stateId ?? '',
                  (id) => onMudar(outputDefinirDestination(block, indice, id)),
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
                  <IconeManagement nome="lixeira" tamanho={18} />
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
              className={`bl-saida${fixa ? ' bl-saida--atendimento' : ''}${errors.length > 0 ? ' bl-saida--erro' : ''}`}
            >
              <header className="bl-saida-cabecalho">
                <b>
                  {fixa
                    ? rotuloOfOutputOfAttendance(saida)
                    : `${ROTULOS_DAS_SAIDAS.condicao} ${i + 1}`}
                </b>
                <span className="bl-saida-ordem">
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
                      <IconeManagement nome="lixeira" tamanho={18} />
                    </button>
                  ) : null}
                </span>
              </header>
              {fixa ? null : (
                <ConditionsEditor
                  conditions={saida.conditions ?? []}
                  onMudar={(conditions) => onMudar(outputDefinirConditions(block, i, conditions))}
                  rotuloAdicionar="+ Adicionar condição"
                />
              )}
              {destinationSeletor(
                saida.stateId ?? '',
                (id) => onMudar(outputDefinirDestination(block, i, id)),
                ROTULOS_DAS_SAIDAS.irPara,
              )}
              {errors.length > 0 ? (
                <ul className="bl-erros">
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
        {destinationSeletor(
          block.$defaultOutput?.stateId ?? '',
          (id) => onMudar(definirSaidaPadrao(block, id)),
          ROTULOS_DAS_SAIDAS.irPara,
        )}
        <p className="bl-ajuda">{ROTULOS_DAS_SAIDAS.semSeta}</p>
      </section>
    </div>
  );
}
