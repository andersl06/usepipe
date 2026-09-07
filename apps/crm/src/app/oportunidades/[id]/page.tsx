import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Etiqueta, Tabela, type Coluna } from '@pipe/ui';
import { AbasDaFicha, Campo, Destaque, Secao } from '../../../componentes/ficha';
import { LinhaDoTempo } from '../../../componentes/linha-do-tempo';
import { fusoDoTenant } from '../../../lib/banco';
import {
  carregarOportunidade,
  type FichaOportunidade,
  type LinhaOportunidade,
} from '../../../lib/funil';
import { data, desde, dinheiro, numero } from '../../../lib/formato';

export const dynamic = 'force-dynamic';

/**
 * A ficha da oportunidade, na mesma estrutura das outras três.
 *
 * A oportunidade não tinha ficha: ela existia só como cartão no quadro, e o
 * cartão levava ao lead. Isso fazia a negociação não ter endereço próprio — não
 * dava para colar no chat "esta negociação", só "o lead desta negociação".
 *
 * O conteúdo pesado é o que a negociação tem de próprio:
 *
 * - **Histórico** é a linha do tempo do lead que a originou. `atividade` não
 *   tem coluna de oportunidade, e inventar uma agora seria construir a tela
 *   antes do dado — o histórico da negociação É o histórico daquele lead.
 * - **Na conta** são as outras oportunidades da mesma conta, que é a pergunta
 *   que aparece toda vez que alguém abre uma: "já estamos negociando outra
 *   coisa com eles?".
 */

const ABAS = [
  { chave: 'historico', rotulo: 'Histórico' },
  { chave: 'conta', rotulo: 'Na conta' },
] as const;

type AbaOportunidade = (typeof ABAS)[number]['chave'];

function abaValida(valor: string | undefined): AbaOportunidade {
  return (ABAS.find((a) => a.chave === valor)?.chave ?? 'historico') as AbaOportunidade;
}

function colunasIrmas(hoje: Date, fuso: string): readonly Coluna<LinhaOportunidade>[] {
  return [
    {
      chave: 'nome',
      rotulo: 'Oportunidade',
      celula: (o) => <Link href={`/oportunidades/${o.id}`}>{o.nome}</Link>,
    },
    { chave: 'fase', rotulo: 'Fase', celula: (o) => <Etiqueta>{o.fase}</Etiqueta> },
    { chave: 'valor', rotulo: 'Valor', numerica: true, celula: (o) => dinheiro(o.valor) },
    {
      chave: 'situacao',
      rotulo: 'Situação',
      celula: (o) => {
        if (o.fechadaEm) {
          return (
            <Etiqueta>
              {o.ganha ? 'Ganha' : 'Perdida'} em {data(o.fechadaEm, fuso)}
            </Etiqueta>
          );
        }
        if (o.fechamentoPrevisto && o.fechamentoPrevisto < hoje) {
          return <Etiqueta tom="alerta">venceu em {data(o.fechamentoPrevisto, fuso)}</Etiqueta>;
        }
        return o.fechamentoPrevisto ? (
          <Etiqueta>fecha em {data(o.fechamentoPrevisto, fuso)}</Etiqueta>
        ) : (
          '—'
        );
      },
    },
  ];
}

function DestaqueDaOportunidade({
  ficha,
  fuso,
  hoje,
}: {
  ficha: FichaOportunidade;
  fuso: string;
  hoje: Date;
}) {
  const vencida =
    ficha.fechadaEm === null &&
    ficha.fechamentoPrevisto !== null &&
    ficha.fechamentoPrevisto < hoje;

  return (
    <Destaque
      trilha={{ href: '/oportunidades', rotulo: 'Oportunidades' }}
      nome={ficha.nome}
      nota={ficha.criadoEm ? `aberta ${desde(ficha.criadoEm, fuso)}` : undefined}
      etiquetas={
        <>
          {/*
            Duas etiquetas podem ter cor, e só duas: a perda, que é o estado
            terminal ruim, e o fechamento vencido, que é o que alguém resolve
            hoje. Fase é categoria, e categoria é neutra.
          */}
          {ficha.fechadaEm ? (
            ficha.ganha ? (
              <Etiqueta>Ganha</Etiqueta>
            ) : (
              <Etiqueta tom="erro">Perdida</Etiqueta>
            )
          ) : (
            <Etiqueta>{ficha.fase}</Etiqueta>
          )}
          {vencida && ficha.fechamentoPrevisto ? (
            <Etiqueta tom="alerta">venceu em {data(ficha.fechamentoPrevisto, fuso)}</Etiqueta>
          ) : null}
        </>
      }
      principais={[
        { rotulo: 'Valor', numerico: true, valor: dinheiro(ficha.valor), nota: ficha.moeda },
        {
          rotulo: 'Probabilidade',
          numerico: true,
          valor: ficha.probabilidade === null ? '—' : `${ficha.probabilidade}%`,
          nota:
            ficha.valor !== null && ficha.probabilidade !== null && ficha.fechadaEm === null
              ? `${dinheiro((ficha.valor * ficha.probabilidade) / 100)} ponderado`
              : null,
        },
        { rotulo: 'Fase', valor: ficha.fase },
        { rotulo: 'Proprietário', valor: ficha.proprietario ?? 'sem proprietário' },
        {
          rotulo: 'Conta',
          valor: ficha.contaId ? (
            <Link href={`/contas/${ficha.contaId}`}>{ficha.contaNome}</Link>
          ) : (
            'sem conta'
          ),
        },
      ]}
    />
  );
}

export default async function PaginaOportunidade({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const { aba: abaCrua } = await searchParams;
  const aba = abaValida(abaCrua);

  const ficha = await carregarOportunidade(id);
  if (!ficha) notFound();

  const fuso = await fusoDoTenant();
  const hoje = new Date();

  return (
    <>
      <DestaqueDaOportunidade ficha={ficha} fuso={fuso} hoje={hoje} />

      <div className="ficha">
        <aside className="coluna">
          <div className="tblwrap">
            <Secao titulo="Dados">
              <div className="campos">
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
                <Campo
                  k="Lead"
                  v={
                    ficha.leadId ? (
                      <Link href={`/leads/${ficha.leadId}`}>abrir a ficha do lead</Link>
                    ) : (
                      'sem lead de origem'
                    )
                  }
                />
                <Campo
                  k="Score do lead"
                  v={
                    ficha.score === null
                      ? '—'
                      : `${numero(ficha.score)}${ficha.faixa ? ` · ${ficha.faixa}` : ''}`
                  }
                />
                <Campo k="Proprietário" v={ficha.proprietario ?? 'sem proprietário'} />
                <Campo k="Aberta em" v={data(ficha.criadoEm, fuso)} />
              </div>
            </Secao>
          </div>

          {/*
            O fechamento em seção própria: previsto, realizado e motivo da perda
            são a mesma conversa, e é a conversa que decide se a negociação
            continua no funil.
          */}
          <div className="tblwrap">
            <Secao titulo="Fechamento">
              <div className="campos">
                <Campo k="Previsto" v={data(ficha.fechamentoPrevisto, fuso)} />
                <Campo
                  k="Fechada em"
                  v={ficha.fechadaEm ? data(ficha.fechadaEm, fuso) : 'em aberto'}
                />
                <Campo
                  k="Resultado"
                  v={
                    ficha.fechadaEm === null ? (
                      'ainda em negociação'
                    ) : ficha.ganha ? (
                      <Etiqueta>Ganha</Etiqueta>
                    ) : (
                      <Etiqueta tom="erro">Perdida</Etiqueta>
                    )
                  }
                />
                {ficha.ganha === false ? (
                  <Campo k="Motivo da perda" v={ficha.motivoPerda ?? 'não registrado'} />
                ) : null}
              </div>
            </Secao>
          </div>
        </aside>

        <div className="coluna">
          <div className="tblwrap">
            <AbasDaFicha
              base={`/oportunidades/${ficha.id}`}
              aba={aba}
              abas={[
                { ...ABAS[0], contagem: ficha.linhaDoTempo.length },
                { ...ABAS[1], contagem: ficha.irmas.length },
              ]}
              formatar={numero}
            />

            {aba === 'historico' ? (
              ficha.leadId === null ? (
                <div className="vazio">
                  <b>Esta oportunidade não veio de um lead.</b>
                  <span>
                    O histórico da negociação é o do lead que a originou. Sem lead ligado, não há
                    de onde tirá-lo.
                  </span>
                </div>
              ) : (
                <LinhaDoTempo itens={ficha.linhaDoTempo} fuso={fuso} agora={hoje} />
              )
            ) : null}

            {aba === 'conta' ? (
              <Tabela
                colunas={colunasIrmas(hoje, fuso)}
                linhas={ficha.irmas}
                chaveDaLinha={(o) => o.id}
                vazio={
                  ficha.contaId
                    ? 'Esta é a única oportunidade desta conta.'
                    : 'Sem conta ligada, não há outras oportunidades para comparar.'
                }
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
