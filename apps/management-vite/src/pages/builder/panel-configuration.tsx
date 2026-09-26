import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Etiqueta, Icone } from '@pipe/ui';
import { IconePortal } from '../../components/icones-portal';
import { ModalConfirmation } from '../registrations/_modal';
import type { AcaoDoEditor, Mapa } from './model';
import { CATALOG_OF_ACTIONS, LABELS_OF_ACTIONS, novaAcao } from './actions-of-block';
import type { ActionsList } from './actions-of-block';
import {
  adicionarAcaoGlobal,
  actionsGlobalList,
  moverAcaoGlobal,
  removerAcaoGlobal,
  substituirAcaoGlobal,
} from './actions-global';
import { ActionCard } from './panel-actions';
import {
  MESSAGES_OF_IMPORT,
  nameOfFileOfExport,
  exportText,
  validateImport,
} from './import-exportar';

/**
 * The "Configuração" panel (`$ctrl.editConfig()`, `settings-builder` icon) — the source has 3 tabs (`portal.js`: "Variáveis", "Versões", "Ações Globais"). Here only the two with an engine behind them:
 *
 * - "Ações Globais": the same two lists as a block (`$enteringCustomActions`/`$leavingCustomActions`), but for the whole flow — the engine actually runs them (`editor.ts` from `@pipe/core`).
 * - "Versões" (which in the source is where "Importar"/"Exportar" live, not a standalone button): downloads/reads the same `{flow, globalActions}` Blip uses.
 *
 * The source's "Variáveis" tab (state expiration, action timeout, minimum AI score, tunnel owner context…) is Blip engine configuration that the Pipe engine doesn't have — not built, so as not to fake a control that does nothing.
 */

type Aba = 'acoes' | 'versoes';

export function ConfigurationPanel({
  flowName,
  mapa,
  global,
  onChangeGlobal,
  onImport,
  onFechar,
}: {
  flowName: string;
  mapa: Mapa;
  global: Record<string, unknown>;
  onChangeGlobal: (global: Record<string, unknown>) => void;
  onImport: (mapa: Mapa, global: Record<string, unknown>) => void;
  onFechar: () => void;
}) {
  const [aba, setAba] = useState<Aba>('acoes');
  const abas: { key: Aba; rotulo: string }[] = [
    { key: 'acoes', rotulo: 'Ações Globais' },
    { key: 'versoes', rotulo: 'Versões' },
  ];
  return (
    <aside className="bl-panel bl-panel--settings" aria-label="Configuração">
      <div className="bl-panel-header">
        <span className="bl-panel-title">Configurações</span>
        <button type="button" className="iconbtn" aria-label="Fechar" title="Fechar" onClick={onFechar}>
          <IconePortal nome="fechar" tamanho={20} />
        </button>
      </div>
      <hr className="bl-panel-wire" />
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
      <div className="bl-panel-body">
        {aba === 'acoes' ? <ActionsGlobalTab global={global} onMudar={onChangeGlobal} /> : null}
        {aba === 'versoes' ? (
          <VersionsTab flowName={flowName} mapa={mapa} global={global} onImport={onImport} />
        ) : null}
      </div>
    </aside>
  );
}

function ActionsGlobalTab({
  global,
  onMudar,
}: {
  global: Record<string, unknown>;
  onMudar: (global: Record<string, unknown>) => void;
}) {
  return (
    <div className="bl-aba-corpo">
      <ActionsGlobalList
        lista="$enteringCustomActions"
        titulo={LABELS_OF_ACTIONS.entrada}
        description={LABELS_OF_ACTIONS.entradaDescricao}
        rotuloAdicionar={LABELS_OF_ACTIONS.adicionarEntrada}
        global={global}
        onMudar={onMudar}
      />
      <ActionsGlobalList
        lista="$leavingCustomActions"
        titulo={LABELS_OF_ACTIONS.saida}
        description={LABELS_OF_ACTIONS.saidaDescricao}
        rotuloAdicionar={LABELS_OF_ACTIONS.adicionarSaida}
        global={global}
        onMudar={onMudar}
      />
    </div>
  );
}

function ActionsGlobalList({
  lista,
  titulo,
  description,
  rotuloAdicionar,
  global,
  onMudar,
}: {
  lista: ActionsList;
  titulo: string;
  description: string;
  rotuloAdicionar: string;
  global: Record<string, unknown>;
  onMudar: (global: Record<string, unknown>) => void;
}) {
  const actions = actionsGlobalList(global, lista);
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
    <section className="bl-section">
      <h4 className="bl-section-title">{titulo}</h4>
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
          <div className="bl-menu-actions" role="menu">
            <header>
              <b>{LABELS_OF_ACTIONS.menu}</b>
              <button type="button" className="iconbtn" aria-label="Fechar" onClick={() => setMenuAberto(false)}>
                <Icone nome="x" tamanho={16} />
              </button>
            </header>
            {groups.map((grupo) => (
              <div key={grupo} className="bl-menu-actions-group">
                <span className="sub">{grupo}</span>
                {CATALOG_OF_ACTIONS.filter((t) => t.grupo === grupo).map((t) => (
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

function VersionsTab({
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

  function toChooseFile(e: ChangeEvent<HTMLInputElement>): void {
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
      <ul className="bl-versions-actions">
        <li>
          <button type="button" className="bl-versions-item" onClick={() => file.current?.click()}>
            <IconePortal nome="enviar-arquivo" tamanho={18} />
            <span>Importar fluxo</span>
          </button>
          <input ref={file} type="file" accept=".json" className="bl-oculto" onChange={toChooseFile} />
        </li>
        <li>
          <button type="button" className="bl-versions-item" onClick={exportar}>
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
