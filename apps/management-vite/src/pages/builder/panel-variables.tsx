import { useState } from 'react';
import { Campo } from '@pipe/ui';
import { IconePortal } from '../../components/icones-portal';
import type { Mapa } from './model';
import { FloatingSidebar } from './floating-sidebar';
import { BLIP_SYSTEM_VARIABLES } from './system-variables';
import {
  systemFilterVariables,
  userLibraryFilter,
  userVariables,
} from './variables';

/**
 * The editor's "Biblioteca de variáveis" (`$ctrl.openVarLib()`, `library` icon) — a panel on the LEFT in
 * the source (`library-sidebar`, `position-left`), unlike the block panel (`position-right`). Two tabs,
 * `bds-tab-group`: "Biblioteca de variáveis" (Blip's 118 system variables, `system-variables.ts`) and
 * "Minhas variáveis" (what this flow actually references, `variables.ts`'s `userVariables`) — structure
 * and copy behavior from `portal.js`'s `BuilderVariablesLibrary` (F-3, D-56 item 2): copies the bare name
 * (no `{{ }}`), tooltip flips to "Copiado!" for 1s with no toast.
 */

type Aba = 'sistema' | 'usuario';

const COPY_TOOLTIP_MS = 1000;

function copyName(nome: string, onCopied: () => void): void {
  const done = () => onCopied();
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(nome).then(done, () => copyWithExecCommand(nome, done));
    return;
  }
  copyWithExecCommand(nome, done);
}

/** Fallback for browsers/contexts without `navigator.clipboard` (e.g. non-HTTPS). */
function copyWithExecCommand(nome: string, done: () => void): void {
  const textarea = document.createElement('textarea');
  textarea.value = nome;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } catch {
    // best-effort fallback; the tooltip still confirms the attempt
  }
  document.body.removeChild(textarea);
  done();
}

export function VariablesPanel({
  mapa,
  global,
  configuration,
  onFechar,
}: {
  mapa: Mapa;
  global: Record<string, unknown>;
  configuration: Record<string, string>;
  onFechar: () => void;
}) {
  const [aba, setAba] = useState<Aba>('sistema');
  const [buscaSistema, setBuscaSistema] = useState('');
  const [buscaUsuario, setBuscaUsuario] = useState('');
  const [copiado, setCopiado] = useState<string | null>(null);

  const user = userVariables(mapa, global, configuration);
  const sistemaFiltrado = systemFilterVariables(BLIP_SYSTEM_VARIABLES, buscaSistema);
  const userFiltered = userLibraryFilter(user, buscaUsuario);

  function copiar(nome: string) {
    copyName(nome, () => {
      setCopiado(nome);
      setTimeout(() => setCopiado((atual) => (atual === nome ? null : atual)), COPY_TOOLTIP_MS);
    });
  }

  function botaoCopiar(nome: string) {
    const ativo = copiado === nome;
    return (
      <button
        type="button"
        className={ativo ? 'bl-library-copy bl-library-copy--copiado' : 'bl-library-copy'}
        title={ativo ? undefined : 'Copiar'}
        aria-label={`Copiar ${nome}`}
        onClick={() => copiar(nome)}
      >
        <IconePortal nome="copiar" tamanho={16} />
        {ativo ? (
          <span className="bl-library-copy-tooltip" role="status">
            Copiado!
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <FloatingSidebar
      lado="esquerda"
      ariaLabel="Biblioteca de variáveis"
      onFechar={onFechar}
      abas={
        <div className="bl-abas" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={aba === 'sistema'}
            className={aba === 'sistema' ? 'bl-aba bl-aba--ativa' : 'bl-aba'}
            onClick={() => setAba('sistema')}
          >
            Biblioteca de variáveis
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={aba === 'usuario'}
            className={aba === 'usuario' ? 'bl-aba bl-aba--ativa' : 'bl-aba'}
            onClick={() => setAba('usuario')}
          >
            Minhas variáveis
          </button>
        </div>
      }
    >
      <div className="bl-panel-body">
        {aba === 'sistema' ? (
          <>
            <div className="bl-library-search">
              <IconePortal nome="busca" tamanho={20} />
              <Campo
                className="bl-library-search-input"
                value={buscaSistema}
                placeholder="Digite um nome ou tema para buscar variáveis"
                aria-label="Buscar na biblioteca de variáveis"
                onChange={(e) => setBuscaSistema(e.target.value)}
              />
            </div>
            {sistemaFiltrado.length === 0 ? (
              <p className="bl-library-empty">Nenhuma variável encontrada</p>
            ) : (
              <ul className="bl-library-list">
                {sistemaFiltrado.map((v) => (
                  <li key={v.nome}>
                    <div className="bl-library-row">
                      <span className="bl-library-name">{v.nome}</span>
                      {botaoCopiar(v.nome)}
                    </div>
                    <p className="bl-library-description">{v.descricao}</p>
                    {!v.suportada ? <p className="bl-library-unsupported">Não disponível no Pipe</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="bl-library-search">
              <IconePortal nome="busca" tamanho={20} />
              <Campo
                className="bl-library-search-input"
                value={buscaUsuario}
                placeholder="Digite um nome ou tema para buscar variáveis"
                aria-label="Buscar nas minhas variáveis"
                onChange={(e) => setBuscaUsuario(e.target.value)}
              />
            </div>
            {userFiltered.length === 0 ? (
              <p className="bl-library-empty">Nenhuma variável encontrada</p>
            ) : (
              <ul className="bl-library-list bl-library-list--user">
                {userFiltered.map((nome) => (
                  <li key={nome}>
                    <div className="bl-library-row">
                      <span className="bl-library-name">{nome}</span>
                      {botaoCopiar(nome)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </FloatingSidebar>
  );
}
