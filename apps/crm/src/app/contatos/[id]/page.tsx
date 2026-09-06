import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Etiqueta } from '@pipe/ui';
import { fusoDoTenant } from '../../../lib/banco';
import { carregarContato } from '../../../lib/contatos';
import { ROTULO_STATUS } from '../../../lib/leads';
import { data, dataHora, documento, numero } from '../../../lib/formato';

export const dynamic = 'force-dynamic';

const ROTULO_ESTADO: Record<string, string> = {
  na_fila: 'Na fila',
  atribuida: 'Atribuída',
  em_atendimento: 'Em atendimento',
  em_espera: 'Em espera',
  encerrada: 'Encerrada',
};

function Campo({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

export default async function PaginaContato({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ficha = await carregarContato(id);
  if (!ficha) notFound();

  const fuso = await fusoDoTenant();
  const desqualificado = ficha.leadStatus === 'desqualificado';

  return (
    <>
      <div className="p-cabecalho">
        <div>
          <Link href="/contatos" className="voltar">
            ← Contatos
          </Link>
          <h2>{ficha.nome}</h2>
        </div>
        <div className="p-cabecalho-fim">
          {ficha.contaId ? (
            <Link href={`/contas/${ficha.contaId}`}>
              <Etiqueta>{ficha.contaNome}</Etiqueta>
            </Link>
          ) : (
            <Etiqueta>sem conta</Etiqueta>
          )}
          <Etiqueta>
            {numero(ficha.conversas.length)}{' '}
            {ficha.conversas.length === 1 ? 'conversa' : 'conversas'}
          </Etiqueta>
        </div>
      </div>

      <div className="ficha">
        <div className="coluna">
          <div className="tblwrap">
            <header>
              <b>Dados</b>
            </header>
            <div className="campos">
              <Campo k="E-mail" v={ficha.email ?? '—'} />
              <Campo k="Telefone" v={ficha.telefone ?? '—'} />
              <Campo k="Documento" v={documento(ficha.documento)} />
              <Campo
                k="Conta"
                v={
                  ficha.contaId ? (
                    <Link href={`/contas/${ficha.contaId}`}>{ficha.contaNome}</Link>
                  ) : (
                    '—'
                  )
                }
              />
              <Campo k="Criado em" v={data(ficha.criadoEm, fuso)} />
            </div>
          </div>

          {/*
            O lead da pessoa, se existir. Contato e lead são coisas diferentes:
            a pessoa continua sendo a mesma quando a intenção de compra some, e
            é por isso que este bloco pode estar vazio sem que a ficha esteja.
          */}
          <div className="tblwrap">
            <header>
              <b>Lead</b>
              <span className="lbl">a intenção de compra</span>
            </header>
            {!ficha.leadId ? (
              <div className="vazio">Esta pessoa ainda não virou lead.</div>
            ) : (
              <>
                <div className="campos">
                  <Campo
                    k="Situação"
                    v={
                      desqualificado ? (
                        <Etiqueta tom="erro">{ROTULO_STATUS['desqualificado']}</Etiqueta>
                      ) : (
                        <Etiqueta>
                          {ROTULO_STATUS[ficha.leadStatus ?? ''] ?? ficha.leadStatus}
                        </Etiqueta>
                      )
                    }
                  />
                  <Campo k="Fase" v={ficha.leadFase ? <Etiqueta>{ficha.leadFase}</Etiqueta> : '—'} />
                  <Campo
                    k="Score"
                    v={
                      ficha.score === null
                        ? 'sem cálculo'
                        : `${numero(ficha.score)}${ficha.faixa ? ` · ${ficha.faixa}` : ''}`
                    }
                  />
                  <Campo k="Origem" v={ficha.origem ? <Etiqueta>{ficha.origem}</Etiqueta> : '—'} />
                  <Campo k="Proprietário" v={ficha.proprietario ?? 'sem proprietário'} />
                </div>
                <div className="mensagem">
                  <Link href={`/leads/${ficha.leadId}`}>Abrir a ficha do lead</Link> para ver a
                  explicação do score e as respostas de formulário.
                </div>
              </>
            )}
          </div>
        </div>

        <div className="coluna">
          {/*
            As conversas. É a promessa do produto do lado do contato: quem abre
            a pessoa vê o que já foi atendido sem precisar do Desk.
          */}
          <div className="tblwrap">
            <header>
              <b>Conversas</b>
              <span className="lbl">com o resumo da monitoria</span>
            </header>
            {ficha.conversas.length === 0 ? (
              <div className="vazio">Esta pessoa nunca conversou com o atendimento.</div>
            ) : (
              <ul className="tempo">
                {ficha.conversas.map((c) => (
                  <li key={c.id}>
                    <span className="quando">{dataHora(c.criadaEm, fuso)}</span>
                    <span>
                      <span className="t">
                        {c.categoria ?? ROTULO_ESTADO[c.estado] ?? c.estado}
                      </span>
                      {c.fila ? <span className="quem"> · {c.fila}</span> : null}
                      {c.atendente ? <span className="quem"> · {c.atendente}</span> : null}
                      {c.encerradaEm ? null : (
                        <span className="quem"> · {ROTULO_ESTADO[c.estado] ?? c.estado}</span>
                      )}
                    </span>
                    {c.resumo ? <div className="resumo">{c.resumo}</div> : null}
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
