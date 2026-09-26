import { Campo, Seletor } from '@pipe/ui';
import { useRead } from '../../lib/query';
import type { SettingsGeneral } from '../../lib/settings';
import { numero } from '../../lib/format';
import {
  DISPAROS_DE_PESQUISA,
  ESCALA_BY_TIPO,
  ROTULO_DISPARO,
  ROTULO_TIPO_PESQUISA,
  TIPOS_DE_PESQUISA,
  tipoDePesquisaValido,
  type TipoDePesquisa,
} from '../../lib/pesquisa';
import { CardConfig } from '../../components/card-config';
import { closureSalvarTags, salvarIdentity, salvarPesquisa } from '../../lib/actions';

/**
 * Preferências ├ General settings. The second gap that `estrutura-gestao.tsx` used to log. The layout follows §3 of `blip-telas-cadastro.md`: one card per setting, stacked with a 20 gap, title 20/700 over a 14/400 explanation, the section's toggle on the right, and **each card saves itself** — there's no screen-level Save. Three settings, and all three touch a column that already exists. No preference was invented just to fill the screen: a setting that doesn't change behavior is a disabled item under another name. The Data screen keeps doing the SNAPSHOT (tags with usage counts, channels). What changes gets decided here, and every change records author, previous value and timestamp in `log_auditoria` — that was the condition logged in `lib/configuracoes.ts` for setting edits to stop being passive.
 */
export function PageSettingsGeneral() {
  const read = useRead<SettingsGeneral>('/v1/management/settings/general');
  if (!read.data) return null;
  const { identity, pesquisa, outrasPesquisas, etiquetas } = read.data;

  const tipoGravado = pesquisa?.tipo ?? '';
  const tipoAtual: TipoDePesquisa = tipoDePesquisaValido(tipoGravado) ? tipoGravado : 'csat';
  const obrigatorias = etiquetas.filter((e) => e.obrigatoria);

  return (
    <>
      {/* `FICHA-general-settings.md` §1: no subtitle — title only. */}
      <div className="board-head">
        <h2>Configurações gerais</h2>
      </div>

      {/* ----------------------------------------------------------- card 1 */}
      <CardConfig
        titulo="Identidade da operação"
        explanation={
          <>
            O nome que aparece na barra do topo e o fuso em que a operação vive. O fuso é o que
            decide o que é <b>“hoje”</b> em todo cartão e em todo relatório — trocá-lo redesenha o
            corte do dia, não só o rótulo da hora.
          </>
        }
        acao={salvarIdentity}
        rodape={`Plano ${identity.plano} — o plano é contrato, e muda com a gente.`}
      >
        <div className="form-linha">
          <label className="form-campo" style={{ flexBasis: '260px' }}>
            <span className="sub">Nome da operação</span>
            <Campo name="nome" defaultValue={identity.nome} required />
          </label>

          <label className="form-campo" style={{ flexBasis: '240px' }}>
            <span className="sub">Fuso (IANA)</span>
            <Campo
              name="fuso"
              defaultValue={identity.fuso}
              placeholder="America/Sao_Paulo"
              required
            />
          </label>

          <label className="form-campo" style={{ flexBasis: '160px' }}>
            <span className="sub">Idioma</span>
            <Campo name="idioma" defaultValue={identity.idioma} placeholder="pt-BR" required />
          </label>
        </div>
      </CardConfig>

      {/* ----------------------------------------------------------- card 2 */}
      <CardConfig
        titulo="Pesquisa de satisfação"
        explanation={
          <>
            Uma escala por pesquisa, e a escala sai do tipo: <b>CSAT</b> vai de 1 a 5, <b>NPS</b> de
            0 a 10. Ela não é digitável de propósito — nota de escalas diferentes somada no mesmo
            gráfico é o defeito que a §6 da nossa régua de métricas existe para impedir. A escala
            fica gravada junto de cada resposta, então mudar aqui não reclassifica o passado.
          </>
        }
        acao={salvarPesquisa}
        interruptor={{
          name: 'ativa',
          rotulo: 'Disparar a pesquisa de satisfação',
          ligado: pesquisa?.active ?? false,
        }}
        rodape={
          outrasPesquisas > 0
            ? `Há mais ${numero(outrasPesquisas)} pesquisa(s) cadastrada(s). O relatório separa por tipo e escala; esta tela edita a mais recente.`
            : `Hoje: ${ESCALA_BY_TIPO[tipoAtual].faixas}`
        }
      >
        {pesquisa ? <input type="hidden" name="id" value={pesquisa.id} /> : null}

        <div className="form-linha">
          <label className="form-campo" style={{ flexBasis: '240px' }}>
            <span className="sub">Modelo</span>
            <Seletor name="tipo" defaultValue={tipoAtual}>
              {TIPOS_DE_PESQUISA.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO_PESQUISA[t]}
                </option>
              ))}
            </Seletor>
          </label>

          <label className="form-campo" style={{ flexBasis: '240px' }}>
            <span className="sub">Quando disparar</span>
            <Seletor name="disparo" defaultValue={pesquisa?.disparo ?? 'encerramento'}>
              {DISPAROS_DE_PESQUISA.map((d) => (
                <option key={d} value={d}>
                  {ROTULO_DISPARO[d]}
                </option>
              ))}
            </Seletor>
          </label>
        </div>

        <label className="form-campo">
          <span className="sub">Pergunta que o cliente lê</span>
          <Campo
            name="pergunta"
            defaultValue={pesquisa?.pergunta ?? ''}
            placeholder="De 1 a 5, como você avalia este atendimento?"
            required
          />
        </label>

        <p className="note">
          A <b>taxa de resposta</b> continua obrigatória no relatório de Satisfação: uma média de
          4,85 com 22% de resposta não é a mesma coisa que 4,85 com 90%, e a tela mostra as duas.
        </p>
      </CardConfig>

      {/* ----------------------------------------------------------- card 3 */}
      <CardConfig
        titulo="Etiqueta no encerramento"
        explanation={
          <>
            Torna obrigatória a inclusão de etiqueta em atendimento finalizado manualmente. O
            atendente só consegue encerrar depois de escolher uma das marcadas aqui. É a lista que
            alimenta o relatório por etiqueta — sem exigência, a lista fica furada e o relatório
            mede o que sobrou.
          </>
        }
        acao={closureSalvarTags}
        interruptor={{
          name: 'exigir',
          rotulo: 'Exigir etiqueta ao encerrar',
          ligado: obrigatorias.length > 0,
        }}
        rodape={
          obrigatorias.length > 0
            ? `${numero(obrigatorias.length)} de ${numero(etiquetas.length)} etiquetas são exigidas hoje.`
            : 'Nenhuma etiqueta exigida — o encerramento não pede nada.'
        }
      >
        {etiquetas.length === 0 ? (
          <div className="vazio">
            <b>Nenhuma etiqueta cadastrada.</b>
            <p>
              Sem vocabulário não há o que exigir. As etiquetas aparecem em Preferências ├ Dados.
            </p>
          </div>
        ) : (
          <div className="form-cadastro">
            {etiquetas.map((e) => (
              <label key={e.id} className="form-caixa">
                <input
                  type="checkbox"
                  name="etiqueta"
                  value={e.id}
                  defaultChecked={e.obrigatoria}
                />
                <span className="sub">
                  <b>{e.nome}</b> · {numero(e.usos)} conversa(s) já etiquetada(s)
                </span>
              </label>
            ))}
          </div>
        )}
      </CardConfig>
    </>
  );
}
