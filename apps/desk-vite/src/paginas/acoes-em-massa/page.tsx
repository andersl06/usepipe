import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FilaDoDesk } from '@pipe/contracts';
import { useLeitura } from '../../lib/consulta';
import { executar } from '../../lib/acoes';
import { numeroDoTicket } from '../../lib/canal';
import { nomeDeExibicao } from '../../lib/ordem';

/**
 * "Ações em Massa" — `/bulk-ticket`, a transferência em lote da referência
 * (`~/desk-clone/clone/index.html`, seção `bulk`, foto
 * `desk2/blip-clone-bulk.png`): título 20/400, cartão com o campo "Chatbot"
 * e a ficha "Transferir"; à esquerda "Selecionar todos" e a lista dos
 * atendimentos abertos (ou "Nenhum atendimento aberto para transferir.");
 * à direita "Transferir para:", os rádios Fila / Atendente e os dois
 * seletores; "Cancelar" / "Transferir" no rodapé.
 *
 * A ação `transferirEmMassa` repete `transferirConversa` por ticket — a
 * mesma regra da referência (transferir encerra e abre outro).
 */
export function PaginaAcoesEmMassa() {
  const navegar = useNavigate();
  const fila = useLeitura<FilaDoDesk>('/v1/desk/fila');
  const filas = useLeitura<{ filas: { id: string; nome: string }[] }>('/v1/desk/filas');
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [alvo, setAlvo] = useState<'fila' | 'atendente'>('fila');
  const [filaId, setFilaId] = useState('');
  const [atendenteId, setAtendenteId] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const conversas = fila.data?.conversas ?? [];
  const todas = conversas.length > 0 && conversas.every((c) => marcadas.has(c.id));

  function alternar(id: string) {
    const novo = new Set(marcadas);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    setMarcadas(novo);
  }

  async function transferir() {
    setEnviando(true);
    setErro(null);
    setAviso(null);
    const r = (await executar('transferirEmMassa', {
      conversaId: [...marcadas],
      ...(alvo === 'fila' ? { paraFilaId: filaId } : { paraAtendenteId: atendenteId }),
    })) as { ok: boolean; erro?: string; transferidas?: number };
    setEnviando(false);
    if (!r.ok) setErro(r.erro ?? 'Falha ao transferir.');
    else {
      setAviso(`${r.transferidas ?? 0} ticket(s) transferido(s)${r.erro ? ` — ${r.erro}` : ''}.`);
      setMarcadas(new Set());
    }
  }

  const podeTransferir =
    marcadas.size > 0 && (alvo === 'fila' ? Boolean(filaId) : Boolean(atendenteId));

  return (
    <div className="dk-massa">
      <h2>Ações em Massa</h2>
      <div className="dk-massa-cartao">
        <div className="dk-massa-linha">
          <div className="dk-campo-flutuante" style={{ width: 420 }}>
            <span>Chatbot</span>
            <b>
              {/* ponytail: um chatbot por conta na referência; aqui a conta inteira. */}Todos os
              canais
            </b>
          </div>
          <div style={{ flex: 1 }} />
          <span className="dk-chip dk-chip-info">Transferir</span>
        </div>
        <div className="dk-massa-colunas">
          <div className="dk-massa-coluna">
            <label className="dk-massa-check">
              <input
                type="checkbox"
                checked={todas}
                onChange={() =>
                  setMarcadas(todas ? new Set() : new Set(conversas.map((c) => c.id)))
                }
              />{' '}
              Selecionar todos
            </label>
            <div className="dk-massa-lista">
              {conversas.length === 0 ? (
                <div className="dk-massa-vazio">Nenhum atendimento aberto para transferir.</div>
              ) : (
                conversas.map((c) => (
                  <label key={c.id} className="dk-massa-item">
                    <input
                      type="checkbox"
                      checked={marcadas.has(c.id)}
                      onChange={() => alternar(c.id)}
                    />{' '}
                    {numeroDoTicket(c.id)} — {nomeDeExibicao(c)}{' '}
                    <span className="dk-massa-vazio">({c.filaNome ?? 'Transferência direta'})</span>
                  </label>
                ))
              )}
            </div>
          </div>
          <div className="dk-massa-coluna">
            <h4>Transferir para:</h4>
            <div className="dk-massa-radios">
              <label>
                <input
                  type="radio"
                  name="alvo"
                  checked={alvo === 'fila'}
                  onChange={() => setAlvo('fila')}
                />{' '}
                Fila
              </label>
              <label>
                <input
                  type="radio"
                  name="alvo"
                  checked={alvo === 'atendente'}
                  onChange={() => setAlvo('atendente')}
                />{' '}
                Atendente
              </label>
            </div>
            <label className="dk-campo-flutuante">
              <span>Fila</span>
              <select
                value={filaId}
                onChange={(e) => setFilaId(e.target.value)}
                disabled={alvo !== 'fila'}
              >
                <option value="">Selecionar fila</option>
                {filas.data?.filas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="dk-campo-flutuante">
              <span>Atendente</span>
              <select
                value={atendenteId}
                onChange={(e) => setAtendenteId(e.target.value)}
                disabled={alvo !== 'atendente'}
              >
                <option value="">Selecionar atendente</option>
                {fila.data?.colegas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            {erro ? <p className="dk-erro">{erro}</p> : null}
            {aviso ? <p>{aviso}</p> : null}
          </div>
        </div>
        <div className="dk-massa-pe">
          <button
            type="button"
            className="dk-botao dk-botao-secundario dk-botao-curto"
            onClick={() => navegar('/')}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="dk-botao dk-botao-curto"
            id="bulk-transferir"
            disabled={!podeTransferir || enviando}
            onClick={() => void transferir()}
          >
            Transferir
          </button>
        </div>
      </div>
    </div>
  );
}
