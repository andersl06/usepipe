import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Etiqueta, Tabela, type Coluna } from '@pipe/ui';
import { fusoDoTenant } from '../../../lib/banco';
import {
  carregarConta,
  type ContatoDaConta,
  type OportunidadeDaConta,
} from '../../../lib/contas';
import { data, dinheiro, documento, numero } from '../../../lib/formato';

export const dynamic = 'force-dynamic';

const COLUNAS_CONTATO: readonly Coluna<ContatoDaConta>[] = [
  {
    chave: 'nome',
    rotulo: 'Contato',
    celula: (c) => <Link href={`/contatos/${c.id}`}>{c.nome}</Link>,
  },
  { chave: 'email', rotulo: 'E-mail', celula: (c) => c.email ?? '—' },
  { chave: 'telefone', rotulo: 'Telefone', numerica: true, celula: (c) => c.telefone ?? '—' },
  {
    chave: 'score',
    rotulo: 'Score',
    numerica: true,
    celula: (c) => (c.score === null ? '—' : numero(c.score)),
  },
  { chave: 'faixa', rotulo: 'Faixa', celula: (c) => (c.faixa ? <Etiqueta>{c.faixa}</Etiqueta> : '—') },
  {
    chave: 'lead',
    rotulo: 'Lead',
    celula: (c) => (c.leadId ? <Link href={`/leads/${c.leadId}`}>abrir</Link> : '—'),
  },
];

/**
 * A oportunidade fechada não sai da lista: ela é o histórico da conta, e é o
 * que responde "já compraram alguma vez". A única cor da tela é o fechamento
 * vencido de uma oportunidade que continua aberta — o resto é categoria.
 */
function colunasOportunidade(hoje: Date, fuso: string): readonly Coluna<OportunidadeDaConta>[] {
  return [
    { chave: 'nome', rotulo: 'Oportunidade', celula: (o) => <span className="forte">{o.nome}</span> },
    { chave: 'fase', rotulo: 'Fase', celula: (o) => <Etiqueta>{o.fase}</Etiqueta> },
    { chave: 'valor', rotulo: 'Valor', numerica: true, celula: (o) => dinheiro(o.valor) },
    {
      chave: 'probabilidade',
      rotulo: 'Probabilidade',
      numerica: true,
      celula: (o) => (o.probabilidade === null ? '—' : `${o.probabilidade}%`),
    },
    { chave: 'dono', rotulo: 'Proprietário', celula: (o) => o.proprietario ?? '—' },
    {
      chave: 'situacao',
      rotulo: 'Situação',
      celula: (o) => {
        if (o.fechadaEm) {
          return <Etiqueta>{o.ganha ? 'Ganha' : 'Perdida'} em {data(o.fechadaEm, fuso)}</Etiqueta>;
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

export default async function PaginaConta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ficha = await carregarConta(id);
  if (!ficha) notFound();

  const fuso = await fusoDoTenant();
  const hoje = new Date();

  return (
    <>
      <div className="p-cabecalho">
        <div>
          <Link href="/contas" className="voltar">
            ← Contas
          </Link>
          <h2>{ficha.nome}</h2>
        </div>
        <div className="p-cabecalho-fim">
          {ficha.dominio ? <Etiqueta>{ficha.dominio}</Etiqueta> : null}
          {ficha.documento ? <Etiqueta>CNPJ {documento(ficha.documento)}</Etiqueta> : null}
          <Etiqueta>{ficha.proprietario ?? 'sem proprietário'}</Etiqueta>
        </div>
      </div>

      <div className="resumo">
        <div>
          <b>{numero(ficha.contatos.length)}</b>
          <span>contatos</span>
        </div>
        <div>
          <b>{numero(ficha.oportunidades.filter((o) => o.fechadaEm === null).length)}</b>
          <span>oportunidades abertas</span>
        </div>
        <div>
          <b>{dinheiro(ficha.valorAberto)}</b>
          <span>em negociação</span>
        </div>
        <div>
          <b>{dinheiro(ficha.valorGanho)}</b>
          <span>já fechado</span>
        </div>
      </div>

      <div className="tblwrap">
        <header>
          <b>Contatos</b>
          <span className="lbl">quem falar dentro da conta</span>
        </header>
        <Tabela
          colunas={COLUNAS_CONTATO}
          linhas={ficha.contatos}
          chaveDaLinha={(c) => c.id}
          vazio="Nenhum contato ligado a esta conta."
        />
      </div>

      <div className="tblwrap">
        <header>
          <b>Oportunidades</b>
          <span className="lbl">abertas primeiro</span>
        </header>
        <Tabela
          colunas={colunasOportunidade(hoje, fuso)}
          linhas={ficha.oportunidades}
          chaveDaLinha={(o) => o.id}
          vazio="Nenhuma oportunidade nesta conta."
        />
        <div className="mensagem">
          Aberta em {data(ficha.criadoEm, fuso)}. A oportunidade fechada continua na lista: é ela
          que responde se esta conta já comprou.
        </div>
      </div>
    </>
  );
}
