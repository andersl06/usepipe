'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { definirStatus } from '../app/acoes';
import type { EstadoAtendente, MotivoDePausa } from '../servidor/consultas';

/**
 * Status do atendente. Três escolhas manuais — Online, Pausa e Invisível; Offline é só
 * automático, por queda de conexão, e por isso não aparece como opção.
 *
 * Nenhum estado expira sozinho, e a pausa exige motivo da lista do gestor: cortar
 * sozinho joga conversa para quem foi ao banheiro.
 *
 * A DISPOSIÇÃO É A DELES (`docs/pesquisa/blip-desk-medidas.md`, §3): o bloco de
 * estado é a segunda faixa da coluna de atendimentos, com altura mínima de
 * 111px, linha de 1px em cima e embaixo, e o conteúdo centrado em duas linhas —
 * a frase "Seu status é X" com o estado destacado, e um botão de 40px embaixo.
 * O `--sidenav-header-min-height` deles é um token nomeado, e aqui também.
 *
 * O diálogo é um só: o botão desta faixa e o avatar do rodapé do trilho abrem o
 * mesmo elemento por `id`, como o de encerramento já faz.
 */

const ROTULO: Record<EstadoAtendente, string> = {
  online: 'Online',
  pausa: 'Pausa',
  invisivel: 'Invisível',
  offline: 'Offline',
};

export const ID_DIALOGO_STATUS = 'dialogo-status';

export function abrirDialogoStatus(): void {
  const elemento = document.getElementById(ID_DIALOGO_STATUS);
  if (elemento instanceof HTMLDialogElement) elemento.showModal();
}

/**
 * Avatar do rodapé do trilho, com o ponto do estado. Mesmo gesto do avatar
 * deles: o estado é da pessoa, e o ponto mora nela.
 */
export function BotaoDeStatus({
  titulo,
  cor,
  iniciais,
  nome,
}: {
  titulo: string;
  cor: string;
  iniciais: string;
  nome: string;
}) {
  return (
    <button
      type="button"
      className="trilho-eu"
      title={titulo}
      aria-label={`${nome}. ${titulo}. Trocar status`}
      onClick={abrirDialogoStatus}
      style={{ ['--estado-cor' as string]: cor }}
    >
      {iniciais}
    </button>
  );
}

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

  const descricao =
    estado === 'pausa' && motivoPausa ? `Pausa · ${motivoPausa}` : ROTULO[estado];

  return (
    <div className="bloco-status">
      <p className="frase">
        Seu status é <b data-estado={estado}>{descricao}</b>
      </p>
      <button
        type="button"
        className="btn"
        onClick={() => {
          setEscolhido(estado);
          dialogo.current?.showModal();
        }}
      >
        Trocar status
      </button>
      <p className="quem">{nome}</p>

      {/* Ao fechar, a escolha volta ao estado real: o avatar do trilho abre este
          mesmo diálogo sem passar pelo botão daqui, e sem isto ele reabriria
          com a opção que a pessoa marcou e desistiu de salvar. */}
      <dialog
        id={ID_DIALOGO_STATUS}
        ref={dialogo}
        aria-label="Alterar status"
        onClose={() => setEscolhido(estado)}
      >
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
