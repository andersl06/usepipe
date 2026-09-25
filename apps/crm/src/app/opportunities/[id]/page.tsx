import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Etiqueta, Tabela, type Column } from '@pipe/ui';
import { AbasDaFicha, Campo, Destaque, Section } from '../../../components/ficha';
import { TimeLinha } from '../../../components/linha-of-time';
import { fusoDoTenant } from '../../../lib/database';
import {
  loadOpportunity,
  type FichaOpportunity,
  type LinhaOpportunity,
} from '../../../lib/funil';
import { data, desde, money, numero } from '../../../lib/format';

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

type AbaOpportunity = (typeof ABAS)[number]['chave'];

function abaValida(value: string | undefined): AbaOpportunity {
  return (ABAS.find((a) => a.chave === value)?.chave ?? 'historico') as AbaOpportunity;
}

function colunasIrmas(hoje: Date, fuso: string): readonly Column<LinhaOpportunity>[] {
  return [
    {
      key: 'nome',
      rotulo: 'Oportunidade',
      celula: (o) => <Link href={`/opportunities/${o.id}`}>{o.nome}</Link>,
    },
    { key: 'fase', rotulo: 'Fase', celula: (o) => <Etiqueta>{o.fase}</Etiqueta> },
    { key: 'valor', rotulo: 'Valor', numerica: true, celula: (o) => money(o.value) },
    {
      key: 'situacao',
      rotulo: 'Situação',
      celula: (o) => {
        if (o.fechadaEm) {
          return (
            <Etiqueta>
              {o.ganha ? 'Ganha' : 'Perdida'} em {data(o.fechadaEm, fuso)}
            </Etiqueta>
          );
        }
        if (o.closingPrevisto && o.closingPrevisto < hoje) {
          return <Etiqueta tom="alert">venceu em {data(o.closingPrevisto, fuso)}</Etiqueta>;
        }
        return o.closingPrevisto ? (
          <Etiqueta>fecha em {data(o.closingPrevisto, fuso)}</Etiqueta>
        ) : (
          '—'
        );
      },
    },
  ];
}

function OpportunityDestaque({
  ficha,
  fuso,
  hoje,
}: {
  ficha: FichaOpportunity;
  fuso: string;
  hoje: Date;
}) {
  const vencida =
    ficha.fechadaEm === null &&
    ficha.closingPrevisto !== null &&
    ficha.closingPrevisto < hoje;

  return (
    <Destaque
      trilha={{ href: '/opportunities', rotulo: 'Oportunidades' }}
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
          {vencida && ficha.closingPrevisto ? (
            <Etiqueta tom="alert">venceu em {data(ficha.closingPrevisto, fuso)}</Etiqueta>
          ) : null}
        </>
      }
      main={[
        { rotulo: 'Valor', numerico: true, value: money(ficha.value), nota: ficha.moeda },
        {
          rotulo: 'Probabilidade',
          numerico: true,
          value: ficha.probability === null ? '—' : `${ficha.probability}%`,
          nota:
            ficha.value !== null && ficha.probability !== null && ficha.fechadaEm === null
              ? `${money((ficha.value * ficha.probability) / 100)} ponderado`
              : null,
        },
        { rotulo: 'Fase', value: ficha.fase },
        { rotulo: 'Proprietário', value: ficha.proprietario ?? 'sem proprietário' },
        {
          rotulo: 'Conta',
          value: ficha.accountId ? (
            <Link href={`/accounts/${ficha.accountId}`}>{ficha.accountName}</Link>
          ) : (
            'sem conta'
          ),
        },
      ]}
    />
  );
}

export default async function PageOpportunity({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const { aba: abaCrua } = await searchParams;
  const aba = abaValida(abaCrua);

  const ficha = await loadOpportunity(id);
  if (!ficha) notFound();

  const fuso = await fusoDoTenant();
  const hoje = new Date();

  return (
    <>
      <OpportunityDestaque ficha={ficha} fuso={fuso} hoje={hoje} />

      <div className="ficha">
        <aside className="coluna">
          <div className="tblwrap">
            <Section titulo="Dados">
              <div className="campos">
                <Campo
                  k="Conta"
                  v={
                    ficha.accountId ? (
                      <Link href={`/accounts/${ficha.accountId}`}>{ficha.accountName}</Link>
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
            </Section>
          </div>

          {/*
            O fechamento em seção própria: previsto, realizado e motivo da perda
            são a mesma conversa, e é a conversa que decide se a negociação
            continua no funil.
          */}
          <div className="tblwrap">
            <Section titulo="Fechamento">
              <div className="campos">
                <Campo k="Previsto" v={data(ficha.closingPrevisto, fuso)} />
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
            </Section>
          </div>
        </aside>

        <div className="coluna">
          <div className="tblwrap">
            <AbasDaFicha
              base={`/opportunities/${ficha.id}`}
              aba={aba}
              abas={[
                { ...ABAS[0], count: ficha.timeLinha.length },
                { ...ABAS[1], count: ficha.irmas.length },
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
                <TimeLinha itens={ficha.timeLinha} fuso={fuso} agora={hoje} />
              )
            ) : null}

            {aba === 'conta' ? (
              <Tabela
                colunas={colunasIrmas(hoje, fuso)}
                linhas={ficha.irmas}
                linhaKey={(o) => o.id}
                empty={
                  ficha.accountId
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
