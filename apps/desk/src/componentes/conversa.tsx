import Link from 'next/link';
import { janelaAberta, pertoDeExpirar, segundosRestantes } from '@pipe/core';
import { Avatar } from '@pipe/ui';
import { AcoesDaConversa } from './acoes-conversa';
import { Compositor } from './compositor';
import type { VariaveisDoContato } from '../lib/template';
import { DialogoEncerrar } from './dialogo-encerrar';
import { ListaDeMensagens } from './mensagens';
import { duracaoCurta } from '../servidor/formato';
import type {
  ConversaAberta,
  EtiquetaDoDesk,
  ItemDaConversa,
  RespostaProntaDoDesk,
  TemplateAprovado,
} from '../servidor/consultas';

const CANAL: Record<string, string> = {
  whatsapp_cloud: 'WhatsApp',
  instagram: 'Instagram',
  email: 'E-mail',
  widget: 'Site',
};

/** O cabeçalho diz o tempo restante da janela antes de o atendente escrever, não depois. */
function PilulaDaJanela({
  temJanela,
  expiraEm,
  agora,
}: {
  temJanela: boolean;
  expiraEm: Date | null;
  agora: Date;
}) {
  if (!temJanela) return <span className="etiqueta">Canal sem janela</span>;
  if (!janelaAberta(expiraEm, agora)) return <span className="etiqueta erro">Janela fechada</span>;
  const restante = duracaoCurta(segundosRestantes(expiraEm, agora));
  if (pertoDeExpirar(expiraEm, agora)) {
    return <span className="etiqueta alerta">Janela fecha em {restante}</span>;
  }
  return <span className="etiqueta">Janela aberta · {restante}</span>;
}

export function Conversa({
  conversa,
  itens,
  etiquetas,
  respostas,
  templates,
  colegas,
  atendente,
  agora,
}: {
  conversa: ConversaAberta;
  itens: ItemDaConversa[];
  etiquetas: EtiquetaDoDesk[];
  respostas: RespostaProntaDoDesk[];
  templates: TemplateAprovado[];
  colegas: { id: string; nome: string }[];
  atendente: { nome: string; email: string };
  agora: Date;
}) {
  const temJanela = conversa.canalTipo === 'whatsapp_cloud';
  const aberta = !temJanela || janelaAberta(conversa.janelaExpiraEm, agora);

  const variaveis: VariaveisDoContato = {
    'contato.nome': conversa.contatoNome ?? '',
    'contato.email': conversa.contatoEmail ?? '',
    'contato.telefone': conversa.contatoTelefone ?? '',
    'atendente.nome': atendente.nome,
    'atendente.primeiro_nome': atendente.nome.split(' ')[0] ?? atendente.nome,
    'atendente.email': atendente.email,
  };

  return (
    <div className="thread">
      <div className="thread-head">
        <Link className="voltar" href="/">
          ← Atendimentos
        </Link>
        {/* Avatar do contato à esquerda do nome, como no cabeçalho deles. */}
        <Avatar nome={conversa.contatoNome ?? 'Sem nome'} className="av-contato" />
        <div>
          <h3>{conversa.contatoNome ?? 'Sem nome'}</h3>
          {/*
            A linha inteira estava em monoespaçada por causa do identificador
            que a abre. Nome de fila e nome de canal não são número e não
            alinham coluna nenhuma: a mono fica só no identificador, que é o
            que a pessoa copia e compara.
          */}
          <div className="sub">
            <span className="mono">#{conversa.id.slice(0, 8)}</span> ·{' '}
            {conversa.filaNome ?? 'sem fila'} ·{' '}
            {CANAL[conversa.canalTipo] ?? conversa.canalTipo}
            {conversa.emEsperaDesde ? ' · em espera' : ''}
          </div>
        </div>
        <PilulaDaJanela temJanela={temJanela} expiraEm={conversa.janelaExpiraEm} agora={agora} />
        <AcoesDaConversa conversaId={conversa.id} emEspera={conversa.estado === 'em_espera'} />
      </div>

      <div className="msgs">
        <ListaDeMensagens conversaId={conversa.id} itens={itens} />
      </div>

      <Compositor
        conversaId={conversa.id}
        respostas={respostas}
        colegas={colegas}
        templates={templates}
        variaveis={variaveis}
        temJanela={temJanela}
        janelaAberta={aberta}
        emEspera={conversa.estado === 'em_espera'}
      />
      <DialogoEncerrar conversaId={conversa.id} etiquetas={etiquetas} />
    </div>
  );
}
