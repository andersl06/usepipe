'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  comoTexto,
  EVENTO_PREFERENCIA,
  lerValor,
  nomeDaChave,
  PREFERENCIAS,
  secoes,
} from '../lib/preferencias';
import type { ChaveDePreferencia } from '../lib/preferencias';

/**
 * A aba de Preferências, na anatomia da tela de referência
 * (`docs/pesquisa/blip-desk-preferencias.md`): seções empilhadas, um
 * interruptor por linha, **salvamento imediato e sem botão "Salvar"**. A ordem
 * das seções e os rótulos são os deles.
 *
 * Onde ela mora: dentro do diálogo que o item "Preferências" do rodapé do
 * trilho já abria. Lá é um painel de aba; aqui é o `<dialog>` que o status e o
 * encerramento também usam. Mesmo gesto — item do rodapé, painel de
 * configuração —, e ninguém sai da conversa para trocar um interruptor.
 */

/** Lê e grava uma preferência, e reage quando outra tela da mesma aba a muda. */
export function usePreferencia(chave: ChaveDePreferencia): [boolean, (v: boolean) => void] {
  // Começa no padrão em vez de ler `localStorage` direto: o primeiro desenho
  // acontece no servidor, onde `window` não existe, e ler aqui faria o cliente
  // desenhar diferente do servidor no primeiro quadro.
  const [valor, setValor] = useState(() => lerValor(chave, null));

  const reler = useCallback(() => {
    try {
      setValor(lerValor(chave, window.localStorage.getItem(nomeDaChave(chave))));
    } catch {
      // Navegador com armazenamento bloqueado (janela anônima, política de
      // empresa). Fica no padrão em vez de derrubar a tela.
    }
  }, [chave]);

  useEffect(() => {
    reler();
    // `storage` cobre a outra ABA do navegador; o evento próprio cobre os
    // outros componentes DESTA aba, que o `storage` não notifica.
    window.addEventListener(EVENTO_PREFERENCIA, reler);
    window.addEventListener('storage', reler);
    return () => {
      window.removeEventListener(EVENTO_PREFERENCIA, reler);
      window.removeEventListener('storage', reler);
    };
  }, [reler]);

  const gravar = useCallback(
    (novo: boolean) => {
      setValor(novo);
      try {
        window.localStorage.setItem(nomeDaChave(chave), comoTexto(novo));
      } catch {
        // Não deu para guardar: a escolha vale para esta sessão e pronto.
      }
      window.dispatchEvent(new Event(EVENTO_PREFERENCIA));
    },
    [chave],
  );

  return [valor, gravar];
}

/**
 * Pede a permissão de notificação ao ligar o interruptor.
 *
 * O navegador só abre o pedido a partir de um clique, e só uma vez: **negada,
 * ela não pode mais ser pedida por código**. Daí a frase que a referência usa,
 * repetida aqui — a saída passa a ser o cadeado da barra de endereço, e sem
 * dizer isso o atendente fica clicando num interruptor que não liga.
 */
function LinhaDeNotificacao() {
  const [ligada, gravar] = usePreferencia('notificacaoNavegador');
  const [permissao, setPermissao] = useState<NotificationPermission | 'indisponivel'>(
    'indisponivel',
  );

  useEffect(() => {
    setPermissao(typeof Notification === 'undefined' ? 'indisponivel' : Notification.permission);
  }, []);

  async function alternar(quer: boolean): Promise<void> {
    if (!quer) {
      gravar(false);
      return;
    }
    if (typeof Notification === 'undefined') return;
    const resposta =
      Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
    setPermissao(resposta);
    gravar(resposta === 'granted');
  }

  const bloqueada = permissao === 'denied';
  const semSuporte = permissao === 'indisponivel';

  return (
    <>
      <label className="preferencia">
        <span>
          Notificações do navegador
          <small>Avisa fora da aba do Desk. Precisa da permissão do navegador.</small>
        </span>
        <input
          type="checkbox"
          checked={ligada}
          disabled={bloqueada || semSuporte}
          onChange={(e) => void alternar(e.target.checked)}
        />
      </label>
      {bloqueada ? (
        <p className="pref-aviso">
          Habilite o envio de notificações clicando no ícone de cadeado na barra de endereço do
          seu navegador.
        </p>
      ) : null}
    </>
  );
}

function Linha({ chave }: { chave: ChaveDePreferencia }) {
  const definicao = PREFERENCIAS.find((p) => p.chave === chave);
  const [ligada, gravar] = usePreferencia(chave);
  if (!definicao) return null;

  return (
    <label className="preferencia">
      <span>
        {definicao.rotulo}
        <small>{definicao.ajuda}</small>
      </span>
      <input type="checkbox" checked={ligada} onChange={(e) => gravar(e.target.checked)} />
    </label>
  );
}

export function Preferencias() {
  return (
    <div className="preferencias">
      {secoes().map((secao) => (
        <div className="pref-secao" key={secao}>
          <span className="lbl">{secao}</span>
          {secao === 'Alertas sonoros' ? (
            <p className="pref-aviso">O som está ativado no seu navegador?</p>
          ) : null}
          {PREFERENCIAS.filter((p) => p.secao === secao).map((p) =>
            p.chave === 'notificacaoNavegador' ? (
              <LinhaDeNotificacao key={p.chave} />
            ) : (
              <Linha key={p.chave} chave={p.chave} />
            ),
          )}
        </div>
      ))}
    </div>
  );
}
