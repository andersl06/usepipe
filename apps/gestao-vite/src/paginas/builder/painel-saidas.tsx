import { Icone } from '@pipe/ui';
import { IconeGestao } from '../../componentes/icones-gestao';
import { Selecao } from '../../componentes/selecao';
import type { Bloco, Mapa, SaidaDoEditor } from './modelo';
import { SAIDAS_DE_ATENDIMENTO, ehAtendimento } from './modelo';
import {
  ROTULOS_DAS_SAIDAS,
  adicionarSaida,
  definirCondicoesDaSaida,
  definirDestinoDaSaida,
  definirSaidaPadrao,
  errosDaSaida,
  moverSaida,
  removerSaida,
} from './condicoes';
import { EditorDeCondicoes } from './condicao';
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

function rotuloDaSaidaDeAtendimento(saida: SaidaDoEditor): string {
  if (saida.$isDeskDefaultOutput) return 'sem atendente disponível (erro ao encaminhar)';
  const status = saida.conditions?.find((c) => c.variable === 'input.content@status')?.values?.[0];
  return SAIDAS_DE_ATENDIMENTO.find((s) => s.status === status)?.rotulo ?? 'saída de atendimento';
}

export function PainelDeSaidas({
  bloco,
  mapa,
  onMudar,
  onAviso,
}: {
  bloco: Bloco;
  mapa: Mapa;
  onMudar: (bloco: Bloco) => void;
  onAviso: (texto: string) => void;
}) {
  const saidas = bloco.$conditionOutputs ?? [];
  // O editor permite laço (`allowLoopback`): o próprio bloco também é destino.
  const destinos = Object.values(mapa);
  const existe = (id: string): boolean => id in mapa;
  const atendimento = ehAtendimento(bloco.id);

  const seletorDeDestino = (valor: string, onEscolher: (id: string) => void, rotulo: string) => (
    <label className="bl-campo">
      <span className="sub">{rotulo}</span>
      <Selecao
        value={existe(valor) ? valor : valor ? '__outro' : ''}
        onChange={(e) => onEscolher(e.target.value === '__outro' ? valor : e.target.value)}
      >
        <option value="">{ROTULOS_DAS_SAIDAS.direcionar}</option>
        {destinos.map((b) => (
          <option key={b.id} value={b.id}>
            {b.$title || b.id}
          </option>
        ))}
        {valor && !existe(valor) ? <option value="__outro">{valor} (não existe)</option> : null}
      </Selecao>
    </label>
  );

  function adicionar(): void {
    const r = adicionarSaida(bloco);
    if (r.ok) onMudar(r.bloco);
    else onAviso(r.erro);
  }

  return (
    <div className="bl-aba-corpo">
      {atendimento ? (
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
                    ...bloco,
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
                {seletorDeDestino(
                  saidas[indice]!.stateId ?? '',
                  (id) => onMudar(definirDestinoDaSaida(bloco, indice, id)),
                  ROTULOS_DAS_SAIDAS.irPara,
                )}
                <button
                  type="button"
                  className="iconbtn"
                  aria-label="Excluir condição de disponibilidade"
                  onClick={() =>
                    onMudar({ ...bloco, $conditionOutputs: saidas.filter((_, i) => i !== indice) })
                  }
                >
                  <IconeGestao nome="lixeira" tamanho={18} />
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
          const erros = errosDaSaida(saida, existe);
          const fixa = !!saida.$isDeskOutput;
          return (
            <section
              key={saida.$id ?? i}
              className={`bl-saida${fixa ? ' bl-saida--atendimento' : ''}${erros.length > 0 ? ' bl-saida--erro' : ''}`}
            >
              <header className="bl-saida-cabecalho">
                <b>
                  {fixa
                    ? rotuloDaSaidaDeAtendimento(saida)
                    : `${ROTULOS_DAS_SAIDAS.condicao} ${i + 1}`}
                </b>
                <span className="bl-saida-ordem">
                  <button
                    type="button"
                    className="iconbtn"
                    title="Subir"
                    aria-label="Subir"
                    disabled={i === 0}
                    onClick={() => onMudar(moverSaida(bloco, i, i - 1))}
                  >
                    <Icone nome="cima" tamanho={16} />
                  </button>
                  <button
                    type="button"
                    className="iconbtn"
                    title="Descer"
                    aria-label="Descer"
                    disabled={i === saidas.length - 1}
                    onClick={() => onMudar(moverSaida(bloco, i, i + 1))}
                  >
                    <Icone nome="baixo" tamanho={16} />
                  </button>
                  {!fixa ? (
                    <button
                      type="button"
                      className="iconbtn"
                      title="Deletar"
                      aria-label="Deletar"
                      onClick={() => onMudar(removerSaida(bloco, i))}
                    >
                      <IconeGestao nome="lixeira" tamanho={18} />
                    </button>
                  ) : null}
                </span>
              </header>
              {fixa ? null : (
                <EditorDeCondicoes
                  condicoes={saida.conditions ?? []}
                  onMudar={(condicoes) => onMudar(definirCondicoesDaSaida(bloco, i, condicoes))}
                  rotuloAdicionar="+ Adicionar condição"
                />
              )}
              {seletorDeDestino(
                saida.stateId ?? '',
                (id) => onMudar(definirDestinoDaSaida(bloco, i, id)),
                ROTULOS_DAS_SAIDAS.irPara,
              )}
              {erros.length > 0 ? (
                <ul className="bl-erros">
                  {erros.map((e) => (
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
        {seletorDeDestino(
          bloco.$defaultOutput?.stateId ?? '',
          (id) => onMudar(definirSaidaPadrao(bloco, id)),
          ROTULOS_DAS_SAIDAS.irPara,
        )}
        <p className="bl-ajuda">{ROTULOS_DAS_SAIDAS.semSeta}</p>
      </section>
    </div>
  );
}
