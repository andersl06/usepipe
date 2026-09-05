'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { definirStatus } from '../app/acoes';
import { COR_DO_ESTADO } from './trilho';
import type { EstadoAtendente, MotivoDePausa } from '../servidor/consultas';

/**
 * Status do atendente. Três escolhas manuais — Online, Pausa e Invisível; Offline é só
 * automático, por queda de conexão, e por isso não aparece como opção.
 *
 * Nenhum estado expira sozinho, e a pausa exige motivo da lista do gestor: cortar
 * sozinho joga conversa para quem foi ao banheiro.
 */

const ROTULO: Record<EstadoAtendente, string> = {
  online: 'Online',
  pausa: 'Pausa',
  invisivel: 'Invisível',
  offline: 'Offline',
};

export function BarraStatus({
  nome,
  estado,
  motivoPausa,
  motivos,
}: {
  nome: string;
  estado: EstadoAtendente;
  motivoPausa: string | null;
  motivos: MotivoDePausa[];
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [escolhido, setEscolhido] = useState<EstadoAtendente>(estado);
  const [resultado, enviar, enviando] = useActionState(definirStatus, { ok: true });

  useEffect(() => {
    if (resultado.ok) dialogo.current?.close();
  }, [resultado]);

  const descricao = estado === 'pausa' && motivoPausa ? `Pausa — ${motivoPausa}` : ROTULO[estado];

  return (
    <div className="status-bar">
      <span className="dot" style={{ ['--estado-cor' as string]: COR_DO_ESTADO[estado] }} />
      <span className="who">
        <b>{nome}</b> · {descricao}
      </span>
      <button
        type="button"
        className="trocar"
        onClick={() => {
          setEscolhido(estado);
          dialogo.current?.showModal();
        }}
      >
        Trocar status
      </button>

      <dialog ref={dialogo} aria-label="Alterar status">
        <form action={enviar}>
          <h4>Seu status</h4>
          <p>Só quem está Online entra na distribuição. Nenhum status expira sozinho.</p>

          <div className="opcoes">
            {(['online', 'pausa', 'invisivel'] as const).map((opcao) => (
              <label className="opcao" key={opcao}>
                <input
                  type="radio"
                  name="estado"
                  value={opcao}
                  checked={escolhido === opcao}
                  onChange={() => setEscolhido(opcao)}
                />
                {ROTULO[opcao]}
              </label>
            ))}
          </div>

          {escolhido === 'pausa' ? (
            <div className="opcoes">
              <span className="lbl">Motivo da pausa (obrigatório)</span>
              {motivos.map((motivo) => (
                <label className="opcao" key={motivo.id}>
                  <input type="radio" name="motivoId" value={motivo.id} required />
                  {motivo.nome}
                  {motivo.duracaoSugeridaMin ? (
                    <span className="sug">sugerido {motivo.duracaoSugeridaMin}min</span>
                  ) : null}
                </label>
              ))}
            </div>
          ) : null}

          {resultado.erro ? <p className="erro">{resultado.erro}</p> : null}

          <div className="rodape">
            <button
              type="button"
              className="btn"
              onClick={() => dialogo.current?.close()}
              disabled={enviando}
            >
              Cancelar
            </button>
            <button type="submit" className="btn primary" disabled={enviando}>
              {enviando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
