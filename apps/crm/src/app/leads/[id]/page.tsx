import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fusoDoTenant } from '../../../lib/banco';
import { carregarFicha } from '../../../lib/leads';
import { classeDaFaixa, data, dataHora, numero, pontos } from '../../../lib/formato';

export const dynamic = 'force-dynamic';

const ROTULO_STATUS: Record<string, string> = {
  novo: 'Novo',
  em_contato: 'Em contato',
  qualificado: 'Qualificado',
  convertido: 'Convertido',
  desqualificado: 'Desqualificado',
};

function Campo({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

export default async function PaginaFicha({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ficha = await carregarFicha(id);
  if (!ficha) notFound();

  const fuso = await fusoDoTenant();
  const atributos = Object.entries(ficha.customizados);
  const utm = Object.entries(ficha.utm);

  return (
    <>
      <div className="board-head">
        <div>
          <Link href="/leads" className="voltar">
            ← Leads
          </Link>
          <h2>{ficha.nome}</h2>
        </div>
        <span className="sub">
          {ROTULO_STATUS[ficha.status] ?? ficha.status}
          {ficha.fase ? ` · fase ${ficha.fase}` : ''}
          {ficha.diasNaFase !== null ? ` há ${numero(ficha.diasNaFase)} dias` : ''}
        </span>
        <div className="filters">
          {ficha.score ? (
            <span className={classeDaFaixa(ficha.score.valor)}>
              SCORE {numero(ficha.score.valor)}
              {ficha.score.faixa ? ` · ${ficha.score.faixa.toUpperCase()}` : ''}
            </span>
          ) : (
            <span className="pill q">SEM SCORE</span>
          )}
        </div>
      </div>

      <div className="ficha">
        <div className="coluna">
          <div className="bloco-card">
            <header>
              <b>Dados</b>
            </header>
            <div className="campos">
              <Campo k="Proprietário" v={ficha.proprietario ?? 'sem proprietário'} />
              <Campo k="E-mail" v={ficha.email ?? '—'} />
              <Campo k="Telefone" v={ficha.telefone ?? '—'} />
              <Campo k="Documento" v={ficha.documento ?? '—'} />
              <Campo k="Conta" v={ficha.contaNome ?? '—'} />
              <Campo k="Origem" v={ficha.origem ?? '—'} />
              <Campo k="Campanha" v={ficha.campanha ?? '—'} />
              <Campo k="Criado em" v={data(ficha.criadoEm, fuso)} />
              <Campo k="Fase desde" v={data(ficha.faseDesde, fuso)} />
            </div>
          </div>

          <div className="bloco-card">
            <header>
              <b>Atributos</b>
              <span className="lbl">jsonb, sem alter table</span>
            </header>
            {atributos.length === 0 && utm.length === 0 ? (
              <div className="vazio">Nenhum atributo personalizado.</div>
            ) : (
              <div className="campos">
                {atributos.map(([k, v]) => (
                  <Campo key={k} k={k} v={String(v)} />
                ))}
                {utm.map(([k, v]) => (
                  <Campo key={`utm-${k}`} k={`utm ${k}`} v={String(v)} />
                ))}
              </div>
            )}
          </div>

          <div className="bloco-card">
            <header>
              <b>Etiquetas</b>
            </header>
            {ficha.etiquetas.length === 0 ? (
              <div className="vazio">Sem etiquetas.</div>
            ) : (
              <div className="etiquetas">
                {ficha.etiquetas.map((e) => (
                  <span key={e.nome} className="pill info">
                    {e.nome.toUpperCase()}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="coluna">
          {/*
            O painel que explica o número. Regra por regra, quanto entrou e quanto
            saiu, com a versão da regra e a hora do cálculo — lido de
            `score_lead.explicacao`, não recalculado na tela.
          */}
          <div className="explain">
            <header>
              <b>{ficha.score ? `Como ${ficha.nome} tirou ${ficha.score.valor}` : 'Score'}</b>
              {ficha.score ? (
                <div className="lbl" style={{ marginTop: '3px' }}>
                  Regra de score v{ficha.score.versaoRegra} ·{' '}
                  {dataHora(ficha.score.calculadoEm, fuso)}
                </div>
              ) : null}
            </header>

            {!ficha.score ? (
              <div className="vazio">
                Este lead ainda não foi pontuado. Sem cálculo não há explicação — e número sem
                explicação é o que este produto existe para não repetir.
              </div>
            ) : ficha.score.itens.length === 0 ? (
              <div className="vazio">
                Nenhuma regra casou com este lead: o score {numero(ficha.score.valor)} é o valor de
                partida.
              </div>
            ) : (
              <ul className="rules">
                {ficha.score.itens.map((item, i) => (
                  <li key={`${item.regra}-${i}`}>
                    <span>{item.nome}</span>
                    <span className="v">v{item.versao}</span>
                    <em className={item.pontos >= 0 ? 'p' : 'n'}>{pontos(item.pontos)}</em>
                  </li>
                ))}
              </ul>
            )}

            {ficha.score ? (
              <div className="tot">
                <span className="n">{numero(ficha.score.valor)}</span>
                <div>
                  <span className={classeDaFaixa(ficha.score.valor)}>
                    FAIXA {(ficha.score.faixa ?? 'sem faixa').toUpperCase()}
                  </span>
                  <div className="lbl" style={{ marginTop: '3px' }}>
                    {ficha.score.corte !== null ? `corte em ${ficha.score.corte}` : 'sem corte'}
                    {ficha.score.fila ? ` · fila ${ficha.score.fila}` : ' · sem fila'}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/*
            Respostas de formulário: por formulário e por versão. Nunca como colunas
            soltas — é a decisão que evita os 304 campos customizados do Lead de hoje.
          */}
          <div className="bloco-card">
            <header>
              <b>Respostas de formulário</b>
              <span className="lbl">{numero(ficha.formularios.length)} versões respondidas</span>
            </header>
            {ficha.formularios.length === 0 ? (
              <div className="vazio">Este lead não respondeu nenhum formulário.</div>
            ) : (
              ficha.formularios.map((f) => (
                <div className="form-versao" key={`${f.formulario}-${f.versao}`}>
                  <div className="cab">
                    <b>{f.formulario}</b>
                    <span className="pill q">VERSÃO {f.versao}</span>
                    <span className="lbl" style={{ marginLeft: 'auto' }}>
                      {data(f.respondidoEm, fuso)}
                    </span>
                  </div>
                  <div className="campos">
                    {f.respostas.map((r) => (
                      <Campo key={r.pergunta} k={r.pergunta} v={r.valor} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="bloco-card">
            <header>
              <b>Linha do tempo</b>
              <span className="lbl">atividades e conversas</span>
            </header>
            {ficha.linhaDoTempo.length === 0 ? (
              <div className="vazio">Nada aconteceu com este lead ainda.</div>
            ) : (
              <ul className="tempo">
                {ficha.linhaDoTempo.map((i) => (
                  <li key={i.id}>
                    <span className="quando">{dataHora(i.em, fuso)}</span>
                    <span>
                      <span className="t">{i.titulo}</span>
                      {i.autor ? <span className="quem"> · {i.autor}</span> : null}
                    </span>
                    {i.corpo ? <div className="resumo">{i.corpo}</div> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
