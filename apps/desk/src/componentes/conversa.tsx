import Link from 'next/link';
import { janelaAberta, pertoDeExpirar, segundosRestantes } from '@pipe/core';
import { Avatar } from '@pipe/ui';
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

/**
 * Adaptado de chatwoot (MIT) —
 * https://github.com/chatwoot/chatwoot/blob/develop/app/javascript/dashboard/components-next/message/MessageStatus.vue
 *
 * A confirmação de entrega e de leitura, no gesto que o atendente já conhece do
 * WhatsApp: um tique é enviada, dois tiques é entregue, e dois tiques na tinta
 * de informação é lida. Mesmo mapa do Chatwoot (`check` / `check-check`, com o
 * lido tingido), com a tinta saindo do nosso token em vez do azul literal deles.
 *
 * O horário exato de cada degrau vai para o `title`: `lida_em` e `entregue_em`
 * já vinham do banco e a tela jogava fora, e é justamente essa hora que resolve
 * a discussão de "eu mandei" contra "não chegou".
 */
function MarcaDeEntrega({
  item,
}: {
  item: Extract<ItemDaConversa, { genero: 'mensagem' }>;
}) {
  const estado = item.estadoEntrega;
  if (!estado || estado === 'falhou') return null;

  const lida = estado === 'lida';
  const duplo = lida || estado === 'entregue';
  const quando = lida ? item.lidaEm : item.entregueEm;
  const rotulo = `${ENTREGA[estado] ?? estado}${quando ? ` às ${hora(quando)}` : ''}`;

  return (
    <span className="entrega" data-lida={lida ? 'true' : 'false'} title={rotulo}>
      <svg
        viewBox="0 0 20 12"
        width="15"
        height="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-label={rotulo}
      >
        <path d="M1 6.5 4.5 10 11 2" />
        {duplo ? <path d="M8 6.5 11.5 10 18 2" /> : null}
      </svg>
    </span>
  );
}

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

function CorpoDaMensagem({ item }: { item: Extract<ItemDaConversa, { genero: 'mensagem' }> }) {
  if (item.tipo === 'audio') {
    return (
      <div className="audio">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M8 5v14l11-7L8 5Z" />
        </svg>
        {/* O conteúdo do áudio é a transcrição, ou a descrição dele: texto
            corrido, e por isso sem monoespaçada. */}
        <span className="bar" />
        <span>{item.conteudo ?? 'áudio'}</span>
      </div>
    );
  }
  return <>{item.conteudo ?? ''}</>;
}

type LadoDoGrupo = 'entrada' | 'saida' | 'nota';
type GrupoDeMensagens = { lado: LadoDoGrupo; itens: ItemDaConversa[] };

/**
 * Mensagens seguidas do mesmo autor viram um grupo, como no Desk deles: 3px
 * entre balões dentro do grupo e 20px entre grupos, com os cantos que se
 * encostam encolhendo de 13px para 2px (medidas em
 * `docs/pesquisa/blip-desk-medidas.md`, §4).
 *
 * Nota interna nunca agrupa: ela é um aparte no meio da conversa, e empilhar
 * duas notas como se fossem uma fala só apaga que são dois momentos.
 */
function agrupar(itens: ItemDaConversa[]): GrupoDeMensagens[] {
  const grupos: GrupoDeMensagens[] = [];
  for (const item of itens) {
    const lado: LadoDoGrupo =
      item.genero === 'nota' ? 'nota' : item.direcao === 'saida' ? 'saida' : 'entrada';
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.lado === lado && lado !== 'nota') ultimo.itens.push(item);
    else grupos.push({ lado, itens: [item] });
  }
  return grupos;
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
        {agrupar(itens).map((grupo, indiceDoGrupo) => (
          <div className="grupo" data-lado={grupo.lado} key={`g-${grupo.itens[0]?.id ?? indiceDoGrupo}`}>
            {grupo.itens.map((item, indice) => {
              if (item.genero === 'nota') {
                return (
                  <div className="msg nota" key={`n-${item.id}`}>
                    <div className="bub">
                      {item.corpo}
                      <span className="st">
                        nota interna · {item.autor ?? 'sistema'} · {hora(item.criadaEm)}
                      </span>
                    </div>
                  </div>
                );
              }
              const saida = item.direcao === 'saida';
              const falhou = item.estadoEntrega === 'falhou';
              return (
                <div
                  className={`msg${saida ? ' out' : ''}${falhou ? ' falhou' : ''}`}
                  data-primeiro={indice === 0 ? 'true' : 'false'}
                  key={`m-${item.id}`}
                >
                  <div className="bub">
                    <CorpoDaMensagem item={item} />
                    {/* O horário e o estado de entrega vivem DENTRO do balão,
                        encostados no canto de baixo, como no Desk deles. É o que
                        permite empilhar as mensagens do mesmo autor a 3px sem
                        uma linha de texto entre cada duas. */}
                    <span className="st">
                      {hora(item.criadaEm)}
                      {item.deRespostaPronta ? ' · resposta pronta' : ''}
                      {item.deTemplate ? ' · template' : ''}
                      {/* Falha continua por escrito, e logo abaixo com o motivo:
                          um tique cortado no canto do balão não dá para ler
                          numa conversa longa. */}
                      {saida && falhou ? ' · falhou' : ''}
                      {saida ? <MarcaDeEntrega item={item} /> : null}
                    </span>
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
                      <span>
                        {item.erroTexto ?? 'Falha na entrega, sem motivo informado.'}
                        {item.erroCodigo ? ` (${item.erroCodigo})` : ''}
                      </span>
                      <BotaoReenviar mensagemId={item.id} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
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
