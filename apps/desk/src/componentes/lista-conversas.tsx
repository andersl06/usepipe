import Link from 'next/link';
import { DIA, janelaAberta, pertoDeExpirar, segundosRestantes } from '@pipe/core';
import { ROTULOS_PRIORIDADE } from '@pipe/core/conversa';
import { Avatar, EstadoVazio } from '@pipe/ui';
import { FiltrosDaLista } from './filtros-lista';
import { decorrido, duracaoCurta } from '../servidor/formato';
import type { ConversaDaLista, EstadoAtendente, TipoCanalBanco } from '../servidor/consultas';
import type { ChaveDeOrdem } from '../lib/ordem';

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
 * - **Sem resposta** — o atendente nunca respondeu esta conversa. É o escopo
 *   `unattended` do Chatwoot (`first_reply_created_at IS NULL`), e é diferente
 *   de "não lidos": aqui entra também a conversa que o cliente já cobrou duas
 *   vezes e ninguém abriu. Adaptado de chatwoot (MIT) —
 *   https://github.com/chatwoot/chatwoot/blob/develop/app/models/conversation.rb
 * - **Inativos** — nada foi dito há mais de 24 horas. É a mesma janela do
 *   WhatsApp, e por isso não inventa um número novo na tela.
 */
export type ChaveDeFicha = 'todos' | 'nao_lidos' | 'sem_resposta' | 'em_espera' | 'inativos';

export const FICHAS: { chave: ChaveDeFicha; rotulo: string }[] = [
  { chave: 'todos', rotulo: 'Todos' },
  { chave: 'nao_lidos', rotulo: 'Não lidos' },
  { chave: 'sem_resposta', rotulo: 'Sem resposta' },
  { chave: 'em_espera', rotulo: 'Em espera' },
  { chave: 'inativos', rotulo: 'Inativos' },
];

export function ehFicha(valor: string | undefined): valor is ChaveDeFicha {
  return FICHAS.some((ficha) => ficha.chave === valor);
}

export function naFicha(conversa: ConversaDaLista, ficha: ChaveDeFicha, agora: Date): boolean {
  if (ficha === 'nao_lidos') return conversa.ultimaMensagemDe === 'contato';
  if (ficha === 'sem_resposta') return conversa.primeiraRespostaEm === null;
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
): {
  titulo: string;
  ilustracao: 'vazio' | 'busca' | 'concluido';
  explica: string;
  /** A saída do vazio, quando ele foi o atendente que causou. Parâmetro vazio apaga. */
  saida?: { alvo: Record<string, string>; rotulo: string };
} {
  if (busca) {
    return {
      titulo: 'Nenhum resultado encontrado',
      ilustracao: 'busca',
      explica: `Nada na sua fila para “${busca}”.`,
      // Sem esta saída, a única forma de voltar é apagar o campo na mão e
      // apertar Enter de novo — e quem esqueceu que buscou lê a tela como
      // "não tenho atendimento nenhum".
      saida: { alvo: { busca: '' }, rotulo: 'Limpar busca' },
    };
  }
  if (ficha !== 'todos') {
    const rotulo = FICHAS.find((f) => f.chave === ficha)?.rotulo ?? '';
    return {
      titulo: `Nenhum atendimento em ${rotulo.toLowerCase()}`,
      ilustracao: 'vazio',
      explica: 'O resto da sua fila continua em "Todos".',
      saida: { alvo: { filtro: 'todos' }, rotulo: 'Ver todos' },
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
  ordem,
  fila,
  filas,
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
  ordem: ChaveDeOrdem;
  /** Nome da fila escolhida, ou vazio para todas. */
  fila: string;
  /** As filas que existem na lista, para o seletor. */
  filas: string[];
  estado: EstadoAtendente;
  agora: Date;
}) {
  const vazio = vazioDaLista(busca, ficha, estado);

  /**
   * Todo link da coluna carrega o estado inteiro. Sem isto, clicar numa ficha
   * devolve a lista à ordem padrão e à fila cheia — e o atendente que estava
   * caçando o mais antigo da fila do Financeiro volta ao começo a cada clique.
   */
  function comEstado(extra: Record<string, string>): string {
    const parametros = new URLSearchParams({ filtro: ficha });
    if (busca) parametros.set('busca', busca);
    if (ordem !== 'recentes') parametros.set('ordem', ordem);
    if (fila) parametros.set('fila', fila);
    // Valor vazio APAGA o parâmetro: é assim que "Limpar busca" limpa a busca
    // sem precisar de um segundo construtor de URL só para ela.
    for (const [chave, valor] of Object.entries(extra)) {
      if (valor) parametros.set(chave, valor);
      else parametros.delete(chave);
    }
    return `/?${parametros.toString()}`;
  }

  return (
    <>
      <form className="busca" action="/">
        {/* A ficha escolhida sobrevive a uma nova busca: quem estava vendo os
            não lidos não quer voltar para todos por ter digitado um nome. */}
        <input type="hidden" name="filtro" value={ficha} />
        {ordem !== 'recentes' ? <input type="hidden" name="ordem" value={ordem} /> : null}
        {fila ? <input type="hidden" name="fila" value={fila} /> : null}
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
          return (
            <Link
              key={opcao.chave}
              className="etiqueta"
              href={comEstado({ filtro: opcao.chave })}
              aria-current={opcao.chave === ficha ? 'true' : undefined}
            >
              {opcao.rotulo} ({quantas})
            </Link>
          );
        })}
      </nav>

      <FiltrosDaLista ordem={ordem} fila={fila} filas={filas} busca={busca} ficha={ficha} />

      {visiveis.length === 0 ? (
        <div className="lista-vazia">
          <EstadoVazio titulo={vazio.titulo} ilustracao={vazio.ilustracao}>
            <p>{vazio.explica}</p>
            {vazio.saida ? (
              <Link className="btn" href={comEstado(vazio.saida.alvo)}>
                {vazio.saida.rotulo}
              </Link>
            ) : null}
          </EstadoVazio>
        </div>
      ) : (
        <ul className="convs">
          {visiveis.map((conversa) => {
            const temJanela = conversa.canalTipo === 'whatsapp_cloud';
            const aberta = janelaAberta(conversa.janelaExpiraEm, agora);
            const expirando = temJanela && pertoDeExpirar(conversa.janelaExpiraEm, agora);
            const fechada = temJanela && !aberta;
            return (
              <li key={conversa.id}>
                {/* Abrir uma conversa não pode desfazer a busca, a ficha, a
                    ordem nem a fila: o atendente estava filtrando por um motivo. */}
                <Link
                  className="conv"
                  href={comEstado({ conversa: conversa.id })}
                  aria-current={conversa.id === selecionadaId ? 'true' : undefined}
                >
                  {/* O rosto do cliente abre o cartão, como na tela de
                      referência. Não é enfeite: numa fila de vinte linhas com
                      o mesmo desenho, é o disco com as iniciais que dá ao olho
                      onde parar, e é o que faz o cartão ler como pessoa em vez
                      de linha de tabela. */}
                  <Avatar
                    nome={conversa.contatoNome ?? 'Sem nome'}
                    className="av-conv"
                  />
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

                      O rótulo vem de `ROTULOS_PRIORIDADE`, e não de dois
                      `if` escritos à mão: a régua ganhou "Máxima" e "Sem
                      prioridade", e a versão anterior teria deixado o degrau
                      mais urgente da fila SEM etiqueta nenhuma.

                      "Sem prioridade" é o único que não vira etiqueta: é a
                      ausência, é o padrão da coluna, e escrevê-la em quase
                      toda linha seria ruído em vez de informação.
                    */}
                    {conversa.prioridade !== 'sem_prioridade' &&
                    ROTULOS_PRIORIDADE[conversa.prioridade] ? (
                      <span className="etiqueta">
                        Prioridade {ROTULOS_PRIORIDADE[conversa.prioridade].toLowerCase()}
                      </span>
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
