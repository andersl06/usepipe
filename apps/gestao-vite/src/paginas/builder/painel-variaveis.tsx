import { useState } from 'react';
import { Campo } from '@pipe/ui';
import { IconePortal } from '../../componentes/icones-portal';
import type { Mapa } from './modelo';
import {
  VARIAVEIS_DO_SISTEMA,
  filtrarVariaveis,
  filtrarVariaveisDoSistema,
  variaveisDoUsuario,
} from './variaveis';

/**
 * A "Biblioteca de variáveis" (`$ctrl.openVarLib()`, ícone `library`) — painel
 * à ESQUERDA na origem (`library-sidebar`, `position-left`), diferente do
 * painel do bloco (`position-right`). Duas abas, `bds-tab-group`:
 * "Variáveis do sistema" e "Variáveis do usuário", cada uma com busca e uma
 * lista com botão de copiar por item — estrutura confirmada em `portal.js`
 * (`BuilderVariablesLibrary`).
 *
 * Sem o cadastro de variáveis da conta que a origem usa, "do usuário" aqui é
 * o que ESTE fluxo de fato referencia (`variaveisDoUsuario`, dado real do
 * desenho) e "do sistema" é a lista fixa das fontes com provedor no motor do
 * Pipe (`VARIAVEIS_DO_SISTEMA`, de `variaveis.ts` — ver o porquê lá).
 */

type Aba = 'sistema' | 'usuario';

function copiar(texto: string, onAviso: (texto: string) => void): void {
  void navigator.clipboard?.writeText(texto).then(
    () => onAviso('Variável copiada.'),
    () => onAviso(texto),
  );
}

export function PainelDeVariaveis({
  mapa,
  globais,
  onFechar,
  onAviso,
}: {
  mapa: Mapa;
  globais: Record<string, unknown>;
  onFechar: () => void;
  onAviso: (texto: string) => void;
}) {
  const [aba, setAba] = useState<Aba>('sistema');
  const [busca, setBusca] = useState('');
  const usuario = variaveisDoUsuario(mapa, globais);
  const sistemaFiltrado = filtrarVariaveisDoSistema(VARIAVEIS_DO_SISTEMA, busca);
  const usuarioFiltrado = filtrarVariaveis(usuario, busca);

  return (
    <aside className="bl-painel bl-painel--esquerda" aria-label="Biblioteca de variáveis">
      <div className="bl-painel-cabecalho">
        <button type="button" className="iconbtn" aria-label="Fechar" title="Fechar" onClick={onFechar}>
          <IconePortal nome="fechar" tamanho={20} />
        </button>
      </div>
      <hr className="bl-painel-fio" />
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
      <div className="bl-painel-corpo">
        <Campo
          value={busca}
          placeholder="Pesquisar variável"
          aria-label="Pesquisar variável"
          onChange={(e) => setBusca(e.target.value)}
        />
        {aba === 'sistema' ? (
          sistemaFiltrado.length === 0 ? (
            <p className="sub bl-variaveis-vazio">Nenhuma variável encontrada.</p>
          ) : (
            <ul className="bl-variaveis-lista">
              {sistemaFiltrado.map((v) => (
                <li key={v.nome}>
                  <div className="bl-variavel-linha">
                    <span className="bl-variavel-nome">{v.nome}</span>
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
                  <p className="sub">{v.descricao}</p>
                </li>
              ))}
            </ul>
          )
        ) : usuarioFiltrado.length === 0 ? (
          <p className="sub bl-variaveis-vazio">
            {usuario.length === 0
              ? 'Nenhuma variável de contexto neste fluxo ainda — crie uma em "Definir variável" ou na entrada de um bloco.'
              : 'Nenhuma variável encontrada.'}
          </p>
        ) : (
          <ul className="bl-variaveis-lista">
            {usuarioFiltrado.map((nome) => (
              <li key={nome}>
                <div className="bl-variavel-linha">
                  <span className="bl-variavel-nome">{nome}</span>
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
    </aside>
  );
}
