import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Etiqueta } from '@pipe/ui';
import {
  AbasDaFicha,
  Campo,
  Destaque,
  Secao,
  SecaoAtributos,
} from '../../../componentes/ficha';
import { fusoDoTenant } from '../../../lib/banco';
import { carregarContato, type FichaContato } from '../../../lib/contatos';
import { ROTULO_STATUS } from '../../../lib/leads';
import { data, dataHora, desde, documento, numero } from '../../../lib/formato';

export const dynamic = 'force-dynamic';

/**
 * A ficha do contato, na mesma estrutura da ficha do lead.
 *
 * A diferença entre as duas é o que o modelo diz: **o contato é a pessoa, o
 * lead é a intenção dela de comprar.** A pessoa continua a mesma quando a
 * intenção some, e é por isso que a aba do lead pode estar vazia sem que a
 * ficha esteja. O destaque diz quem é a pessoa; as abas dizem o que aconteceu
 * com ela — conversa de um lado, intenção de compra do outro.
 */

const ROTULO_ESTADO: Record<string, string> = {
  na_fila: 'Na fila',
  atribuida: 'Atribuída',
  em_atendimento: 'Em atendimento',
  em_espera: 'Em espera',
  encerrada: 'Encerrada',
};

const ABAS = [
  { chave: 'conversas', rotulo: 'Conversas' },
  { chave: 'lead', rotulo: 'Lead' },
] as const;

type AbaContato = (typeof ABAS)[number]['chave'];

function abaValida(valor: string | undefined): AbaContato {
  return (ABAS.find((a) => a.chave === valor)?.chave ?? 'conversas') as AbaContato;
}

function DestaqueDoContato({ ficha, fuso }: { ficha: FichaContato; fuso: string }) {
  const desqualificado = ficha.leadStatus === 'desqualificado';

  return (
    <Destaque
      trilha={{ href: '/contatos', rotulo: 'Contatos' }}
      nome={ficha.nome}
      nota={ficha.criadoEm ? `conhecido ${desde(ficha.criadoEm, fuso)}` : undefined}
      etiquetas={
        // A única cor possível aqui é a desqualificação do lead, que é o estado
        // terminal. A pessoa não tem estado: ela existe.
        ficha.leadId === null ? null : desqualificado ? (
          <Etiqueta tom="erro">{ROTULO_STATUS['desqualificado']}</Etiqueta>
        ) : (
          <Etiqueta>{ROTULO_STATUS[ficha.leadStatus ?? ''] ?? ficha.leadStatus}</Etiqueta>
        )
      }
      principais={[
        {
          rotulo: 'Conta',
          valor: ficha.contaId ? (
            <Link href={`/contas/${ficha.contaId}`}>{ficha.contaNome}</Link>
          ) : (
            'sem conta'
          ),
        },
        {
          rotulo: 'Score',
          numerico: true,
          valor: ficha.score === null ? '—' : numero(ficha.score),
          nota: ficha.faixa,
        },
        { rotulo: 'Fase', valor: ficha.leadFase ?? (ficha.leadId ? '—' : 'ainda não é lead') },
        { rotulo: 'Origem', valor: ficha.origem ?? '—' },
        { rotulo: 'Conversas', numerico: true, valor: numero(ficha.conversas.length) },
      ]}
    />
  );
}

export default async function PaginaContato({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const { aba: abaCrua } = await searchParams;
  const aba = abaValida(abaCrua);

  const ficha = await carregarContato(id);
  if (!ficha) notFound();

  const fuso = await fusoDoTenant();
  const desqualificado = ficha.leadStatus === 'desqualificado';

  return (
    <>
      <DestaqueDoContato ficha={ficha} fuso={fuso} />

      <div className="ficha">
        <aside className="coluna">
          <div className="tblwrap">
            <Secao titulo="Dados">
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
            </Secao>
          </div>

          <div className="tblwrap">
            <SecaoAtributos atributos={ficha.atributos} />
          </div>
        </aside>

        <div className="coluna">
          <div className="tblwrap">
            <AbasDaFicha
              base={`/contatos/${ficha.id}`}
              aba={aba}
              abas={[
                { ...ABAS[0], contagem: ficha.conversas.length },
                { ...ABAS[1], contagem: ficha.leadId ? 1 : 0 },
              ]}
              formatar={numero}
            />

            {/*
              As conversas. É a promessa do produto do lado do contato: quem abre
              a pessoa vê o que já foi atendido sem precisar do Desk.
            */}
            {aba === 'conversas' ? (
              ficha.conversas.length === 0 ? (
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
              )
            ) : null}

            {aba === 'lead' ? (
              !ficha.leadId ? (
                <div className="vazio">
                  <b>Esta pessoa ainda não virou lead.</b>
                  <span>
                    Contato e lead são coisas diferentes: a pessoa existe desde a primeira
                    conversa, o lead só quando há intenção de compra.
                  </span>
                </div>
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
                    <Campo
                      k="Fase"
                      v={ficha.leadFase ? <Etiqueta>{ficha.leadFase}</Etiqueta> : '—'}
                    />
                    <Campo
                      k="Score"
                      v={
                        ficha.score === null
                          ? 'sem cálculo'
                          : `${numero(ficha.score)}${ficha.faixa ? ` · ${ficha.faixa}` : ''}`
                      }
                    />
                    <Campo
                      k="Origem"
                      v={ficha.origem ? <Etiqueta>{ficha.origem}</Etiqueta> : '—'}
                    />
                    <Campo k="Proprietário" v={ficha.proprietario ?? 'sem proprietário'} />
                  </div>
                  <div className="mensagem">
                    <Link href={`/leads/${ficha.leadId}`}>Abrir a ficha do lead</Link> para ver a
                    explicação do score e as respostas de formulário.
                  </div>
                </>
              )
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
