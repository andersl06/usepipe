import { useState } from 'react';
import { Campo, Etiqueta, Icone } from '@pipe/ui';
import { IconeGestao } from '../../componentes/icones-gestao';
import type { AcaoDoEditor, Bloco } from './modelo';
import { ehAtendimento } from './modelo';
import {
  CATALOGO_DE_ACOES,
  ROTULOS_DAS_ACOES,
  acaoDoSistema,
  acaoSemSuporte,
  adicionarAcao,
  comCampo,
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
  if (ehAtendimento(bloco.id)) {
    return (
      <div className="bl-aba-corpo">
        <p className="sub">{ROTULOS_DAS_ACOES.atendimento}</p>
      </div>
    );
  }
  return (
    <div className="bl-aba-corpo">
      <ListaDeAcoesDoBloco
        bloco={bloco}
        lista="$enteringCustomActions"
        titulo={ROTULOS_DAS_ACOES.entrada}
        descricao={ROTULOS_DAS_ACOES.entradaDescricao}
        rotuloAdicionar={ROTULOS_DAS_ACOES.adicionarEntrada}
        onMudar={onMudar}
        onAviso={onAviso}
      />
      <ListaDeAcoesDoBloco
        bloco={bloco}
        lista="$leavingCustomActions"
        titulo={ROTULOS_DAS_ACOES.saida}
        descricao={ROTULOS_DAS_ACOES.saidaDescricao}
        rotuloAdicionar={ROTULOS_DAS_ACOES.adicionarSaida}
        onMudar={onMudar}
        onAviso={onAviso}
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
}: {
  bloco: Bloco;
  lista: ListaDeAcoes;
  titulo: string;
  descricao: string;
  rotuloAdicionar: string;
  onMudar: (bloco: Bloco) => void;
  onAviso: (texto: string) => void;
}) {
  const acoes = bloco[lista] ?? [];
  const [menuAberto, setMenuAberto] = useState(false);
  const [aberta, setAberta] = useState<number | null>(null);

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
    <section className="bl-secao">
      <h4 className="bl-secao-titulo">{titulo}</h4>
      <p className="sub">{descricao}</p>

      {acoes.map((acao, i) => (
        <CartaoDeAcao
          key={acao.$id ?? i}
          acao={acao}
          aberta={aberta === i}
          primeira={i === 0}
          ultima={i === acoes.length - 1}
          onAbrir={() => setAberta(aberta === i ? null : i)}
          onMudar={(nova) => onMudar(substituirAcao(bloco, lista, i, nova))}
          onSubir={() => onMudar(moverAcao(bloco, lista, i, i - 1))}
          onDescer={() => onMudar(moverAcao(bloco, lista, i, i + 1))}
          onRemover={() => {
            setAberta(null);
            onMudar(removerAcao(bloco, lista, i));
          }}
        />
      ))}

      <div className="bl-adicionar-acao">
        <button type="button" className="bl-mais" onClick={() => setMenuAberto((v) => !v)}>
          {rotuloAdicionar}
        </button>
        {menuAberto ? (
          <div className="bl-menu-acoes" role="menu">
            <header>
              <b>{ROTULOS_DAS_ACOES.menu}</b>
              <button type="button" className="iconbtn" aria-label="Fechar" onClick={() => setMenuAberto(false)}>
                <Icone nome="x" tamanho={16} />
              </button>
            </header>
            {grupos.map((grupo) => (
              <div key={grupo} className="bl-menu-acoes-grupo">
                <span className="sub">{grupo}</span>
                {CATALOGO_DE_ACOES.filter((t) => t.grupo === grupo).map((t) => (
                  <button key={t.tipo} type="button" role="menuitem" onClick={() => adicionar(t.tipo)}>
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

function CartaoDeAcao({
  acao,
  aberta,
  primeira,
  ultima,
  onAbrir,
  onMudar,
  onSubir,
  onDescer,
  onRemover,
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
}) {
  const tipo = tipoDeAcao(acao.type);
  const semSuporte = acaoSemSuporte(acao);
  const doSistema = acaoDoSistema(acao);
  const erros = errosDaAcao(acao);
  const editavel = !!tipo && !doSistema;
  return (
    <article className={`bl-acao${erros.length > 0 ? ' bl-acao--erro' : ''}`}>
      <header className="bl-acao-cabecalho">
        <button type="button" className="bl-acao-abrir" onClick={onAbrir} aria-expanded={aberta}>
          <span className="bl-acao-tipo">{rotuloDaAcao(acao.type)}</span>
          {acao.$title ? <span className="sub">{acao.$title}</span> : null}
        </button>
        {semSuporte ? <Etiqueta tom="alerta">{ROTULOS_DAS_ACOES.naoExecutada}</Etiqueta> : null}
        {doSistema ? <Etiqueta>{ROTULOS_DAS_ACOES.doSistema}</Etiqueta> : null}
        {erros.length > 0 ? (
          <Etiqueta tom="erro" redonda>
            {erros.length}
          </Etiqueta>
        ) : null}
        <span className="bl-saida-ordem">
          <button type="button" className="iconbtn" title="Subir" aria-label="Subir" disabled={primeira} onClick={onSubir}>
            <Icone nome="cima" tamanho={16} />
          </button>
          <button type="button" className="iconbtn" title="Descer" aria-label="Descer" disabled={ultima} onClick={onDescer}>
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
      </header>

      {aberta ? (
        <div className="bl-acao-corpo">
          {tipo?.info ? <p className="sub">{tipo.info}</p> : null}
          {editavel ? (
            <>
              <label className="bl-campo">
                <span className="sub">{ROTULOS_DAS_ACOES.nome}</span>
                <Campo value={acao.$title ?? ''} onChange={(e) => onMudar(comTitulo(acao, e.target.value))} />
              </label>
              {tipo!.campos.map((campo) => (
                <label key={campo.chave} className="bl-campo">
                  <span className="sub">
                    {campo.rotulo}
                    {campo.obrigatorio ? ' *' : ''}
                  </span>
                  {campo.tipo === 'longo' ? (
                    <textarea
                      className="campo bl-campo-longo"
                      rows={3}
                      value={valorDoCampo(acao, campo.chave)}
                      onChange={(e) => onMudar(comCampo(acao, campo.chave, e.target.value))}
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
