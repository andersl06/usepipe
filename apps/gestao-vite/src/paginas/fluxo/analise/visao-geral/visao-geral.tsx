import { IconePortal } from '../../../../componentes/icones-portal';
import type { DiaDaVisaoGeral, VisaoGeral as DadosDaVisaoGeral } from '@pipe/core/analise';
import { CabecalhoDaPagina, Cartao, SeletorDePeriodo } from '../pecas';

/**
 * Visão Geral — o componente `generalDashboard` do módulo `analyticsComponents`
 * (template 7780, controlador `ri`), com o `counterChildCard` (14085) e o
 * `analyticsChart` (1920).
 *
 * As flags do contexto que mexem aqui, todas ligadas: `analytics-messages-
 * general-info` (o ícone de ajuda do título), `active-messages-per-domain-table`
 * (o bloco "Mensagens ativas por canal") e `analytics-general-dashboard-
 * requests-for-user-quantity-enabled` (os contadores de usuários).
 * `general-dashboard-initial-period-one-day` está desligada: o período abre em
 * sete dias.
 */
export function VisaoGeral({
  dados,
  de,
  ate,
}: {
  dados: DadosDaVisaoGeral;
  de: string;
  ate: string;
}) {
  const c = dados.contagens;

  return (
    <>
      <CabecalhoDaPagina
        tituloProprio={
          <div className="vg-titulo">
            <p className="an-t32 vg-titulo-texto">Visão geral</p>
            &nbsp;
            {/* `showOverviewModal()`. */}
            <a
              className="an-t32 vg-titulo-ajuda"
              href="#ajuda-visao-geral"
              aria-label="O que é a Visão Geral?"
            >
              <IconePortal nome="informacao-cheia" tamanho={24} />
            </a>
          </div>
        }
        extra={
          /* `ng-if="$ctrl.usersPerDay && $ctrl.usersPerDay.length > 0"`. */
          dados.porDia.length > 0 ? (
            <>
              <a className="an-bds-btn an-bds-btn--secundario vg-botao" href="">
                <IconePortal nome="atualizar" tamanho={24} />
                Atualizar
              </a>
              <span className="vg-exportar">
                <button type="button" className="an-bds-btn vg-botao" disabled>
                  <IconePortal nome="baixar" tamanho={24} />
                  Exportar
                </button>
                <span className="pt-obra-selo">em breve</span>
              </span>
            </>
          ) : null
        }
      />

      <div className="fx-coluna vg-painel" id="general-dashboard">
        <div className="vg-filtros">
          <div className="vg-filtro-periodo">
            <SeletorDePeriodo de={de} ate={ate} />
          </div>
        </div>

        <div className="vg-cartoes">
          <div className="vg-cartao vg-cartao--usuarios">
            <div className="vg-cartao-cabeca">
              <p className="an-t24 vg-cartao-titulo">Usuários</p>
              <p className="an-t16 vg-cartao-descricao">
                Todo usuário único que recebeu ou enviou mensagem para o chatbot.
              </p>
            </div>
            <div className="vg-contadores">
              <Contador
                nome="Ativos"
                valor={c.ativos}
                dica="Contatos que enviaram ou receberam pelo menos uma mensagem do chatbot no período selecionado."
              />
              <Contador
                nome="Engajados"
                valor={c.engajados}
                dica="Contatos que enviaram pelo menos uma mensagem para o chatbot no período selecionado."
              />
            </div>
          </div>

          <div className="vg-cartao vg-cartao--mensagens">
            <div className="vg-cartao-cabeca">
              <p className="an-t24 vg-cartao-titulo">Mensagens</p>
              <p className="an-t16 vg-cartao-descricao">
                São contabilizadas quando o chatbot envia ou recebe mensagens dos contatos.
              </p>
            </div>
            <div className="vg-contadores">
              <Contador
                nome="Total"
                valor={c.total}
                dica="Quantidade total de mensagens enviadas e recebidas pelo chatbot no período selecionado."
              />
              <Contador
                nome="Recebidas"
                valor={c.recebidas}
                dica="Mensagens recebidas pelo chatbot no período selecionado."
              />
              <Contador
                nome="Enviadas"
                valor={c.enviadas}
                dica="Mensagens enviadas pelo chatbot no período selecionado."
              />
              <Contador
                nome="Ativas"
                valor={c.ativas}
                dica="Mensagens enviadas pelo chatbot após 24 horas do recebimento da última mensagem do contato. Estão sujeitas a políticas de utilização e tarifação, específicas de cada canal."
              />
            </div>
          </div>
        </div>
      </div>

      <div className="fx-coluna">
        <div className="vg-margem">
          {dados.ativasPorCanal.length === 0 ? (
            <Cartao>
              <p className="an-t24 vg-cartao-titulo">Mensagens ativas por canal</p>
              <p className="an-t20 vg-sem-conteudo">
                Não há mensagens ativas no período selecionado
              </p>
            </Cartao>
          ) : (
            <div className="vg-linha vg-grafico">
              <Cartao className="vg-grafico-cartao" titulo="Mensagens ativas por canal">
                <div className="vg-grafico-area">
                  <table className="vg-lista">
                    <thead>
                      <tr>
                        <th>Canal</th>
                        <th>Total de mensagens ativas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.ativasPorCanal.map((l) => (
                        <tr key={l.canal}>
                          <td>{l.canal}</td>
                          <td>{numero(l.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Cartao>
            </div>
          )}
        </div>

        <div className="vg-linha vg-grafico vg-grafico--24">
          <Cartao
            className="vg-grafico-cartao"
            titulo="Usuários por dia (DAUs e DEUs)"
            dica="Total diário de usuários do bot"
          >
            <GraficoDeLinha
              dias={dados.porDia}
              series={[
                { nome: 'Ativos', chave: 'ativos' },
                { nome: 'Engajados', chave: 'engajados' },
              ]}
            />
          </Cartao>
        </div>

        <div className="vg-linha vg-grafico vg-grafico--24">
          <Cartao
            className="vg-grafico-cartao"
            titulo="Mensagens por dia"
            dica="Mensagens que o bot recebeu dos usuários (ativos)"
          >
            <GraficoDeLinha
              dias={dados.porDia}
              series={[
                { nome: 'Recebidas', chave: 'recebidas' },
                { nome: 'Enviadas', chave: 'enviadas' },
              ]}
            />
          </Cartao>
        </div>
      </div>

      <ModalDaVisaoGeral />
    </>
  );
}

/** `formatNumbers()`: `toLocaleString()` com a vírgula trocada por ponto. */
function numero(n: number): string {
  return n.toLocaleString('en-US').replaceAll(',', '.');
}

/** `<counter-child-card>`: nome em negrito com a dica, e o valor em fs-20. */
function Contador({ nome, valor, dica }: { nome: string; valor: number; dica: string }) {
  return (
    <div className="vg-contador">
      <div className="vg-contador-nome">
        <p className="an-t16">{nome}</p>
        <span className="vg-contador-dica" title={dica}>
          <IconePortal nome="informacao-cheia" tamanho={16} />
        </span>
      </div>
      <p className="an-t20 vg-contador-valor">{numero(valor)}</p>
    </div>
  );
}

type ChaveDeSerie = 'ativos' | 'engajados' | 'recebidas' | 'enviadas';

/**
 * O `chart type="line"` do `analyticsChart`, que na origem é o `LineChart` do
 * Google Charts. Sem biblioteca: eixo, grade, duas linhas e a legenda à
 * direita, que é o padrão dele. Sem dia com dado, a frase `noEnoughData`.
 */
function GraficoDeLinha({
  dias,
  series,
}: {
  dias: DiaDaVisaoGeral[];
  series: { nome: string; chave: ChaveDeSerie }[];
}) {
  const L = 1000;
  const A = 290;
  const esq = 50;
  const dir = 160;
  const topo = 20;
  const base = 40;

  if (dias.length === 0) {
    return (
      <div className="vg-grafico-area vg-grafico-vazio">
        Não há dados suficientes para exibir este gráfico
      </div>
    );
  }

  const maior = Math.max(1, ...dias.flatMap((d) => series.map((s) => d[s.chave])));
  const teto = Math.ceil(maior / 4) * 4;
  const x = (i: number) =>
    esq + (dias.length === 1 ? 0 : (i * (L - esq - dir)) / (dias.length - 1));
  const y = (v: number) => topo + (A - topo - base) * (1 - v / teto);

  return (
    <div className="vg-grafico-area">
      <svg className="vg-linhas" viewBox={`0 0 ${L} ${A}`} role="img">
        {[0, 1, 2, 3, 4].map((g) => (
          <g key={g}>
            <line
              className="vg-grade"
              x1={esq}
              x2={L - dir}
              y1={y((teto * g) / 4)}
              y2={y((teto * g) / 4)}
            />
            <text className="vg-eixo" x={esq - 8} y={y((teto * g) / 4) + 4} textAnchor="end">
              {numero((teto * g) / 4)}
            </text>
          </g>
        ))}
        {dias.map((d, i) => (
          <text key={d.dia} className="vg-eixo" x={x(i)} y={A - 14} textAnchor="middle">
            {`${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}`}
          </text>
        ))}
        {series.map((s, i) => (
          <g key={s.chave} className={`vg-serie vg-serie--${i}`}>
            <polyline points={dias.map((d, j) => `${x(j)},${y(d[s.chave])}`).join(' ')} />
            <line
              x1={L - dir + 20}
              x2={L - dir + 44}
              y1={topo + 10 + i * 22}
              y2={topo + 10 + i * 22}
            />
            <text className="vg-legenda" x={L - dir + 52} y={topo + 14 + i * 22}>
              {s.nome}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/**
 * O modal do `showOverviewModal()` (template 6411): `.modal` legado do portal,
 * `modal-dialog modal-sm`, a ilustração à esquerda (`Chevalet.svg`, que não
 * veio na captura — a coluna fica vazia) e o texto de `metrics.overviewHelp`.
 */
function ModalDaVisaoGeral() {
  return (
    <div className="an-modal" id="ajuda-visao-geral" role="dialog" aria-modal="true">
      <a className="an-modal-fundo" href="#" aria-label="Fechar" />
      <div className="an-modal-legado">
        <div className="an-modal-legado-corpo">
          <div className="vg-ajuda">
            <div className="vg-ajuda-imagem" />
            <div className="vg-ajuda-texto">
              <h4 className="an-t20 vg-ajuda-titulo">O que é a Visão Geral?</h4>
              <p className="an-t14 vg-ajuda-corpo">
                A visão geral permite a visualização das principais métricas do chatbot com objetivo
                de ajudar a tomar decisões rápidas de negócio. O relatório contabiliza todos os
                contatos e mensagens trafegadas, incluindo interações durante o atendimento humano
                ou envio de mensagens ativas.
              </p>
              <br />
              <p className="an-t14 vg-ajuda-corpo">
                A contabilidade é feita diariamente e os dados podem sofrer alterações em um período
                de até dois dias. <br />
                Um painel exibido no dia 10 de dezembro, por exemplo, pode ainda sofrer alterações,
                pois as mensagens trafegadas nos dias 9 e 10 de dezembro ainda estão sendo
                computadas.
              </p>
              <br />
              <div className="vg-ajuda-link">
                <span className="an-t14 vg-ajuda-saiba">Saiba mais sobre as métricas</span>
                <IconePortal nome="abrir-arquivo" tamanho={16} />
                <span className="pt-obra-selo">em breve</span>
              </div>
            </div>
          </div>
        </div>
        <div className="an-modal-legado-pe">
          <a className="an-bds-btn" href="#">
            Ok, entendi
          </a>
        </div>
      </div>
    </div>
  );
}
