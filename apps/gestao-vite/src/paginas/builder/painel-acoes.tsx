import { useLayoutEffect, useRef, useState } from 'react';
import { Campo, Etiqueta, Icone } from '@pipe/ui';
import { IconeGestao } from '../../componentes/icones-gestao';
import { IconePortal } from '../../componentes/icones-portal';
import { CabecalhoInfo } from './cabecalho-info';
import type { AcaoDoEditor, Bloco } from './modelo';
import { ehAtendimento } from './modelo';
import {
  CATALOGO_DE_ACOES,
  ROTULOS_DAS_ACOES,
  acaoDoSistema,
  acaoSemSuporte,
  adicionarAcao,
  cabecalhosDoCampo,
  comCabecalhos,
  comCampo,
  comCampoJson,
  colarAcoes,
  comCondicoes,
  comTitulo,
  errosDaAcao,
  moverAcao,
  novaAcao,
  removerAcao,
  rotuloDaAcao,
  substituirAcao,
  tipoDeAcao,
  valorDoCampo,
} from './acoes-do-bloco';
import type { ListaDeAcoes } from './acoes-do-bloco';
import { EditorDeCondicoes } from './condicao';

let acoesCopiadas: AcaoDoEditor[] = [];

/**
 * A aba "Ações" do editor: as duas listas — "Ações de Entrada" ("Inclua ações
 * que serão executadas antes do envio do primeiro conteúdo") e "Ações de
 * Saída" ("…após o envio do último conteúdo ou resposta do usuário") — cada
 * uma com o botão "Adicionar ação de entrada/saída" que abre o menu
 * "ADICIONAR FERRAMENTAS" agrupado (Executar, Manipular), e cada ação como um
 * cartão que se expande para editar: "Nome da ação", os campos do tipo e a
 * "Condição para executar a ação".
 *
 * No bloco de atendimento a aba só mostra o aviso do editor: "o bot não deve
 * interferir nas ações de entrada e saída".
 */

export function PainelDeAcoes({
  bloco,
  onMudar,
  onAviso,
}: {
  bloco: Bloco;
  onMudar: (bloco: Bloco) => void;
  onAviso: (texto: string) => void;
}) {
  const [copiadas, setCopiadas] = useState(acoesCopiadas);
  function copiar(acoes: AcaoDoEditor[]): void {
    acoesCopiadas = structuredClone(acoes);
    setCopiadas(acoesCopiadas);
  }
  if (ehAtendimento(bloco.id)) {
    return (
      <div className="bl-aba-corpo">
        <p className="sub">{ROTULOS_DAS_ACOES.atendimento}</p>
      </div>
    );
  }
  return (
    <div className="bl-aba-corpo">
      {bloco.root ? (
        <section className="bl-secao">
          <CabecalhoInfo titulo={ROTULOS_DAS_ACOES.entrada} aberto>
            <p>
              Este bloco é usado para marcar pontos especiais do fluxo a serem tratados pela
              plataforma, portanto{' '}
              <strong>não é possível criar ações de entrada específicas.</strong>
            </p>
            <a
              href="https://help.blip.ai/hc/en-us/articles/360057492594-Como-criar-blocos-no-Builder"
              target="_blank"
              rel="noreferrer"
            >
              Entenda como os blocos funcionam
            </a>
          </CabecalhoInfo>
        </section>
      ) : (
        <ListaDeAcoesDoBloco
          bloco={bloco}
          lista="$enteringCustomActions"
          titulo={ROTULOS_DAS_ACOES.entrada}
          descricao={ROTULOS_DAS_ACOES.entradaDescricao}
          rotuloAdicionar={ROTULOS_DAS_ACOES.adicionarEntrada}
          onMudar={onMudar}
          onAviso={onAviso}
          copiadas={copiadas}
          onCopiar={copiar}
        />
      )}
      <ListaDeAcoesDoBloco
        bloco={bloco}
        lista="$leavingCustomActions"
        titulo={ROTULOS_DAS_ACOES.saida}
        descricao={ROTULOS_DAS_ACOES.saidaDescricao}
        rotuloAdicionar={ROTULOS_DAS_ACOES.adicionarSaida}
        onMudar={onMudar}
        onAviso={onAviso}
        copiadas={copiadas}
        onCopiar={copiar}
      />
    </div>
  );
}

function ListaDeAcoesDoBloco({
  bloco,
  lista,
  titulo,
  descricao,
  rotuloAdicionar,
  onMudar,
  onAviso,
  copiadas,
  onCopiar,
}: {
  bloco: Bloco;
  lista: ListaDeAcoes;
  titulo: string;
  descricao: string;
  rotuloAdicionar: string;
  onMudar: (bloco: Bloco) => void;
  onAviso: (texto: string) => void;
  copiadas: AcaoDoEditor[];
  onCopiar: (acoes: AcaoDoEditor[]) => void;
}) {
  const acoes = bloco[lista] ?? [];
  const [menuAberto, setMenuAberto] = useState(false);
  const [posicaoMenu, setPosicaoMenu] = useState({ top: 16, right: 484 });
  const [aberta, setAberta] = useState<number | null>(null);
  const [selecionadas, setSelecionadas] = useState<number[]>([]);
  const arrastada = useRef<number | null>(null);

  function colar(): void {
    const resultado = colarAcoes(bloco, lista, copiadas);
    if (resultado.ok) onMudar(resultado.bloco);
    else onAviso(resultado.erro);
  }

  function adicionar(tipo: string): void {
    const r = adicionarAcao(bloco, lista, novaAcao(tipo));
    setMenuAberto(false);
    if (!r.ok) {
      onAviso(r.erro);
      return;
    }
    onMudar(r.bloco);
    setAberta(acoes.length);
  }

  const grupos = ['Executar', 'Manipular'] as const;

  return (
    <section className="bl-secao bl-lista-de-acoes">
      <CabecalhoInfo titulo={titulo} contador={`${acoes.length}/15`} aberto={acoes.length === 0}>
        <p>{descricao}</p>
      </CabecalhoInfo>
      <div className="bl-acoes-selecao">
        <label>
          <input
            type="checkbox"
            disabled={!acoes.length}
            checked={acoes.length > 0 && selecionadas.length === acoes.length}
            onChange={(e) => setSelecionadas(e.target.checked ? acoes.map((_, i) => i) : [])}
          />
          Selecionar todos
        </label>
        <button
          type="button"
          className="bl-botao-contorno"
          disabled={!selecionadas.length && !copiadas.length}
          onClick={() =>
            selecionadas.length
              ? onCopiar(acoes.filter((_, i) => selecionadas.includes(i)))
              : colar()
          }
        >
          {selecionadas.length ? 'Copiar ações' : 'Colar ação'}
        </button>
      </div>

      {acoes.map((acao, i) => (
        <CartaoDeAcao
          key={acao.$id ?? i}
          acao={acao}
          onArrastar={() => {
            arrastada.current = i;
          }}
          onSoltar={() => {
            if (arrastada.current !== null) {
              onMudar(moverAcao(bloco, lista, arrastada.current, i));
              setSelecionadas([]);
              setAberta(null);
            }
            arrastada.current = null;
          }}
          onTerminarArrasto={() => {
            arrastada.current = null;
          }}
          selecionada={selecionadas.includes(i)}
          onSelecionar={() =>
            setSelecionadas(
              selecionadas.includes(i) ? selecionadas.filter((s) => s !== i) : [...selecionadas, i],
            )
          }
          onCopiar={() => onCopiar([acao])}
          aberta={aberta === i}
          primeira={i === 0}
          ultima={i === acoes.length - 1}
          onAbrir={() => setAberta(aberta === i ? null : i)}
          onMudar={(nova) => onMudar(substituirAcao(bloco, lista, i, nova))}
          onSubir={() => onMudar(moverAcao(bloco, lista, i, i - 1))}
          onDescer={() => onMudar(moverAcao(bloco, lista, i, i + 1))}
          onRemover={() => {
            setAberta(null);
            setSelecionadas([]);
            onMudar(removerAcao(bloco, lista, i));
          }}
        />
      ))}

      <div className="bl-adicionar-acao">
        <button
          type="button"
          className="bl-mais"
          onClick={(e) => {
            const rect = e.currentTarget.closest('aside')!.getBoundingClientRect();
            setPosicaoMenu({ top: rect.top, right: window.innerWidth - rect.left + 8 });
            setMenuAberto((v) => !v);
          }}
        >
          {rotuloAdicionar}
        </button>
        {menuAberto ? (
          <div className="bl-menu-acoes bl-ferramentas" role="menu" style={posicaoMenu}>
            <header>
              <b>{rotuloAdicionar.toUpperCase()}</b>
              <button
                type="button"
                className="iconbtn"
                aria-label="Fechar"
                onClick={() => setMenuAberto(false)}
              >
                <Icone nome="x" tamanho={16} />
              </button>
            </header>
            {grupos.map((grupo) => (
              <div key={grupo} className="bl-menu-acoes-grupo">
                <span className="sub">{grupo}</span>
                {CATALOGO_DE_ACOES.filter((t) => t.grupo === grupo).map((t) => (
                  <button
                    key={t.tipo}
                    type="button"
                    role="menuitem"
                    onClick={() => adicionar(t.tipo)}
                  >
                    {t.rotulo}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Exportado: o painel de Ações Globais (`painel-configuracao.tsx`) reaproveita o mesmo cartão. */
export function CartaoDeAcao({
  acao,
  aberta,
  primeira,
  ultima,
  onAbrir,
  onMudar,
  onSubir,
  onDescer,
  onRemover,
  onCopiar,
  selecionada,
  onSelecionar,
  onArrastar,
  onSoltar,
  onTerminarArrasto,
}: {
  acao: AcaoDoEditor;
  aberta: boolean;
  primeira: boolean;
  ultima: boolean;
  onAbrir: () => void;
  onMudar: (acao: AcaoDoEditor) => void;
  onSubir: () => void;
  onDescer: () => void;
  onRemover: () => void;
  onCopiar?: () => void;
  selecionada?: boolean;
  onSelecionar?: () => void;
  onArrastar?: () => void;
  onSoltar?: () => void;
  onTerminarArrasto?: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const detalhe = useRef<HTMLDivElement>(null);
  const flutuante = !!onCopiar;
  useLayoutEffect(() => {
    if (aberta && flutuante) detalhe.current?.closest('.bl-painel-corpo')?.scrollTo(0, 0);
  }, [aberta, flutuante]);
  const tipo = tipoDeAcao(acao.type);
  const semSuporte = acaoSemSuporte(acao);
  const doSistema = acaoDoSistema(acao);
  const erros = errosDaAcao(acao);
  const editavel = !!tipo && !doSistema;
  return (
    <article
      className={`bl-acao${erros.length > 0 ? ' bl-acao--erro' : ''}${aberta ? ' bl-acao--aberta' : ''}`}
      onDragOver={onSoltar ? (e) => e.preventDefault() : undefined}
      onDrop={
        onSoltar
          ? (e) => {
              e.preventDefault();
              onSoltar();
            }
          : undefined
      }
    >
      <header className="bl-acao-cabecalho">
        {onArrastar ? (
          <button
            type="button"
            className="bl-acao-arrastar"
            draggable
            aria-label="Reordenar ação. Use as setas para cima ou para baixo."
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', acao.$id ?? 'acao');
              onArrastar();
            }}
            onDragEnd={onTerminarArrasto}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                if (e.key === 'ArrowUp' && !primeira) onSubir();
                if (e.key === 'ArrowDown' && !ultima) onDescer();
              }
            }}
          >
            <svg width="16" height="24" viewBox="0 0 16 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="7" r="1.5" />
              <circle cx="11" cy="7" r="1.5" />
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="11" cy="12" r="1.5" />
              <circle cx="5" cy="17" r="1.5" />
              <circle cx="11" cy="17" r="1.5" />
            </svg>
          </button>
        ) : null}
        {onSelecionar ? (
          <input
            type="checkbox"
            aria-label={`Selecionar ${acao.$title || rotuloDaAcao(acao.type)}`}
            checked={selecionada}
            onChange={onSelecionar}
          />
        ) : null}
        <button type="button" className="bl-acao-abrir" onClick={onAbrir} aria-expanded={aberta}>
          <span className="bl-acao-tipo">{acao.$title || rotuloDaAcao(acao.type)}</span>
        </button>
        {semSuporte ? <Etiqueta tom="alerta">{ROTULOS_DAS_ACOES.naoExecutada}</Etiqueta> : null}
        {doSistema ? <Etiqueta>{ROTULOS_DAS_ACOES.doSistema}</Etiqueta> : null}
        {erros.length > 0 ? (
          <Etiqueta tom="erro" redonda>
            {erros.length}
          </Etiqueta>
        ) : null}
        <span className="bl-saida-ordem">
          <button
            type="button"
            className="iconbtn"
            title="Subir"
            aria-label="Subir"
            disabled={primeira}
            onClick={onSubir}
          >
            <Icone nome="cima" tamanho={16} />
          </button>
          <button
            type="button"
            className="iconbtn"
            title="Descer"
            aria-label="Descer"
            disabled={ultima}
            onClick={onDescer}
          >
            <Icone nome="baixo" tamanho={16} />
          </button>
          {!doSistema ? (
            <button
              type="button"
              className="iconbtn"
              title={ROTULOS_DAS_ACOES.excluir}
              aria-label={ROTULOS_DAS_ACOES.excluir}
              onClick={onRemover}
            >
              <IconeGestao nome="lixeira" tamanho={18} />
            </button>
          ) : null}
        </span>
        {onCopiar ? (
          <div className="bl-acao-menu">
            <button
              type="button"
              className="iconbtn"
              aria-label="Opções da ação"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="12" cy="5" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="12" cy="19" r="1.5" />
              </svg>
            </button>
            {menu ? (
              <div className="bl-menu-acoes">
                <button
                  type="button"
                  onClick={() => {
                    setMenu(false);
                    onAbrir();
                  }}
                >
                  Detalhes da ação
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(false);
                    onCopiar();
                  }}
                >
                  Copiar ação
                </button>
                <button type="button" onClick={onRemover}>
                  Excluir ação
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      {aberta ? (
        <div ref={detalhe} className={`bl-acao-corpo${onCopiar ? ' bl-detalhe' : ''}`}>
          {onCopiar ? (
            <header className="bl-detalhe-cabecalho">
              <button
                type="button"
                className="iconbtn"
                aria-label="Voltar para ações"
                onClick={onAbrir}
              >
                <IconePortal nome="voltar" tamanho={24} />
              </button>
              <input
                aria-label={ROTULOS_DAS_ACOES.nome}
                value={acao.$title || ''}
                placeholder={tipo?.titulo ?? acao.type}
                onChange={(e) => onMudar(comTitulo(acao, e.target.value))}
              />
              <button
                type="button"
                className="iconbtn"
                aria-label="Editar nome da ação"
                onClick={(e) => e.currentTarget.parentElement?.querySelector('input')?.focus()}
              >
                <IconePortal nome="editar" tamanho={24} />
              </button>
            </header>
          ) : null}
          {tipo?.info ? <p className="sub">{tipo.info}</p> : null}
          {editavel ? (
            <>
              {!onCopiar ? (
                <label className="bl-campo">
                  <span className="sub">{ROTULOS_DAS_ACOES.nome}</span>
                  <Campo
                    value={acao.$title ?? ''}
                    onChange={(e) => onMudar(comTitulo(acao, e.target.value))}
                  />
                </label>
              ) : null}
              {tipo!.campos.map((campo) => (
                <label
                  key={campo.chave}
                  className={`bl-campo${onCopiar ? ' bl-campo--interno' : ''}`}
                >
                  <span className="sub">
                    {campo.rotulo}
                    {campo.obrigatorio ? ' *' : ''}
                  </span>
                  {campo.tipo === 'cabecalhos' ? (
                    <EditorDeCabecalhos
                      cabecalhos={cabecalhosDoCampo(acao, campo.chave)}
                      onMudar={(cabecalhos) => onMudar(comCabecalhos(acao, campo.chave, cabecalhos))}
                    />
                  ) : campo.opcoes ? (
                    <select
                      className="campo"
                      value={valorDoCampo(acao, campo.chave)}
                      onChange={(e) => onMudar(comCampo(acao, campo.chave, e.target.value))}
                    >
                      {campo.opcoes.map((opcao) => (
                        <option key={opcao} value={opcao}>
                          {opcao}
                        </option>
                      ))}
                    </select>
                  ) : campo.tipo === 'longo' || campo.tipo === 'json' ? (
                    <textarea
                      className="campo bl-campo-longo"
                      rows={3}
                      value={valorDoCampo(acao, campo.chave)}
                      onChange={(e) =>
                        onMudar(
                          campo.tipo === 'json'
                            ? comCampoJson(acao, campo.chave, e.target.value)
                            : comCampo(acao, campo.chave, e.target.value),
                        )
                      }
                    />
                  ) : (
                    <Campo
                      value={valorDoCampo(acao, campo.chave)}
                      onChange={(e) => onMudar(comCampo(acao, campo.chave, e.target.value))}
                    />
                  )}
                  {campo.ajuda ? <span className="bl-ajuda">{campo.ajuda}</span> : null}
                </label>
              ))}
              <h5 className="bl-secao-subtitulo">{ROTULOS_DAS_ACOES.condicao}</h5>
              <EditorDeCondicoes
                condicoes={acao.conditions ?? []}
                onMudar={(condicoes) => onMudar(comCondicoes(acao, condicoes))}
                rotuloAdicionar={ROTULOS_DAS_ACOES.adicionarCondicao}
              />
            </>
          ) : (
            <pre className="bl-acao-bruta">{JSON.stringify(acao.settings ?? {}, null, 2)}</pre>
          )}
          {erros.length > 0 ? (
            <ul className="bl-erros">
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function EditorDeCabecalhos({
  cabecalhos,
  onMudar,
}: {
  cabecalhos: { chave: string; valor: string }[];
  onMudar: (cabecalhos: { chave: string; valor: string }[]) => void;
}) {
  return (
    <div className="bl-cabecalhos">
      {cabecalhos.map((cabecalho, indice) => (
        <div className="bl-cabecalho-fileira" key={`${cabecalho.chave}-${indice}`}>
          <Campo
            value={cabecalho.chave}
            placeholder="Chave"
            aria-label={`Chave do cabeçalho ${indice + 1}`}
            onChange={(e) =>
              onMudar(cabecalhos.map((c, i) => (i === indice ? { ...c, chave: e.target.value } : c)))
            }
          />
          <Campo
            value={cabecalho.valor}
            placeholder="Valor"
            aria-label={`Valor do cabeçalho ${indice + 1}`}
            onChange={(e) =>
              onMudar(cabecalhos.map((c, i) => (i === indice ? { ...c, valor: e.target.value } : c)))
            }
          />
          <button
            type="button"
            className="iconbtn"
            aria-label="Remover cabeçalho"
            onClick={() => onMudar(cabecalhos.filter((_, i) => i !== indice))}
          >
            <IconeGestao nome="lixeira" tamanho={18} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="bl-adicionar-cabecalho"
        onClick={() => onMudar([...cabecalhos, { chave: '', valor: '' }])}
      >
        + Adicionar cabeçalho
      </button>
    </div>
  );
}
