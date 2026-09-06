import Link from 'next/link';
import { DIA, janelaAberta, pertoDeExpirar, segundosRestantes } from '@pipe/core';
import { EstadoVazio } from '@pipe/ui';
import { decorrido, duracaoCurta } from '../servidor/formato';
import type { ConversaDaLista, EstadoAtendente, TipoCanalBanco } from '../servidor/consultas';

/**
 * As quatro fichas de filtro da coluna, na ordem deles: Todos, Não lidos, Em
 * espera, Inativos. **A contagem vai dentro do rótulo** — "Todos (0)" —, e não
 * numa bolinha ao lado: assim a ficha diz de uma vez o que filtra e quanto
 * sobra, e a coluna não precisa de um contador separado no cabeçalho.
 *
 * O que cada uma quer dizer, já que o nome sozinho é ambíguo:
 *
 * - **Não lidos** — a última palavra é do cliente. Não temos marca de leitura
 *   por mensagem, e "quem deve resposta" é a pergunta que o atendente faz de
 *   verdade ao olhar a fila.
 * - **Inativos** — nada foi dito há mais de 24 horas. É a mesma janela do
 *   WhatsApp, e por isso não inventa um número novo na tela.
 */
export type ChaveDeFicha = 'todos' | 'nao_lidos' | 'em_espera' | 'inativos';

export const FICHAS: { chave: ChaveDeFicha; rotulo: string }[] = [
  { chave: 'todos', rotulo: 'Todos' },
  { chave: 'nao_lidos', rotulo: 'Não lidos' },
  { chave: 'em_espera', rotulo: 'Em espera' },
  { chave: 'inativos', rotulo: 'Inativos' },
];

export function ehFicha(valor: string | undefined): valor is ChaveDeFicha {
  return FICHAS.some((ficha) => ficha.chave === valor);
}

export function naFicha(conversa: ConversaDaLista, ficha: ChaveDeFicha, agora: Date): boolean {
  if (ficha === 'nao_lidos') return conversa.ultimaMensagemDe === 'contato';
  if (ficha === 'em_espera') return conversa.estado === 'em_espera';
  if (ficha === 'inativos') {
    if (!conversa.ultimaMensagemEm) return true;
    return agora.getTime() - conversa.ultimaMensagemEm.getTime() > DIA * 1000;
  }
  return true;
}

/**
 * Rótulo curto do canal, do jeito que o atendente fala.
 *
 * Em caixa normal: canal é conteúdo da linha, não título de seção. Estava em
 * caixa alta e repetido em toda conversa da lista, o que dava à coluna o peso
 * de um cabeçalho. A caixa alta fica para rótulo de seção e cabeçalho de
 * coluna (ver docs/marca/MARCA.md, regras de interface).
 *
 * Os mesmos rótulos existem em `conversa.tsx` — quando o terceiro consumidor
 * aparecer, isto vira uma constante compartilhada.
 */
const CANAL: Record<TipoCanalBanco, string> = {
  whatsapp_cloud: 'WhatsApp',
  instagram: 'Instagram',
  email: 'E-mail',
  widget: 'Site',
};

const RESUMO_POR_TIPO: Record<string, string> = {
  audio: '🎙 Áudio',
  imagem: '🖼 Imagem',
  documento: '📎 Documento',
  video: '🎬 Vídeo',
  localizacao: '📍 Localização',
};

function resumoDaUltima(conversa: ConversaDaLista): string {
  const prefixo = RESUMO_POR_TIPO[conversa.ultimaMensagemTipo ?? 'texto'];
  if (prefixo && conversa.ultimaMensagemTipo !== 'texto') return prefixo;
  return conversa.ultimaMensagem ?? 'Sem mensagem ainda';
}

/**
 * O vazio da coluna tem quatro causas, e cada uma pede uma frase diferente.
 * Uma frase só para as quatro é o que faz o atendente ficar olhando a tela sem
 * saber se a fila está vazia, se ele filtrou demais ou se ninguém o vê.
 *
 * A ordem importa: a busca é a causa mais recente, depois a ficha, e só então o
 * estado do atendente. Dizer "fique online" para quem acabou de buscar por um
 * nome que não existe responde a pergunta errada.
 */
function vazioDaLista(
  busca: string,
  ficha: ChaveDeFicha,
  estado: EstadoAtendente,
): { titulo: string; ilustracao: 'vazio' | 'busca' | 'concluido'; explica: string } {
  if (busca) {
    return {
      titulo: 'Nenhum resultado encontrado',
      ilustracao: 'busca',
      explica: `Nada na sua fila para “${busca}”.`,
    };
  }
  if (ficha !== 'todos') {
    const rotulo = FICHAS.find((f) => f.chave === ficha)?.rotulo ?? '';
    return {
      titulo: `Nenhum atendimento em ${rotulo.toLowerCase()}`,
      ilustracao: 'vazio',
      explica: 'Volte para "Todos" para ver o resto da sua fila.',
    };
  }
  if (estado !== 'online') {
    return {
      titulo: 'Você precisa ficar online para atender um novo cliente',
      ilustracao: 'vazio',
      explica: 'Só quem está Online entra na distribuição. Use o botão acima.',
    };
  }
  return {
    titulo: 'Nenhum atendimento aberto',
    ilustracao: 'concluido',
    explica: 'Você está online e a fila está zerada. A próxima conversa cai aqui sozinha.',
  };
}

export function ListaConversas({
  conversas,
  visiveis,
  selecionadaId,
  busca,
  ficha,
  estado,
  agora,
}: {
  /** Tudo o que a busca deixou passar. É sobre isto que as fichas contam. */
  conversas: ConversaDaLista[];
  /** O que a ficha escolhida deixou passar. É isto que a lista mostra. */
  visiveis: ConversaDaLista[];
  selecionadaId: string | null;
  busca: string;
  ficha: ChaveDeFicha;
  estado: EstadoAtendente;
  agora: Date;
}) {
  const vazio = vazioDaLista(busca, ficha, estado);

  return (
    <>
      <form className="busca" action="/">
        {/* A ficha escolhida sobrevive a uma nova busca: quem estava vendo os
            não lidos não quer voltar para todos por ter digitado um nome. */}
        <input type="hidden" name="filtro" value={ficha} />
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Busque pelo nome ou telefone..."
          aria-label="Buscar atendimento"
        />
      </form>

      {/* Fichas com a contagem DENTRO do rótulo, como no Desk deles. Abaixo de
          certa largura elas viram um menu suspenso na tela deles; aqui elas
          quebram a linha, que resolve o mesmo problema sem um segundo
          componente. */}
      <nav className="fichas" aria-label="Filtrar atendimentos">
        {FICHAS.map((opcao) => {
          const quantas = conversas.filter((c) => naFicha(c, opcao.chave, agora)).length;
          const parametros = new URLSearchParams({ filtro: opcao.chave });
          if (busca) parametros.set('busca', busca);
          return (
            <Link
              key={opcao.chave}
              className="etiqueta"
              href={`/?${parametros.toString()}`}
              aria-current={opcao.chave === ficha ? 'true' : undefined}
            >
              {opcao.rotulo} ({quantas})
            </Link>
          );
        })}
      </nav>

      {visiveis.length === 0 ? (
        <div className="lista-vazia">
          <EstadoVazio titulo={vazio.titulo} ilustracao={vazio.ilustracao}>
            <p>{vazio.explica}</p>
          </EstadoVazio>
        </div>
      ) : (
        <ul className="convs">
          {visiveis.map((conversa) => {
            const temJanela = conversa.canalTipo === 'whatsapp_cloud';
            const aberta = janelaAberta(conversa.janelaExpiraEm, agora);
            const expirando = temJanela && pertoDeExpirar(conversa.janelaExpiraEm, agora);
            const fechada = temJanela && !aberta;
            // Abrir uma conversa não pode desfazer a busca nem a ficha: o
            // atendente estava filtrando por um motivo.
            const parametros = new URLSearchParams({ conversa: conversa.id, filtro: ficha });
            if (busca) parametros.set('busca', busca);
            return (
              <li key={conversa.id}>
                <Link
                  className="conv"
                  href={`/?${parametros.toString()}`}
                  aria-current={conversa.id === selecionadaId ? 'true' : undefined}
                >
                  <span className="nm">{conversa.contatoNome ?? 'Sem nome'}</span>
                  <span className="t">
                    {conversa.ultimaMensagemEm ? decorrido(conversa.ultimaMensagemEm, agora) : '·'}
                  </span>
                  <span className="sn">{resumoDaUltima(conversa)}</span>
                  {/* A faixa de metadados fica abaixo de uma linha de 1px, como
                      no cartão deles: o conteúdo em cima, o que classifica a
                      conversa embaixo. */}
                  <span className="meta">
                    {conversa.filaNome ? (
                      <span className="etiqueta">{conversa.filaNome}</span>
                    ) : null}
                    <span className="etiqueta">{CANAL[conversa.canalTipo]}</span>
                    {/*
                      Prioridade em etiqueta neutra. Era vermelha em "Alta" e
                      ocre em "Média", duas cores de estado repetidas em quase
                      toda linha da fila — e prioridade é categoria fixa, não
                      alerta: o atendente não resolve a prioridade clicando
                      nela. A cor da coluna fica reservada ao que ele resolve,
                      que é a janela expirando e a janela fechada, logo abaixo.
                    */}
                    {conversa.prioridade === 'alta' ? (
                      <span className="etiqueta">Prioridade alta</span>
                    ) : null}
                    {conversa.prioridade === 'media' ? (
                      <span className="etiqueta">Prioridade média</span>
                    ) : null}
                    {conversa.estado === 'em_espera' ? (
                      <span className="etiqueta">Em espera</span>
                    ) : null}
                    {expirando ? (
                      <span className="etiqueta alerta">
                        Janela {duracaoCurta(segundosRestantes(conversa.janelaExpiraEm, agora))}
                      </span>
                    ) : null}
                    {fechada ? <span className="etiqueta erro">Janela fechada</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
