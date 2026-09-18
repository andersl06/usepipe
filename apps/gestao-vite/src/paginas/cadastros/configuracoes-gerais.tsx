import { Campo, Seletor } from '@pipe/ui';
import { useLeitura } from '../../lib/consulta';
import type { ConfiguracoesGerais } from '../../lib/configuracoes';
import { numero } from '../../lib/formato';
import {
  DISPAROS_DE_PESQUISA,
  ESCALA_POR_TIPO,
  ROTULO_DISPARO,
  ROTULO_TIPO_PESQUISA,
  TIPOS_DE_PESQUISA,
  tipoDePesquisaValido,
  type TipoDePesquisa,
} from '../../lib/pesquisa';
import { CartaoConfig } from '../../componentes/cartao-config';
import { salvarEtiquetasDeEncerramento, salvarIdentidade, salvarPesquisa } from '../../lib/acoes';

/**
 * Preferências ├ Configurações gerais.
 *
 * A segunda lacuna que `estrutura-gestao.tsx` registrava. A disposição é a do
 * §3 de `blip-telas-cadastro.md`: um cartão por configuração, empilhados com 20
 * de gap, título 20/700 sobre explicação 14/400, interruptor da seção à direita
 * e **Salvar próprio de cada cartão** — não existe Salvar da tela.
 *
 * Três configurações, e as três mexem em coluna que já existe. Nenhuma
 * preferência foi inventada para preencher a tela: configuração que não muda
 * comportamento é item desabilitado com outro nome.
 *
 * O que a tela de Dados continua fazendo é o RETRATO (etiquetas com contagem de
 * uso, canais). O que muda é decidido aqui, e cada mudança grava autor, valor
 * anterior e horário em `log_auditoria` — foi essa a condição registrada em
 * `lib/configuracoes.ts` para que edição de configuração deixasse de ser
 * passivo.
 */
export function PaginaConfiguracoesGerais() {
  const leitura = useLeitura<ConfiguracoesGerais>('/v1/gestao/configuracoes/gerais');
  if (!leitura.data) return null;
  const { identidade, pesquisa, outrasPesquisas, etiquetas } = leitura.data;

  const tipoGravado = pesquisa?.tipo ?? '';
  const tipoAtual: TipoDePesquisa = tipoDePesquisaValido(tipoGravado) ? tipoGravado : 'csat';
  const obrigatorias = etiquetas.filter((e) => e.obrigatoria);

  return (
    <>
      {/* `FICHA-general-settings.md` §1: sem subtítulo — só o título. */}
      <div className="board-head">
        <h2>Configurações gerais</h2>
      </div>

      {/* ----------------------------------------------------------- cartão 1 */}
      <CartaoConfig
        titulo="Identidade da operação"
        explicacao={
          <>
            O nome que aparece na barra do topo e o fuso em que a operação vive. O fuso é o que
            decide o que é <b>“hoje”</b> em todo cartão e em todo relatório — trocá-lo redesenha o
            corte do dia, não só o rótulo da hora.
          </>
        }
        acao={salvarIdentidade}
        rodape={`Plano ${identidade.plano} — o plano é contrato, e muda com a gente.`}
      >
        <div className="form-linha">
          <label className="form-campo" style={{ flexBasis: '260px' }}>
            <span className="sub">Nome da operação</span>
            <Campo name="nome" defaultValue={identidade.nome} required />
          </label>

          <label className="form-campo" style={{ flexBasis: '240px' }}>
            <span className="sub">Fuso (IANA)</span>
            <Campo
              name="fuso"
              defaultValue={identidade.fuso}
              placeholder="America/Sao_Paulo"
              required
            />
          </label>

          <label className="form-campo" style={{ flexBasis: '160px' }}>
            <span className="sub">Idioma</span>
            <Campo name="idioma" defaultValue={identidade.idioma} placeholder="pt-BR" required />
          </label>
        </div>
      </CartaoConfig>

      {/* ----------------------------------------------------------- cartão 2 */}
      <CartaoConfig
        titulo="Pesquisa de satisfação"
        explicacao={
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
          ligado: pesquisa?.ativa ?? false,
        }}
        rodape={
          outrasPesquisas > 0
            ? `Há mais ${numero(outrasPesquisas)} pesquisa(s) cadastrada(s). O relatório separa por tipo e escala; esta tela edita a mais recente.`
            : `Hoje: ${ESCALA_POR_TIPO[tipoAtual].faixas}`
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
      </CartaoConfig>

      {/* ----------------------------------------------------------- cartão 3 */}
      <CartaoConfig
        titulo="Etiqueta no encerramento"
        explicacao={
          <>
            Torna obrigatória a inclusão de etiqueta em atendimento finalizado manualmente. O
            atendente só consegue encerrar depois de escolher uma das marcadas aqui. É a lista que
            alimenta o relatório por etiqueta — sem exigência, a lista fica furada e o relatório
            mede o que sobrou.
          </>
        }
        acao={salvarEtiquetasDeEncerramento}
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
      </CartaoConfig>
    </>
  );
}
