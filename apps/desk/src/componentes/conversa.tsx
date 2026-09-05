import Link from 'next/link';
import { janelaAberta, pertoDeExpirar, segundosRestantes } from '@pipe/core';
import { AcoesDaConversa } from './acoes-conversa';
import { Compositor } from './compositor';
import type { VariaveisDoContato } from './compositor';
import { DialogoEncerrar } from './dialogo-encerrar';
import { BotaoReenviar } from './reenviar';
import { duracaoCurta, hora } from '../servidor/formato';
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

const ENTREGA: Record<string, string> = {
  pendente: 'pendente',
  enviando: 'enviando',
  enviada: 'enviada',
  entregue: 'entregue',
  lida: 'lida',
  falhou: 'falhou',
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
  if (!temJanela) return <span className="pill ch">CANAL SEM JANELA</span>;
  if (!janelaAberta(expiraEm, agora)) return <span className="pill hi">JANELA FECHADA</span>;
  const restante = duracaoCurta(segundosRestantes(expiraEm, agora));
  if (pertoDeExpirar(expiraEm, agora)) {
    return <span className="pill med">JANELA FECHA EM {restante}</span>;
  }
  return <span className="pill info">JANELA ABERTA · {restante}</span>;
}

function CorpoDaMensagem({ item }: { item: Extract<ItemDaConversa, { genero: 'mensagem' }> }) {
  if (item.tipo === 'audio') {
    return (
      <div className="audio">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M8 5v14l11-7L8 5Z" />
        </svg>
        <span className="bar" />
        <span className="mono">{item.conteudo ?? 'áudio'}</span>
      </div>
    );
  }
  return <>{item.conteudo ?? ''}</>;
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
        <div>
          <h3>{conversa.contatoNome ?? 'Sem nome'}</h3>
          <div className="sub mono">
            #{conversa.id.slice(0, 8)} · {conversa.filaNome ?? 'sem fila'} ·{' '}
            {CANAL[conversa.canalTipo] ?? conversa.canalTipo}
            {conversa.emEsperaDesde ? ' · em espera' : ''}
          </div>
        </div>
        <PilulaDaJanela temJanela={temJanela} expiraEm={conversa.janelaExpiraEm} agora={agora} />
        <AcoesDaConversa conversaId={conversa.id} emEspera={conversa.estado === 'em_espera'} />
      </div>

      <div className="msgs">
        {itens.map((item) => {
          if (item.genero === 'nota') {
            return (
              <div className="msg nota" key={`n-${item.id}`}>
                <div className="bub">{item.corpo}</div>
                <div className="st">
                  nota interna · {item.autor ?? 'sistema'} · {hora(item.criadaEm)}
                </div>
              </div>
            );
          }
          const saida = item.direcao === 'saida';
          const falhou = item.estadoEntrega === 'falhou';
          return (
            <div
              className={`msg${saida ? ' out' : ''}${falhou ? ' falhou' : ''}`}
              key={`m-${item.id}`}
            >
              <div className="bub">
                <CorpoDaMensagem item={item} />
              </div>
              {falhou ? (
                <div className="fail-note">
                  <svg
                    viewBox="0 0 24 24"
                    width="15"
                    height="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7.5v5M12 16h.01" />
                  </svg>
                  <span>{item.erroTexto ?? 'Falha na entrega, sem motivo informado.'}</span>
                  <BotaoReenviar mensagemId={item.id} />
                </div>
              ) : null}
              <div className="st">
                {hora(item.criadaEm)}
                {saida && item.estadoEntrega
                  ? ` · ${ENTREGA[item.estadoEntrega] ?? item.estadoEntrega}`
                  : ''}
                {item.deRespostaPronta ? ' · resposta pronta' : ''}
                {item.deTemplate ? ' · template' : ''}
                {falhou && item.erroCodigo ? ` · ${item.erroCodigo}` : ''}
              </div>
            </div>
          );
        })}
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
