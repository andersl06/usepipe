import { useState } from 'react';
import { Campo } from '@pipe/ui';
import { IconePortal } from '../../components/icones-portal';
import type { Mapa } from './model';
import { FloatingSidebar } from './floating-sidebar';
import {
  VARIABLES_OF_SYSTEM,
  filterVariables,
  systemFilterVariables,
  userVariables,
} from './variables';

/**
 * The "Biblioteca de variáveis" (`$ctrl.openVarLib()`, `library` icon) — a panel on the LEFT in the source (`library-sidebar`, `position-left`), unlike the block panel (`position-right`). Two tabs, `bds-tab-group`: "Variáveis do sistema" and "Variáveis do usuário", each with search and a list with a copy button per item — structure confirmed in `portal.js` (`BuilderVariablesLibrary`).
 *
 * Without the account's variable registry that the source uses, "do usuário" here is what THIS flow actually references (`userVariables`, real data from the drawing) and "do sistema" is the fixed list of sources with a provider in the Pipe engine (`VARIAVEIS_DO_SISTEMA`, from `variaveis.ts` — see the reasoning there).
 */

type Aba = 'sistema' | 'usuario';

function copiar(texto: string, onAviso: (texto: string) => void): void {
  void navigator.clipboard?.writeText(texto).then(
    () => onAviso('Variável copiada.'),
    () => onAviso(texto),
  );
}

export function VariablesPanel({
  mapa,
  global,
  onFechar,
  onAviso,
}: {
  mapa: Mapa;
  global: Record<string, unknown>;
  onFechar: () => void;
  onAviso: (texto: string) => void;
}) {
  const [aba, setAba] = useState<Aba>('sistema');
  const [search, setSearch] = useState('');
  const user = userVariables(mapa, global);
  const sistemaFiltrado = systemFilterVariables(VARIABLES_OF_SYSTEM, search);
  const userFiltered = filterVariables(user, search);

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
            Variáveis do sistema
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={aba === 'usuario'}
            className={aba === 'usuario' ? 'bl-aba bl-aba--ativa' : 'bl-aba'}
            onClick={() => setAba('usuario')}
          >
            Variáveis do usuário
          </button>
        </div>
      }
    >
      <div className="bl-panel-body">
        <Campo
          value={search}
          placeholder="Pesquisar variável"
          aria-label="Pesquisar variável"
          onChange={(e) => setSearch(e.target.value)}
        />
        {aba === 'sistema' ? (
          sistemaFiltrado.length === 0 ? (
            <p className="sub bl-variables-empty">Nenhuma variável encontrada.</p>
          ) : (
            <ul className="bl-variables-list">
              {sistemaFiltrado.map((v) => (
                <li key={v.nome}>
                  <div className="bl-variable-line">
                    <span className="bl-variable-name">{v.nome}</span>
                    <button
                      type="button"
                      className="iconbtn"
                      title="Copiar"
                      aria-label={`Copiar ${v.nome}`}
                      onClick={() => copiar(`{{${v.nome}}}`, onAviso)}
                    >
                      <IconePortal nome="copiar" tamanho={16} />
                    </button>
                  </div>
                  <p className="sub">{v.description}</p>
                </li>
              ))}
            </ul>
          )
        ) : userFiltered.length === 0 ? (
          <p className="sub bl-variables-empty">
            {user.length === 0
              ? 'Nenhuma variável de contexto neste fluxo ainda — crie uma em "Definir variável" ou na entrada de um bloco.'
              : 'Nenhuma variável encontrada.'}
          </p>
        ) : (
          <ul className="bl-variables-list">
            {userFiltered.map((nome) => (
              <li key={nome}>
                <div className="bl-variable-line">
                  <span className="bl-variable-name">{nome}</span>
                  <button
                    type="button"
                    className="iconbtn"
                    title="Copiar"
                    aria-label={`Copiar ${nome}`}
                    onClick={() => copiar(`{{${nome}}}`, onAviso)}
                  >
                    <IconePortal nome="copiar" tamanho={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FloatingSidebar>
  );
}
