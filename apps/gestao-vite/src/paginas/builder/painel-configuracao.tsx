import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Etiqueta, Icone } from '@pipe/ui';
import { IconePortal } from '../../componentes/icones-portal';
import { ModalConfirmacao } from '../cadastros/_modal';
import type { AcaoDoEditor, Mapa } from './modelo';
import { CATALOGO_DE_ACOES, ROTULOS_DAS_ACOES, novaAcao } from './acoes-do-bloco';
import type { ListaDeAcoes } from './acoes-do-bloco';
import {
  adicionarAcaoGlobal,
  listaDeAcoesGlobais,
  moverAcaoGlobal,
  removerAcaoGlobal,
  substituirAcaoGlobal,
} from './acoes-globais';
import { CartaoDeAcao } from './painel-acoes';
import {
  MENSAGENS_DE_IMPORTACAO,
  nomeDoArquivoDeExportacao,
  textoDeExportacao,
  validarImportacao,
} from './importar-exportar';

/**
 * O painel "Configuração" (`$ctrl.editConfig()`, ícone `settings-builder`) —
 * na origem tem 3 abas (`portal.js`: "Variáveis", "Versões", "Ações
 * Globais"). Aqui só as duas com motor por trás:
 *
 * - "Ações Globais": as mesmas duas listas de um bloco
 *   (`$enteringCustomActions`/`$leavingCustomActions`), só que do fluxo
 *   inteiro — o motor as roda de verdade (`editor.ts` de `@pipe/core`).
 * - "Versões" (que na origem é onde "Importar"/"Exportar" moram, não um
 *   botão solto): baixa/lê o mesmo `{flow, globalActions}` que a Blip usa.
 *
 * A aba "Variáveis" da origem (expiração de estado, timeout de ação, score
 * mínimo de IA, contexto do dono do túnel…) é configuração do motor da Blip
 * que o motor do Pipe não tem — não construída, para não fingir um controle
 * que não faz nada.
 */

type Aba = 'acoes' | 'versoes';

export function PainelDeConfiguracao({
  nomeDoFluxo,
  mapa,
  globais,
  onMudarGlobais,
  onImportar,
  onFechar,
}: {
  nomeDoFluxo: string;
  mapa: Mapa;
  globais: Record<string, unknown>;
  onMudarGlobais: (globais: Record<string, unknown>) => void;
  onImportar: (mapa: Mapa, globais: Record<string, unknown>) => void;
  onFechar: () => void;
}) {
  const [aba, setAba] = useState<Aba>('acoes');
  const abas: { chave: Aba; rotulo: string }[] = [
    { chave: 'acoes', rotulo: 'Ações Globais' },
    { chave: 'versoes', rotulo: 'Versões' },
  ];
  return (
    <aside className="bl-painel bl-painel--configuracao" aria-label="Configuração">
      <div className="bl-painel-cabecalho">
        <span className="bl-painel-titulo">Configurações</span>
        <button type="button" className="iconbtn" aria-label="Fechar" title="Fechar" onClick={onFechar}>
          <IconePortal nome="fechar" tamanho={20} />
        </button>
      </div>
      <hr className="bl-painel-fio" />
      <div className="bl-abas" role="tablist">
        {abas.map((a) => (
          <button
            key={a.chave}
            type="button"
            role="tab"
            aria-selected={aba === a.chave}
            className={aba === a.chave ? 'bl-aba bl-aba--ativa' : 'bl-aba'}
            onClick={() => setAba(a.chave)}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      <div className="bl-painel-corpo">
        {aba === 'acoes' ? <AbaDeAcoesGlobais globais={globais} onMudar={onMudarGlobais} /> : null}
        {aba === 'versoes' ? (
          <AbaDeVersoes nomeDoFluxo={nomeDoFluxo} mapa={mapa} globais={globais} onImportar={onImportar} />
        ) : null}
      </div>
    </aside>
  );
}

function AbaDeAcoesGlobais({
  globais,
  onMudar,
}: {
  globais: Record<string, unknown>;
  onMudar: (globais: Record<string, unknown>) => void;
}) {
  return (
    <div className="bl-aba-corpo">
      <ListaDeAcoesGlobais
        lista="$enteringCustomActions"
        titulo={ROTULOS_DAS_ACOES.entrada}
        descricao={ROTULOS_DAS_ACOES.entradaDescricao}
        rotuloAdicionar={ROTULOS_DAS_ACOES.adicionarEntrada}
        globais={globais}
        onMudar={onMudar}
      />
      <ListaDeAcoesGlobais
        lista="$leavingCustomActions"
        titulo={ROTULOS_DAS_ACOES.saida}
        descricao={ROTULOS_DAS_ACOES.saidaDescricao}
        rotuloAdicionar={ROTULOS_DAS_ACOES.adicionarSaida}
        globais={globais}
        onMudar={onMudar}
      />
    </div>
  );
}

function ListaDeAcoesGlobais({
  lista,
  titulo,
  descricao,
  rotuloAdicionar,
  globais,
  onMudar,
}: {
  lista: ListaDeAcoes;
  titulo: string;
  descricao: string;
  rotuloAdicionar: string;
  globais: Record<string, unknown>;
  onMudar: (globais: Record<string, unknown>) => void;
}) {
  const acoes = listaDeAcoesGlobais(globais, lista);
  const [menuAberto, setMenuAberto] = useState(false);
  const [aberta, setAberta] = useState<number | null>(null);

  function adicionar(tipo: string): void {
    const r = adicionarAcaoGlobal(globais, lista, novaAcao(tipo));
    setMenuAberto(false);
    if (!r.ok) return;
    onMudar(r.globais);
    setAberta(acoes.length);
  }

  const grupos = ['Executar', 'Manipular'] as const;

  return (
    <section className="bl-secao">
      <h4 className="bl-secao-titulo">{titulo}</h4>
      <p className="sub">{descricao}</p>

      {acoes.map((acao: AcaoDoEditor, i) => (
        <CartaoDeAcao
          key={acao.$id ?? i}
          acao={acao}
          aberta={aberta === i}
          primeira={i === 0}
          ultima={i === acoes.length - 1}
          onAbrir={() => setAberta(aberta === i ? null : i)}
          onMudar={(nova) => onMudar(substituirAcaoGlobal(globais, lista, i, nova))}
          onSubir={() => onMudar(moverAcaoGlobal(globais, lista, i, i - 1))}
          onDescer={() => onMudar(moverAcaoGlobal(globais, lista, i, i + 1))}
          onRemover={() => {
            setAberta(null);
            onMudar(removerAcaoGlobal(globais, lista, i));
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

function AbaDeVersoes({
  nomeDoFluxo,
  mapa,
  globais,
  onImportar,
}: {
  nomeDoFluxo: string;
  mapa: Mapa;
  globais: Record<string, unknown>;
  onImportar: (mapa: Mapa, globais: Record<string, unknown>) => void;
}) {
  const arquivo = useRef<HTMLInputElement>(null);
  const [pendente, setPendente] = useState<{ mapa: Mapa; globais: Record<string, unknown> } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function exportar(): void {
    const conteudo = textoDeExportacao(mapa, globais);
    const blob = new Blob([conteudo], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeDoArquivoDeExportacao(nomeDoFluxo);
    a.click();
    URL.revokeObjectURL(url);
  }

  function aoEscolherArquivo(e: ChangeEvent<HTMLInputElement>): void {
    const arq = e.target.files?.[0];
    e.target.value = '';
    if (!arq) return;
    setErro(null);
    const leitor = new FileReader();
    leitor.onload = () => {
      const r = validarImportacao(String(leitor.result ?? ''));
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setPendente({ mapa: r.mapa, globais: r.globais });
    };
    leitor.onerror = () => setErro(MENSAGENS_DE_IMPORTACAO.arquivoInvalido);
    leitor.readAsText(arq);
  }

  return (
    <div className="bl-aba-corpo">
      <ul className="bl-versoes-acoes">
        <li>
          <button type="button" className="bl-versoes-item" onClick={() => arquivo.current?.click()}>
            <IconePortal nome="enviar-arquivo" tamanho={18} />
            <span>Importar fluxo</span>
          </button>
          <input ref={arquivo} type="file" accept=".json" className="bl-oculto" onChange={aoEscolherArquivo} />
        </li>
        <li>
          <button type="button" className="bl-versoes-item" onClick={exportar}>
            <IconePortal nome="baixar" tamanho={18} />
            <span>Exportar fluxo</span>
          </button>
        </li>
      </ul>
      <p className="bl-ajuda">
        Baixa o fluxo e as ações globais num arquivo .json; importar substitui o rascunho atual.
      </p>
      {erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}

      <ModalConfirmacao
        aberto={pendente !== null}
        titulo="Importar fluxo"
        mensagem={MENSAGENS_DE_IMPORTACAO.disclaimer}
        rotuloConfirmar="Importar"
        onConfirmar={() => {
          if (pendente) onImportar(pendente.mapa, pendente.globais);
          setPendente(null);
        }}
        onCancelar={() => setPendente(null)}
      />
    </div>
  );
}
