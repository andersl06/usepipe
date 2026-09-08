import { BotaoReenviar } from './reenviar';
import { hora } from '../servidor/formato';
import type { ItemDaConversa } from '../servidor/consultas';

/**
 * A conversa desenhada — balões, grupos, horário, estado de entrega e falha.
 *
 * Mora fora de `conversa.tsx` porque **duas telas mostram a mesma conversa**: a
 * do atendimento em curso, com compositor, e a do atendimento antigo aberto em
 * leitura a partir do histórico do contato. Um segundo renderizador de balão
 * seria dois lugares para acertar o canto de 2px, o agrupamento de 3px e a
 * regra da falha — e eles divergiriam na primeira correção feita só num deles.
 *
 * As medidas estão em `docs/pesquisa/blip-desk-medidas.md`, §5.
 */

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
function MarcaDeEntrega({ item }: { item: Extract<ItemDaConversa, { genero: 'mensagem' }> }) {
  const estado = item.estadoEntrega;
  if (!estado || estado === 'falhou') return null;
  /*
    Pendente e enviando NÃO ganham tique. Desde que o envio passou pela `api`, a
    mensagem nasce `pendente` e só vira `enviada` quando sai de verdade — pintar
    um tique antes disso é o mesmo defeito que a tela tinha quando gravava
    direto no banco e marcava enviada sozinha. Sem tique, o horário aparece
    igual e o atendente vê que ainda está a caminho.
  */
  if (estado === 'pendente' || estado === 'enviando') return null;

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

function CorpoDaMensagem({ item }: { item: Extract<ItemDaConversa, { genero: 'mensagem' }> }) {
  if (item.tipo === 'audio') {
    return (
      <div className="audio">
        <svg
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
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
interface GrupoDeMensagens {
  lado: LadoDoGrupo;
  itens: ItemDaConversa[];
}

/**
 * Mensagens seguidas do mesmo autor viram um grupo: 3px entre balões dentro do
 * grupo e 20px entre grupos, com os cantos que se encostam encolhendo de 13px
 * para 2px.
 *
 * Nota interna nunca agrupa: ela é um aparte no meio da conversa, e empilhar
 * duas notas como se fossem uma fala só apaga que são dois momentos.
 */
export function agrupar(itens: ItemDaConversa[]): GrupoDeMensagens[] {
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

export function ListaDeMensagens({
  conversaId,
  itens,
  somenteLeitura = false,
}: {
  conversaId: string;
  itens: ItemDaConversa[];
  /**
   * Atendimento antigo, aberto pelo histórico. O que sai é o botão de reenviar:
   * a conversa está encerrada, e reenviar reabriria uma fala que já foi
   * arquivada. A falha continua visível e continua explicada — o que ela perde
   * é a ação, não o registro.
   */
  somenteLeitura?: boolean;
}) {
  return (
    <>
      {agrupar(itens).map((grupo, indiceDoGrupo) => (
        <div
          className="grupo"
          data-lado={grupo.lado}
          key={`g-${grupo.itens[0]?.id ?? indiceDoGrupo}`}
        >
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
                      encostados no canto de baixo. É o que permite empilhar as
                      mensagens do mesmo autor a 3px sem uma linha de texto
                      entre cada duas. */}
                  <span className="st">
                    {hora(item.criadaEm)}
                    {item.deRespostaPronta ? ' · resposta pronta' : ''}
                    {item.deTemplate ? ' · template' : ''}
                    {/* Falha continua por escrito, e logo abaixo com o motivo:
                        um tique cortado no canto do balão não dá para ler numa
                        conversa longa. */}
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
                    {somenteLeitura ? null : (
                      <BotaoReenviar conversaId={conversaId} mensagemId={item.id} />
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
