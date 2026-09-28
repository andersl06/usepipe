import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { VersionOfFlow } from '@pipe/contracts';
import { Etiqueta, Icone } from '@pipe/ui';
import { IconePortal } from '../../components/icones-portal';
import type { Resultado } from '../../lib/rest';
import { ModalConfirmation } from '../registrations/_modal';
import type { Mapa } from './model';
import { lerDesenho } from './model';
import { pseudoBlockOfGlobal, globalOfPseudoBlock } from './actions-global';
import { ActionsPanel } from './panel-actions';
import { FlowFunctionsPanel } from './flow-functions-panel';
import { FloatingSidebar } from './floating-sidebar';
import { ConfigurationVariablesTab } from './panel-configuration-variables';
import { listVersions, loadVersion } from '../builder-gravar';
import {
  MESSAGES_OF_IMPORT,
  nameOfFileOfExport,
  nameOfFileOfExportedVersion,
  exportText,
  validateImport,
} from './import-exportar';
import { lastPublished, latestPublished, formatPublishedAt } from './versions-list';
import type { ToastInput } from './toast-queue';

/**
 * The "Configuração" panel (`$ctrl.editConfig()`, `settings-builder` icon) — the source's 3 tabs
 * (`portal.js`: "Variáveis", "Versões", "Ações Globais"), reproduced here plus the function library:
 *
 * - "Variáveis" (default tab, D-56 item 3): the 8 sections `configuration-sections.ts` captured
 *   (`panel-configuration-variables.tsx`). Only "Variáveis de configuração" is wired to the engine
 *   ({{config.X}}, read by `packages/core/src/flow/context.ts`); the other 7 show the Blip control
 *   disabled with the recorded value, marked "Não disponível no Pipe".
 * - "Versões" (where the source's "Carregar fluxo"/"Baixar fluxo" live, not a standalone button):
 *   downloads/reads the same `{flow, globalActions}` Blip uses; "Restaurar versão" restores the latest
 *   publication; "VERSÕES PUBLICADAS" lists the last 10 as cards (F-2.1, `versions-list.ts`).
 * - "Ações globais": the identical `ActionsPanel` the block's "Ações" tab renders (F-2.2), fed a
 *   pseudo-block built from `global` (`pseudoBlockOfGlobal`/`globalOfPseudoBlock`, `actions-global.ts`)
 *   so the same `$enteringCustomActions`/`$leavingCustomActions` editing works flow-wide — the engine
 *   actually runs them (`editor.ts` from `@pipe/core`).
 * - "Funções": the "Biblioteca de funções" the `ExecuteBlipFunction` action consumes — a bot-scoped
 *   resource, so it lives beside the Blip tabs rather than inside a single block; last in the tab order
 *   (D-22), after the source's own tabs.
 */

type Aba = 'variaveis' | 'versoes' | 'acoes' | 'funcoes';

export function ConfigurationPanel({
  flowId,
  flowName,
  mapa,
  global,
  configuration,
  onChangeGlobal,
  onChangeConfiguration,
  onImport,
  onRestoreVersion,
  onAviso,
  onFechar,
  abaInicial,
  criarFuncaoAoAbrir,
}: {
  flowId: string;
  flowName: string;
  mapa: Mapa;
  global: Record<string, unknown>;
  /** `flow.configuration` ({{config.X}}); edited by the "Variáveis" tab's "Variáveis de configuração". */
  configuration: Record<string, string>;
  onChangeGlobal: (global: Record<string, unknown>) => void;
  onChangeConfiguration: (chave: string, valor: string | null) => void;
  onImport: (mapa: Mapa, global: Record<string, unknown>) => void;
  /** Restores an old version as the draft; the caller owns the `api` call and reloading the editor. */
  onRestoreVersion: (version: number) => Promise<Resultado<VersionOfFlow>>;
  /** The Builder's single toast (F-6, D-56): action limits in "Ações globais", "nada publicado" in "Versões". */
  onAviso: (input: ToastInput) => void;
  onFechar: () => void;
  /** Which tab opens first; the block Ações tab's "Gerenciar/Criar função" lands here on "Funções" (D-22). */
  abaInicial?: Aba;
  /** With `abaInicial: 'funcoes'`, opens the library straight into "Criar função". */
  criarFuncaoAoAbrir?: boolean;
}) {
  const [aba, setAba] = useState<Aba>(abaInicial ?? 'variaveis');
  /** "Biblioteca de funções" inside "Ações globais" switches to "Funções" without leaving the panel. */
  const [criarFuncao, setCriarFuncao] = useState(criarFuncaoAoAbrir ?? false);
  function abrirFuncoes(modo: 'gerenciar' | 'criar'): void {
    setCriarFuncao(modo === 'criar');
    setAba('funcoes');
  }
  function avisar(texto: string): void {
    onAviso({ tom: 'aviso', texto });
  }
  const abas: { key: Aba; rotulo: string }[] = [
    { key: 'variaveis', rotulo: 'Variáveis' },
    { key: 'versoes', rotulo: 'Versões' },
    { key: 'acoes', rotulo: 'Ações globais' },
    { key: 'funcoes', rotulo: 'Funções' },
  ];
  return (
    <FloatingSidebar
      lado="direita"
      titulo="Configurações gerais"
      ariaLabel="Configuração"
      onFechar={onFechar}
      abas={
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
      }
    >
      <div className="bl-panel-body">
        {aba === 'variaveis' ? (
          <ConfigurationVariablesTab
            configuration={configuration}
            flowId={flowId}
            onChange={onChangeConfiguration}
          />
        ) : null}
        {aba === 'acoes' ? (
          <ActionsPanel
            block={pseudoBlockOfGlobal(global)}
            onMudar={(bloco) => onChangeGlobal(globalOfPseudoBlock(bloco))}
            onAviso={avisar}
            onAbrirFuncoes={abrirFuncoes}
          />
        ) : null}
        {aba === 'funcoes' ? <FlowFunctionsPanel iniciarCriando={criarFuncao} /> : null}
        {aba === 'versoes' ? (
          <VersionsTab
            flowId={flowId}
            flowName={flowName}
            mapa={mapa}
            global={global}
            onImport={onImport}
            onRestoreVersion={onRestoreVersion}
            onAviso={avisar}
          />
        ) : null}
      </div>
    </FloatingSidebar>
  );
}

/** Blip's "Restaurar versão" confirmation and messages (F-2.1); only this tab uses them. */
const MESSAGES_OF_RESTORE = {
  disclaimer:
    'Ao restaurar a última versão publicada, as alterações no fluxo principal serão perdidas, enquanto as alterações nos subfluxos serão mantidas. Deseja prosseguir com a restauração?',
  nadaPublicado: 'Não foi encontrada nenhuma versão publicada',
  erro: 'Não foi possível restaurar a versão publicada',
} as const;

function VersionsTab({
  flowId,
  flowName,
  mapa,
  global,
  onImport,
  onRestoreVersion,
  onAviso,
}: {
  flowId: string;
  flowName: string;
  mapa: Mapa;
  global: Record<string, unknown>;
  onImport: (mapa: Mapa, global: Record<string, unknown>) => void;
  onRestoreVersion: (version: number) => Promise<Resultado<VersionOfFlow>>;
  onAviso: (texto: string) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [pendente, setPendente] = useState<{ mapa: Mapa; global: Record<string, unknown> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [versions, setVersions] = useState<VersionOfFlow[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [publicadasAbertas, setPublicadasAbertas] = useState(false);

  useEffect(() => {
    let ativo = true;
    void listVersions(flowId).then((r) => {
      if (!ativo) return;
      if (r.ok) setVersions(r.value);
      else setHistoryError(r.error);
    });
    return () => {
      ativo = false;
    };
  }, [flowId]);

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

  async function exportVersion(versao: VersionOfFlow): Promise<void> {
    setExportError(null);
    const r = await loadVersion(flowId, versao.versao);
    if (!r.ok) {
      setExportError(r.error);
      return;
    }
    const conteudo = exportText(lerDesenho(r.value), r.value.globals);
    const blob = new Blob([conteudo], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nameOfFileOfExportedVersion(flowName, versao.versao, versao.publicadaEm ?? versao.criadoEm);
    a.click();
    URL.revokeObjectURL(url);
  }

  async function confirmRestore(): Promise<void> {
    if (restoreTarget === null) return;
    setRestoring(true);
    setRestoreError(null);
    const r = await onRestoreVersion(restoreTarget);
    setRestoring(false);
    if (!r.ok) {
      setRestoreError(MESSAGES_OF_RESTORE.erro);
      return;
    }
    setRestoreTarget(null);
  }

  /** "Restaurar versão" (list item, F-2.1): restores the latest publication, or warns there is none. */
  function restoreLatest(): void {
    const alvo = versions ? latestPublished(versions) : null;
    if (!alvo) {
      onAviso(MESSAGES_OF_RESTORE.nadaPublicado);
      return;
    }
    setRestoreTarget(alvo.versao);
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

  const recentes = versions ? lastPublished(versions) : [];

  return (
    <div className="bl-aba-corpo">
      <ul className="bl-versions-actions">
        <li>
          <button type="button" className="bl-versions-item" onClick={() => file.current?.click()}>
            <IconePortal nome="enviar-arquivo" tamanho={20} />
            <span>Carregar fluxo</span>
          </button>
          <input ref={file} type="file" accept=".json" className="bl-oculto" onChange={toChooseFile} />
        </li>
        <li>
          <button type="button" className="bl-versions-item" onClick={exportar}>
            <IconePortal nome="baixar" tamanho={20} />
            <span>Baixar fluxo</span>
          </button>
        </li>
      </ul>
      <div className="bl-versions-aviso">
        <IconePortal nome="informacao-cheia" tamanho={14} />
        <span>Baixar o fluxo e as configurações de ações globais.</span>
      </div>
      <ul className="bl-versions-actions">
        <li>
          <button type="button" className="bl-versions-item" onClick={restoreLatest}>
            <Icone nome="historico" tamanho={20} />
            <span>Restaurar versão</span>
          </button>
        </li>
      </ul>
      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
      {exportError ? <Etiqueta tom="erro">{exportError}</Etiqueta> : null}

      <section className="bl-config-secao">
        <header className="bl-config-secao-cabecalho">
          <button
            type="button"
            className="bl-config-secao-toggle"
            aria-expanded={publicadasAbertas}
            onClick={() => setPublicadasAbertas((v) => !v)}
          >
            <Icone
              nome="baixo"
              tamanho={16}
              className={publicadasAbertas ? 'bl-config-chevron bl-config-chevron--aberta' : 'bl-config-chevron'}
            />
            <span>VERSÕES PUBLICADAS</span>
          </button>
        </header>
        {publicadasAbertas ? (
          <div className="bl-config-secao-corpo">
            <p className="sub">Confira o histórico de versões publicadas do seu fluxo</p>
            {historyError ? <Etiqueta tom="erro">{historyError}</Etiqueta> : null}
            {versions === null && !historyError ? <p className="bl-ajuda">Carregando histórico…</p> : null}
            {versions && recentes.length === 0 ? (
              <p className="bl-ajuda">Nenhuma versão publicada ainda.</p>
            ) : null}
            {recentes.length > 0 ? (
              <div className="bl-version-cards">
                {recentes.map((v) => (
                  <article className="bl-version-card" key={v.id}>
                    <div className="bl-version-card-info">
                      <b>{formatPublishedAt(v.publicadaEm)}</b>
                      <span>{v.publishedBy ?? '—'}</span>
                    </div>
                    <div className="bl-version-card-actions">
                      <button
                        type="button"
                        className="bl-version-icon"
                        title="Restaurar versão"
                        aria-label={`Restaurar versão ${v.versao}`}
                        onClick={() => setRestoreTarget(v.versao)}
                      >
                        <Icone nome="restoreVersion" tamanho={18} />
                      </button>
                      <button
                        type="button"
                        className="bl-version-icon"
                        title="Baixar fluxo"
                        aria-label={`Baixar versão ${v.versao}`}
                        onClick={() => void exportVersion(v)}
                      >
                        <IconePortal nome="baixar" tamanho={18} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <ModalConfirmation
        aberto={pendente !== null}
        titulo="Carregar fluxo"
        message={MESSAGES_OF_IMPORT.disclaimer}
        rotuloConfirmar="Sim"
        rotuloCancelar="Não"
        onConfirmar={() => {
          if (pendente) onImport(pendente.mapa, pendente.global);
          setPendente(null);
        }}
        onCancelar={() => setPendente(null)}
      />

      <ModalConfirmation
        aberto={restoreTarget !== null}
        titulo="Restaurar versão"
        message={MESSAGES_OF_RESTORE.disclaimer}
        error={restoreError}
        confirmando={restoring}
        rotuloConfirmar="Restaurar"
        onConfirmar={() => void confirmRestore()}
        onCancelar={() => {
          setRestoreTarget(null);
          setRestoreError(null);
        }}
      />
    </div>
  );
}
