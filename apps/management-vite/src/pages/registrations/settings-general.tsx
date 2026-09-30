import { Campo, Seletor } from '@pipe/ui';
import { useRead } from '../../lib/query';
import type { SettingsGeneral } from '../../lib/settings';
import { numero } from '../../lib/format';
import {
  DISPAROS_DE_PESQUISA,
  SCALE_BY_TYPE,
  ROTULO_DISPARO,
  ROTULO_TIPO_PESQUISA,
  TIPOS_DE_PESQUISA,
  tipoDePesquisaValido,
  type TipoDePesquisa,
} from '../../lib/pesquisa';
import { CardConfig } from '../../components/card-config';
import { closureSaveTags, saveIdentity, salvarPesquisa } from '../../lib/actions';

/**
 * Preferências ├ General settings. The second gap that `estrutura-gestao.tsx` used to log. The layout follows §3 of `blip-telas-cadastro.md`: one card per setting, stacked with a 20 gap, title 20/700 over a 14/400 explanation, the section's toggle on the right, and **each card saves itself** — there's no screen-level Save. Three settings, and all three touch a column that already exists. No preference was invented just to fill the screen: a setting that doesn't change behavior is a disabled item under another name. The Data screen keeps doing the SNAPSHOT (tags with usage counts, channels). What changes gets decided here, and every change records author, previous value and timestamp in `log_auditoria` — that was the condition logged in `lib/configuracoes.ts` for setting edits to stop being passive.
 */
export function PageSettingsGeneral() {
  const read = useRead<SettingsGeneral>('/v1/management/settings/general');
  if (!read.data) return null;
  const { identity, pesquisa, outrasPesquisas, etiquetas } = read.data;

  const tipoGravado = pesquisa?.type ?? '';
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
        explanation="Defina o nome exibido no atendimento, o idioma e o fuso horário da operação."
        acao={saveIdentity}
        rodape={`Plano atual: ${identity.plan}.`}
      >
        <div className="form-linha">
          <label className="form-campo" style={{ flexBasis: '260px' }}>
            <span className="sub">Nome da operação</span>
            <Campo name="nome" defaultValue={identity.name} required />
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
        explanation="Envie uma pesquisa após o atendimento para acompanhar a experiência do cliente."
        acao={salvarPesquisa}
        interruptor={{
          name: 'ativa',
          rotulo: 'Disparar a pesquisa de satisfação',
          ligado: pesquisa?.active ?? false,
        }}
        rodape={
          outrasPesquisas > 0
            ? `${numero(outrasPesquisas)} pesquisa(s) anterior(es) permanecem disponíveis nos relatórios.`
            : `Hoje: ${SCALE_BY_TYPE[tipoAtual].faixas}`
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
            <Seletor name="disparo" defaultValue={pesquisa?.trigger ?? 'encerramento'}>
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

        <p className="note">Os relatórios mostram a nota média e a taxa de resposta.</p>
      </CardConfig>

      {/* ----------------------------------------------------------- card 3 */}
      <CardConfig
        titulo="Etiquetas no encerramento"
        explanation="Exija etiquetas ao encerrar atendimentos para organizar os relatórios."
        acao={closureSaveTags}
        interruptor={{
          name: 'exigir',
          rotulo: 'Exigir etiqueta ao encerrar',
          ligado: obrigatorias.length > 0,
        }}
        rodape={
          obrigatorias.length > 0
            ? `${numero(obrigatorias.length)} de ${numero(etiquetas.length)} etiquetas são obrigatórias.`
            : 'Nenhuma etiqueta é obrigatória no momento.'
        }
      >
        {etiquetas.length === 0 ? (
          <div className="empty">
            <b>Nenhuma etiqueta cadastrada.</b>
            <p>
              Sem vocabulário não há o que exigir. As etiquetas aparecem em Preferências ├ Dados.
            </p>
          </div>
        ) : (
          <div className="form-registration">
            {etiquetas.map((e) => (
              <label key={e.id} className="form-caixa">
                <input
                  type="checkbox"
                  name="etiqueta"
                  value={e.id}
                  defaultChecked={e.obrigatoria}
                />
                <span className="sub">
                  <b>{e.name}</b> · {numero(e.usos)} conversa(s) já etiquetada(s)
                </span>
              </label>
            ))}
          </div>
        )}
      </CardConfig>
    </>
  );
}
