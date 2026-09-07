'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { Etiqueta, EstadoVazio } from '@pipe/ui';
import { atribuirEmMassa, desqualificarEmMassa } from '../app/leads/acoes';
import { CelulaInline } from './celula-inline';
import {
  colunaDoAgrupamento,
  colunaOrdenavel,
  direcaoInicial,
  escreverFiltros,
  ROTULO_STATUS,
  type Agrupamento,
  type Direcao,
  type Filtros,
  type Grupo,
  type LinhaLead,
  type Ordem,
  type Proprietario,
} from '../lib/leads-visao';
import { desde, numero } from '../lib/formato';
import { useLarguras } from './redimensionar';
import { ControleDeColunas, useColunas } from './colunas';

/**
 * A lista de leads: ordenação por coluna, coluna redimensionável, seleção
 * múltipla e ação em massa.
 *
 * As quatro coisas foram lidas do Twenty e escritas do zero — `twenty-front` é
 * AGPL e não entra aqui. O que a leitura ensinou, e que a nossa versão anterior
 * não tinha:
 *
 * - **A ordenação vive na URL**, não no componente. Uma lista ordenada é um
 *   endereço que se cola no chat, e o botão de voltar do navegador desfaz a
 *   ordenação como desfaz qualquer outra coisa. É também o que permite ordenar
 *   no banco, que é onde a ordenação de uma lista com teto tem de acontecer.
 * - **A largura da coluna é do usuário**, e sobrevive ao recarregamento.
 * - **A seleção não desenha uma sexta coluna vazia**: a caixa mora na primeira
 *   célula, aparece no hover, e fica visível quando marcada.
 * - **A ação em massa é uma barra que só existe com algo selecionado.** Uma
 *   barra permanente com botões apagados é exatamente o que este produto não faz.
 *
 * O que não copiamos deles: a coluna congelada à esquerda e a linha de "novo
 * registro" no fim da tabela. A primeira só paga a pena com mais colunas do que
 * temos; a segunda pressupõe criação inline, que ainda não existe aqui.
 */

/**
 * Os atalhos da listagem.
 *
 * `j`/`k` e as setas são os deles, lidos em
 * `record-table/hooks/useRecordTableRowFocusHotkeys.ts` — eles casam `ArrowDown`
 * com `j` e `ArrowUp` com `k` no mesmo gancho, que é a convenção de terminal
 * que o Gmail e o GitHub também usam. `/` para a busca e `Enter` para abrir são
 * a mesma família.
 *
 * O ouvinte é um só, no documento, e sai fora quando o foco está dentro de um
 * campo de texto: quem está digitando "j" na busca quer a letra, não a linha
 * seguinte. `/` é a única exceção que se ganha, e só de fora de um campo.
 */
function ehCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  if (alvo.isContentEditable) return true;
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(alvo.tagName);
}

/** O que a célula sabe além da própria linha. Um objeto, e não três argumentos
 *  posicionais: a terceira coluna que precisar de mais um dado não muda a
 *  assinatura das outras nove. */
interface Contexto {
  fuso: string;
  agora: Date;
  proprietarios: Proprietario[];
}

interface ColunaLead {
  chave: string;
  rotulo: string;
  /** Alinha à direita e usa monoespaçada tabular. Para número, não para texto. */
  numerica?: boolean;
  /** Largura de partida, em px. O usuário muda e a mudança fica guardada. */
  largura: number;
  celula: (l: LinhaLead, ctx: Contexto) => ReactNode;
}

/**
 * As colunas, numa lista só: o cabeçalho e a linha saem da mesma definição,
 * então não há como uma existir sem a outra.
 *
 * Categoria vira etiqueta neutra: origem, faixa, fila e fase são o mesmo tipo
 * de coisa (um nome que classifica) e têm a mesma forma, a do pacote. Nenhuma
 * delas recebe cor: categoria não é estado.
 *
 * Cor entra em duas células e em nenhuma outra: o lead parado há mais de sete
 * dias, que é o que custa dinheiro, e o lead desqualificado, que é o único
 * estado terminal.
 */
const COLUNAS: readonly ColunaLead[] = [
  {
    chave: 'lead',
    rotulo: 'Lead',
    largura: 230,
    celula: (l) => <Link href={`/leads/${l.id}`}>{l.nome}</Link>,
  },
  {
    chave: 'origem',
    rotulo: 'Origem',
    largura: 132,
    // Editável na própria lista. A etiqueta continua sendo a forma em repouso —
    // é o `record-table-cell` deles: o display é o do campo, só a edição é comum.
    celula: (l) => (
      <CelulaInline
        leadId={l.id}
        campo="origem"
        valor={l.origem}
        vazio="—"
        pintar={(t) => <Etiqueta>{t}</Etiqueta>}
      />
    ),
  },
  {
    chave: 'score',
    rotulo: 'Score',
    numerica: true,
    largura: 86,
    celula: (l) => (l.score === null ? '—' : numero(l.score)),
  },
  {
    chave: 'faixa',
    rotulo: 'Faixa',
    largura: 120,
    celula: (l) => (l.faixa ? <Etiqueta>{l.faixa}</Etiqueta> : '—'),
  },
  {
    chave: 'fila',
    rotulo: 'Fila',
    largura: 132,
    celula: (l) => (l.fila ? <Etiqueta>{l.fila}</Etiqueta> : '—'),
  },
  {
    chave: 'proprietario',
    rotulo: 'Proprietário',
    largura: 160,
    // A troca de dono na própria lista, que é o motivo mais comum de alguém
    // abrir a ficha. A ação em massa continua servindo para muitos de uma vez.
    celula: (l, ctx) => (
      <CelulaInline
        leadId={l.id}
        campo="proprietario"
        valor={l.proprietarioId}
        opcoes={ctx.proprietarios}
        vazio="—"
      />
    ),
  },
  {
    chave: 'fase',
    rotulo: 'Fase',
    largura: 136,
    celula: (l) =>
      l.status === 'desqualificado' ? (
        <Etiqueta tom="erro">{ROTULO_STATUS['desqualificado']}</Etiqueta>
      ) : l.fase ? (
        <Etiqueta>{l.fase}</Etiqueta>
      ) : (
        <Etiqueta>{ROTULO_STATUS[l.status] ?? l.status}</Etiqueta>
      ),
  },
  {
    chave: 'dias',
    rotulo: 'Dias na fase',
    numerica: true,
    largura: 118,
    celula: (l) =>
      l.diasNaFase === null ? (
        '—'
      ) : l.diasNaFase >= 7 && l.status !== 'desqualificado' ? (
        <Etiqueta tom="alerta">{numero(l.diasNaFase)}</Etiqueta>
      ) : (
        numero(l.diasNaFase)
      ),
  },
  {
    chave: 'atividade',
    rotulo: 'Última atividade',
    largura: 190,
    celula: (l, ctx) =>
      l.ultimaAtividade
        ? `${l.ultimaAtividadeTipo ?? 'atividade'} · ${desde(l.ultimaAtividade, ctx.fuso, ctx.agora)}`
        : '—',
  },
];

const PADROES = Object.fromEntries(COLUNAS.map((c) => [c.chave, c.largura]));
const ROTULOS = Object.fromEntries(COLUNAS.map((c) => [c.chave, c.rotulo]));

/**
 * A coluna que não se oculta nem se move. É o `labelIdentifier` do Twenty: a
 * que diz quem é a linha, e a única que leva à ficha.
 */
const COLUNA_FIXA = 'lead';

interface Props {
  grupos: Grupo[];
  fuso: string;
  agora: Date;
  aba: string;
  busca: string;
  por: Agrupamento;
  ordem: Ordem;
  direcao: Direcao;
  filtros: Filtros;
  proprietarios: Proprietario[];
  /** Quantas linhas vieram, para o rodapé da seleção falar em números reais. */
  total: number;
}

export function ListaDeLeads({
  grupos,
  fuso,
  agora,
  aba,
  busca,
  por,
  ordem,
  direcao,
  filtros,
  proprietarios,
  total,
}: Props) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  /** Onde começa o intervalo do Shift: a última linha marcada sem ele. */
  const [ancora, setAncora] = useState<number | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [emCurso, iniciar] = useTransition();
  const larguras = useLarguras('pipe.crm.leads.larguras', PADROES);
  /** A linha sob o cursor do teclado. `null` é "ninguém", que é o estado inicial. */
  const [focada, setFocada] = useState<number | null>(null);
  const tabela = useRef<HTMLTableElement | null>(null);
  const router = useRouter();

  // A coluna que o cabeçalho do grupo já está dizendo sai da tabela: repeti-la
  // em cada linha é gastar largura para dizer o que acabou de ser dito.
  const disponiveis = useMemo(() => {
    const redundante = colunaDoAgrupamento(por);
    return redundante ? COLUNAS.filter((c) => c.chave !== redundante) : COLUNAS;
  }, [por]);

  const contexto = useMemo<Contexto>(
    () => ({ fuso, agora, proprietarios }),
    [fuso, agora, proprietarios],
  );

  const arranjo = useColunas(
    'pipe.crm.leads.colunas',
    useMemo(() => disponiveis.map((c) => c.chave), [disponiveis]),
    COLUNA_FIXA,
  );

  // A fixa vem primeiro sempre, e o resto na ordem que a pessoa arrumou. O
  // `<colgroup>`, o cabeçalho e a linha saem daqui, então não há como um
  // desandar em relação ao outro.
  const colunas = useMemo(() => {
    const porChave = new Map(disponiveis.map((c) => [c.chave, c]));
    return [COLUNA_FIXA, ...arranjo.visiveis]
      .map((chave) => porChave.get(chave))
      .filter((c): c is ColunaLead => c !== undefined);
  }, [disponiveis, arranjo.visiveis]);

  const todos = useMemo(() => grupos.flatMap((g) => g.linhas), [grupos]);
  /** Posição de cada lead na lista achatada, para o intervalo do Shift saber
   *  contar através da fronteira dos grupos. */
  const posicao = useMemo(() => new Map(todos.map((l, i) => [l.id, i])), [todos]);
  const todosMarcados = todos.length > 0 && marcados.size === todos.length;

  /**
   * Um ouvinte só, no documento. Ele registra de novo a cada movimento porque
   * `Enter` precisa saber onde o cursor está agora — e trocar um `addEventListener`
   * por tecla apertada custa menos do que a `ref` que evitaria isso.
   */
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '/' && !ehCampoDeTexto(e.target)) {
        const busca = document.querySelector<HTMLInputElement>('input[type="search"][name="q"]');
        if (!busca) return;
        e.preventDefault();
        busca.focus();
        busca.select();
        return;
      }

      if (ehCampoDeTexto(e.target)) return;
      if (todos.length === 0) return;

      const desce = e.key === 'j' || e.key === 'ArrowDown';
      const sobe = e.key === 'k' || e.key === 'ArrowUp';

      if (desce || sobe) {
        e.preventDefault();
        setFocada((atual) => {
          // Sem cursor ainda: `j` começa na primeira, `k` na última. É o que
          // faz o primeiro toque fazer algo visível em vez de nada.
          if (atual === null) return desce ? 0 : todos.length - 1;
          const proximo = atual + (desce ? 1 : -1);
          // Sem dar a volta: a lista tem começo e fim, e passar do fim para o
          // começo sem avisar é como se perde o lugar numa lista de 200.
          return Math.min(Math.max(proximo, 0), todos.length - 1);
        });
        return;
      }

      if (e.key === 'Enter' && focada !== null) {
        const alvo = todos[focada];
        if (!alvo) return;
        e.preventDefault();
        router.push(`/leads/${alvo.id}`);
        return;
      }

      if (e.key === 'Escape') setFocada(null);
    }

    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [todos, focada, router]);

  // A linha focada entra na tela sozinha. `block: 'nearest'` rola o mínimo:
  // com `'center'` a lista dá um pulo a cada tecla e o olho perde o lugar.
  useEffect(() => {
    if (focada === null) return;
    const alvo = todos[focada];
    if (!alvo) return;
    tabela.current
      ?.querySelector(`tr[data-lead="${alvo.id}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [focada, todos]);

  // Trocar de recorte, de busca ou de ordenação refaz a lista: um cursor
  // apontando para a posição 12 da lista antiga não aponta para nada.
  useEffect(() => setFocada(null), [todos]);

  /**
   * Marcar de um a outro com Shift, como em qualquer lista de arquivos.
   *
   * `ancora` é a última linha marcada sem Shift. Marcar quinze leads em
   * sequência com quinze cliques é o tipo de trabalho que faz alguém desistir
   * da ação em massa e fazer um por um na ficha.
   */
  function alternar(id: string, indice: number, comShift: boolean) {
    setRecado(null);
    setMarcados((atual) => {
      const proximo = new Set(atual);
      if (comShift && ancora !== null) {
        const de = Math.min(ancora, indice);
        const ate = Math.max(ancora, indice);
        // O intervalo inteiro recebe o estado OPOSTO ao da linha clicada, que é
        // o que o Explorer e o Finder fazem: o clique manda, o resto acompanha.
        const ligar = !proximo.has(id);
        for (const l of todos.slice(de, ate + 1)) {
          if (ligar) proximo.add(l.id);
          else proximo.delete(l.id);
        }
        return proximo;
      }
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
    if (!comShift) setAncora(indice);
  }

  function alternarTodos() {
    setRecado(null);
    setMarcados(todosMarcados ? new Set() : new Set(todos.map((l) => l.id)));
  }

  /** Endereço desta mesma lista com um parâmetro trocado. `comFiltros` só muda
   *  quando a saída é justamente largar o filtro. */
  function endereco(extra: Record<string, string | null>, comFiltros: Filtros = filtros) {
    const p = new URLSearchParams({ aba });
    if (busca) p.set('q', busca);
    if (por !== 'nenhum') p.set('agrupar', por);
    if (ordem !== 'nenhuma') {
      p.set('ordem', ordem);
      p.set('dir', direcao);
    }
    // O filtro acompanha: 'Limpar a busca' que apagasse o filtro junto mandaria
    // a pessoa procurar o lead sumido no lugar errado.
    escreverFiltros(p, comFiltros);
    for (const [chave, valor] of Object.entries(extra)) {
      if (valor === null) p.delete(chave);
      else p.set(chave, valor);
    }
    return `/leads?${p.toString()}`;
  }

  /**
   * Clicar no cabeçalho: a coluna que ainda não ordena entra no seu sentido
   * natural, a que já ordena inverte, e a que já inverteu volta ao padrão da
   * tela. Três cliques fecham o ciclo, e o terceiro é a única forma de desfazer
   * sem mexer na barra de endereço.
   */
  function ordenacao(chave: string) {
    if (ordem !== chave) return endereco({ ordem: chave, dir: direcaoInicial(chave) });
    if (direcao === direcaoInicial(chave)) {
      return endereco({ ordem: chave, dir: direcao === 'asc' ? 'desc' : 'asc' });
    }
    return endereco({ ordem: null, dir: null });
  }

  function executar(acao: () => Promise<{ mudadas: number; pedidas: number }>, feito: string) {
    iniciar(async () => {
      const { mudadas, pedidas } = await acao();
      setMarcados(new Set());
      setRecado(
        mudadas === pedidas
          ? `${numero(mudadas)} ${feito}.`
          : `${numero(mudadas)} de ${numero(pedidas)} ${feito}. O resto o banco recusou: ou já foi excluído, ou já estava convertido.`,
      );
    });
  }

  // O vazio tem QUATRO causas e quatro saídas, que o Twenty separa e nós não
  // separávamos: a busca que não achou, o filtro que não casou, o recorte que
  // não tem ninguém, e a base realmente vazia. Um texto só para os quatro manda
  // a pessoa procurar o problema no lugar errado — e o filtro é o caso mais
  // traiçoeiro, porque ele fica ativo entre visitas dentro da mesma visão.
  if (total === 0) {
    const filtrado = Object.keys(filtros).length > 0;
    if (filtrado && !busca) {
      return (
        <EstadoVazio titulo="Nenhum lead para este filtro." ilustracao="busca">
          <span>
            O filtro está ativo e nenhum lead casa com ele. A base não está vazia — o recorte
            está.
          </span>
          <span className="acoes-erro">
            <Link className="btn" href={endereco({}, {})}>
              Limpar o filtro
            </Link>
          </span>
        </EstadoVazio>
      );
    }
    if (busca) {
      return (
        <EstadoVazio titulo="Nenhum lead para esta busca." ilustracao="busca">
          <span>Nada casou com “{busca}” em nome, CPF, telefone ou e-mail.</span>
          <span className="acoes-erro">
            <Link className="btn" href={endereco({ q: null })}>
              Limpar a busca
            </Link>
          </span>
        </EstadoVazio>
      );
    }
    if (aba !== 'todos') {
      return (
        <EstadoVazio titulo="Nenhum lead neste recorte." ilustracao="concluido">
          <span>
            Este é um recorte vazio, não uma base vazia. Nenhum lead se encaixa nele agora.
          </span>
          <span className="acoes-erro">
            <Link className="btn" href={endereco({ aba: 'todos' })}>
              Ver todos os leads
            </Link>
          </span>
        </EstadoVazio>
      );
    }
    return (
      <EstadoVazio titulo="Nenhum lead ainda." ilustracao="vazio">
        <span>
          Lead entra por formulário, por importação ou pela API. Assim que o primeiro entrar, ele
          aparece aqui já pontuado.
        </span>
      </EstadoVazio>
    );
  }

  return (
    <>
      {recado ? (
        <p className="recado" role="status">
          {recado}
        </p>
      ) : null}

      {/* Encostado à direita, logo acima da tabela que ele governa. O Twenty
          põe o mesmo controle no fim da barra de visão, pela mesma razão: é
          ajuste, não filtro, e ajuste não disputa espaço com a busca. */}
      <div className="barra-lista">
        <ControleDeColunas
          rotulos={ROTULOS}
          fixa={COLUNA_FIXA}
          visiveis={arranjo.visiveis}
          ocultas={arranjo.ocultas}
          aoOcultar={arranjo.ocultar}
          aoMostrar={arranjo.mostrar}
          aoMover={arranjo.mover}
          aoRestaurar={arranjo.restaurar}
        />
      </div>

      <div className="scroll">
        <table className="listagem" ref={tabela}>
          <colgroup>
            <col style={{ width: '32px' }} />
            {colunas.map((c) => (
              <col key={c.chave} style={{ width: `${larguras.largura(c.chave)}px` }} />
            ))}
            {/* Coluna de sobra. Sem ela o navegador estica as outras para
                preencher a tela larga, e a largura arrastada deixa de valer. */}
            <col />
          </colgroup>

          <thead>
            <tr>
              <th className="sel">
                <input
                  type="checkbox"
                  checked={todosMarcados}
                  ref={(el) => {
                    if (el) el.indeterminate = marcados.size > 0 && !todosMarcados;
                  }}
                  onChange={alternarTodos}
                  aria-label="Selecionar todos os leads da lista"
                />
              </th>
              {colunas.map((c) => {
                const ativa = ordem === c.chave;
                return (
                  <th
                    key={c.chave}
                    aria-sort={ativa ? (direcao === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={larguras.colunaEmArraste === c.chave ? 'arrastando' : undefined}
                  >
                    {colunaOrdenavel(c.chave) ? (
                      <Link href={ordenacao(c.chave)} className="ord" scroll={false}>
                        {c.rotulo}
                        <span className="seta" aria-hidden="true">
                          {ativa ? (direcao === 'asc' ? '↑' : '↓') : ''}
                        </span>
                      </Link>
                    ) : (
                      c.rotulo
                    )}
                    <span
                      className="redim"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Largura da coluna ${c.rotulo}`}
                      tabIndex={0}
                      onPointerDown={larguras.aoPegar(c.chave)}
                      onPointerMove={larguras.aoMover}
                      onPointerUp={larguras.aoSoltar}
                      onPointerCancel={larguras.aoSoltar}
                      onKeyDown={larguras.aoTeclar(c.chave)}
                      onDoubleClick={larguras.aoRestaurar(c.chave)}
                    />
                  </th>
                );
              })}
              <th />
            </tr>
          </thead>

          {grupos.map((grupo) => (
            <tbody key={grupo.titulo || 'todos'}>
              {grupo.titulo ? (
                <tr className="grupo">
                  <th colSpan={colunas.length + 2} scope="colgroup">
                    {grupo.titulo} <span className="qt">{numero(grupo.linhas.length)}</span>
                  </th>
                </tr>
              ) : null}
              {grupo.linhas.map((l) => (
                <tr
                  key={l.id}
                  data-lead={l.id}
                  className={
                    [
                      marcados.has(l.id) ? 'marcada' : '',
                      focada !== null && todos[focada]?.id === l.id ? 'focada' : '',
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                >
                  <td className="sel">
                    {/*
                      A marcação vem do `click`, não do `change`: só o clique
                      carrega o `shiftKey`, e é ele que dá o intervalo. A barra
                      de espaço no teclado também dispara `click`, com Shift
                      falso, então o caminho do teclado continua inteiro.
                    */}
                    <input
                      type="checkbox"
                      checked={marcados.has(l.id)}
                      onChange={() => {}}
                      onClick={(e) => alternar(l.id, posicao.get(l.id) ?? 0, e.shiftKey)}
                      aria-label={`Selecionar ${l.nome}`}
                    />
                  </td>
                  {colunas.map((c) => (
                    <td
                      key={c.chave}
                      className={c.numerica ? 'num' : c.chave === 'lead' ? 'who' : undefined}
                    >
                      {c.celula(l, contexto)}
                    </td>
                  ))}
                  <td />
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {marcados.size > 0 ? (
        <BarraEmMassa
          quantos={marcados.size}
          proprietarios={proprietarios}
          emCurso={emCurso}
          aoLimpar={() => setMarcados(new Set())}
          aoAtribuir={(id) =>
            executar(() => atribuirEmMassa([...marcados], id), 'leads passaram de proprietário')
          }
          aoDesqualificar={() =>
            executar(() => desqualificarEmMassa([...marcados]), 'leads foram desqualificados')
          }
        />
      ) : null}
    </>
  );
}

/**
 * A barra de ação em massa. Existe só quando há seleção, e some quando a
 * seleção some: é a regra de "item que não funciona não aparece" aplicada a uma
 * barra inteira em vez de a um botão.
 *
 * Fica presa embaixo e centrada, longe da tabela que a pessoa está lendo e
 * perto do polegar de quem usa laptop. Desqualificar pede confirmação porque
 * escreve num campo de estado terminal e não tem desfazer.
 */
function BarraEmMassa({
  quantos,
  proprietarios,
  emCurso,
  aoLimpar,
  aoAtribuir,
  aoDesqualificar,
}: {
  quantos: number;
  proprietarios: Proprietario[];
  emCurso: boolean;
  aoLimpar: () => void;
  aoAtribuir: (proprietarioId: string) => void;
  aoDesqualificar: () => void;
}) {
  const [dono, setDono] = useState('');

  return (
    <div className="em-massa" role="region" aria-label="Ações para os leads selecionados">
      <b>
        {numero(quantos)} {quantos === 1 ? 'lead selecionado' : 'leads selecionados'}
      </b>

      {proprietarios.length > 0 ? (
        <>
          <select
            className="seletor"
            value={dono}
            aria-label="Novo proprietário"
            onChange={(e) => setDono(e.target.value)}
          >
            <option value="">Passar para</option>
            {proprietarios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          {/* O botão só existe depois que alguém foi escolhido. Botão apagado
              esperando um seletor é a forma mais comum de item morto. */}
          {dono ? (
            <button
              type="button"
              className="btn primario"
              onClick={() => {
                aoAtribuir(dono);
                setDono('');
              }}
            >
              {emCurso ? 'Passando…' : 'Passar'}
            </button>
          ) : null}
        </>
      ) : null}

      <button
        type="button"
        className="btn perigo"
        onClick={() => {
          const texto =
            quantos === 1
              ? 'Desqualificar este lead?'
              : `Desqualificar estes ${quantos} leads?`;
          if (window.confirm(`${texto} Não há como desfazer pela tela.`)) aoDesqualificar();
        }}
      >
        {emCurso ? 'Desqualificando…' : 'Desqualificar'}
      </button>

      <button type="button" className="btn" onClick={aoLimpar}>
        Limpar
      </button>
    </div>
  );
}
