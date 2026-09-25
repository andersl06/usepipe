import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Etiqueta, Icone } from '@pipe/ui';
import { IconePortal } from '../../componentes/icones-portal';
import { ModalConfirmation } from '../cadastros/_modal';
import type { AcaoDoEditor, Mapa } from './modelo';
import { CATALOGO_OF_ACTIONS, ROTULOS_OF_ACTIONS, novaAcao } from './acoes-do-bloco';
import type { ActionsLista } from './acoes-do-bloco';
import {
  adicionarAcaoGlobal,
  actionsGlobalLista,
  moverAcaoGlobal,
  removerAcaoGlobal,
  substituirAcaoGlobal,
} from './acoes-globais';
import { ActionCard } from './painel-acoes';
import {
  MESSAGES_OF_IMPORT,
  nameOfFileOfExport,
  exportText,
  validateImport,
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

export function ConfigurationPanel({
  flowName,
  mapa,
  global,
  onMudarGlobal,
  onImport,
  onFechar,
}: {
  flowName: string;
  mapa: Mapa;
  global: Record<string, unknown>;
  onMudarGlobal: (global: Record<string, unknown>) => void;
  onImport: (mapa: Mapa, global: Record<string, unknown>) => void;
  onFechar: () => void;
}) {
  const [aba, setAba] = useState<Aba>('acoes');
  const abas: { key: Aba; rotulo: string }[] = [
    { key: 'acoes', rotulo: 'Ações Globais' },
    { key: 'versoes', rotulo: 'Versões' },
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
            key={a.key}
            type="button"
            role="tab"
            aria-selected={aba === a.key}
            className={aba === a.key ? 'bl-aba bl-aba--ativa' : 'bl-aba'}
            onClick={() => setAba(a.key)}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      <div className="bl-painel-corpo">
        {aba === 'acoes' ? <ActionsGlobalAba global={global} onMudar={onMudarGlobal} /> : null}
        {aba === 'versoes' ? (
          <VersionsAba flowName={flowName} mapa={mapa} global={global} onImport={onImport} />
        ) : null}
      </div>
    </aside>
  );
}

function ActionsGlobalAba({
  global,
  onMudar,
}: {
  global: Record<string, unknown>;
  onMudar: (global: Record<string, unknown>) => void;
}) {
  return (
    <div className="bl-aba-corpo">
      <ActionsGlobalLista
        lista="$enteringCustomActions"
        titulo={ROTULOS_OF_ACTIONS.entrada}
        description={ROTULOS_OF_ACTIONS.entradaDescricao}
        rotuloAdicionar={ROTULOS_OF_ACTIONS.adicionarEntrada}
        global={global}
        onMudar={onMudar}
      />
      <ActionsGlobalLista
        lista="$leavingCustomActions"
        titulo={ROTULOS_OF_ACTIONS.saida}
        description={ROTULOS_OF_ACTIONS.saidaDescricao}
        rotuloAdicionar={ROTULOS_OF_ACTIONS.adicionarSaida}
        global={global}
        onMudar={onMudar}
      />
    </div>
  );
}

function ActionsGlobalLista({
  lista,
  titulo,
  description,
  rotuloAdicionar,
  global,
  onMudar,
}: {
  lista: ActionsLista;
  titulo: string;
  description: string;
  rotuloAdicionar: string;
  global: Record<string, unknown>;
  onMudar: (global: Record<string, unknown>) => void;
}) {
  const actions = actionsGlobalLista(global, lista);
  const [menuAberto, setMenuAberto] = useState(false);
  const [aberta, setAberta] = useState<number | null>(null);

  function adicionar(tipo: string): void {
    const r = adicionarAcaoGlobal(global, lista, novaAcao(tipo));
    setMenuAberto(false);
    if (!r.ok) return;
    onMudar(r.global);
    setAberta(actions.length);
  }

  const groups = ['Executar', 'Manipular'] as const;

  return (
    <section className="bl-secao">
      <h4 className="bl-secao-titulo">{titulo}</h4>
      <p className="sub">{description}</p>

      {actions.map((acao: AcaoDoEditor, i) => (
        <ActionCard
          key={acao.$id ?? i}
          acao={acao}
          aberta={aberta === i}
          first={i === 0}
          ultima={i === actions.length - 1}
          onAbrir={() => setAberta(aberta === i ? null : i)}
          onMudar={(nova) => onMudar(substituirAcaoGlobal(global, lista, i, nova))}
          onStart={() => onMudar(moverAcaoGlobal(global, lista, i, i - 1))}
          onLower={() => onMudar(moverAcaoGlobal(global, lista, i, i + 1))}
          onRemover={() => {
            setAberta(null);
            onMudar(removerAcaoGlobal(global, lista, i));
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
              <b>{ROTULOS_OF_ACTIONS.menu}</b>
              <button type="button" className="iconbtn" aria-label="Fechar" onClick={() => setMenuAberto(false)}>
                <Icone nome="x" tamanho={16} />
              </button>
            </header>
            {groups.map((grupo) => (
              <div key={grupo} className="bl-menu-acoes-grupo">
                <span className="sub">{grupo}</span>
                {CATALOGO_OF_ACTIONS.filter((t) => t.grupo === grupo).map((t) => (
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

function VersionsAba({
  flowName,
  mapa,
  global,
  onImport,
}: {
  flowName: string;
  mapa: Mapa;
  global: Record<string, unknown>;
  onImport: (mapa: Mapa, global: Record<string, unknown>) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [pendente, setPendente] = useState<{ mapa: Mapa; global: Record<string, unknown> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function exportar(): void {
    const conteudo = exportText(mapa, global);
    const blob = new Blob([conteudo], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nameOfFileOfExport(flowName);
    a.click();
    URL.revokeObjectURL(url);
  }

  function toEscolherFile(e: ChangeEvent<HTMLInputElement>): void {
    const arq = e.target.files?.[0];
    e.target.value = '';
    if (!arq) return;
    setError(null);
    const leitor = new FileReader();
    leitor.onload = () => {
      const r = validateImport(String(leitor.result ?? ''));
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPendente({ mapa: r.mapa, global: r.global });
    };
    leitor.onerror = () => setError(MESSAGES_OF_IMPORT.arquivoInvalido);
    leitor.readAsText(arq);
  }

  return (
    <div className="bl-aba-corpo">
      <ul className="bl-versoes-acoes">
        <li>
          <button type="button" className="bl-versoes-item" onClick={() => file.current?.click()}>
            <IconePortal nome="enviar-arquivo" tamanho={18} />
            <span>Importar fluxo</span>
          </button>
          <input ref={file} type="file" accept=".json" className="bl-oculto" onChange={toEscolherFile} />
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
      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}

      <ModalConfirmation
        aberto={pendente !== null}
        titulo="Importar fluxo"
        message={MESSAGES_OF_IMPORT.disclaimer}
        rotuloConfirmar="Importar"
        onConfirmar={() => {
          if (pendente) onImport(pendente.mapa, pendente.global);
          setPendente(null);
        }}
        onCancelar={() => setPendente(null)}
      />
    </div>
  );
}
