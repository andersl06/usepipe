import { useEffect, useState } from 'react';
import { CHAVES_DE_PREFERENCIA, lerPreferencias, type Preferencias } from '../../lib/preferencias';

/**
 * "Preferências" — `/preferences`. A cópia em `~/desk-clone` não renderiza o
 * MFE `desk-preferences-mfe` (a página fica em branco), então NÃO há foto de
 * régua: a estrutura vem do i18n do pacote da referência (`app.js`, bloco
 * `"preferences":"Preferências","notifications":"Notificações",…`) e de
 * `referencias-blip/pesquisa/blip-desk-preferencias.md` — uma lista de seções com
 * interruptores, sem botão "Salvar" (cada um vale na hora).
 *
 * ponytail: medidas a conferir quando a tela da referência for extraída
 * (pedido no relatório). Os textos são os deles, com "Blip Desk" → "Pipe Desk".
 *
 * As cinco preferências vivem no navegador, uma chave por preferência: são
 * da MÁQUINA em que a pessoa está, não da pessoa (`referencias-blip/pesquisa/blip-desk-medidas.md` §12).
 */
const SECOES: {
  titulo: string;
  itens: { chave: keyof Preferencias; rotulo: string; dica: string }[];
}[] = [
  {
    titulo: 'Notificações',
    itens: [
      {
        chave: 'notificacoesDoNavegador',
        rotulo: 'Notificações no navegador',
        dica: 'Permite que o navegador de internet utilizado no Desk envie notificações',
      },
      {
        chave: 'alertaDeTicketNaFila',
        rotulo: 'Alertas sonoros para novos tickets na fila',
        dica: 'Receba alertas sonoros quando novos tickets entrarem na fila de atendimento',
      },
      {
        chave: 'alertaDeTicketAtribuido',
        rotulo: 'Alertas sonoros para novos tickets atribuídos',
        dica: 'Receba alertas sonoros quando novos tickets forem atribuídos a você',
      },
      {
        chave: 'alertaDeMensagem',
        rotulo: 'Alertas sonoros para novas mensagens',
        dica: 'Receba alertas sonoros quando novas mensagens forem recebidas',
      },
      {
        chave: 'alertaComAbaAtiva',
        rotulo: 'Alertas sonoros na aba ativa do navegador',
        dica: 'Receba alertas sonoros enquanto a aba do navegador estiver ativa',
      },
    ],
  },
  {
    titulo: 'Sessão',
    itens: [
      {
        chave: 'continuarOnline',
        rotulo: 'Continuar online ao fechar o Pipe Desk',
        dica: 'Mantém o seu status ao fechar a janela; desliga a queda por inatividade',
      },
    ],
  },
  {
    titulo: 'Barra de tickets',
    itens: [
      {
        chave: 'ordemDeAbertura',
        rotulo: 'Ver mensagens por ordem de abertura do ticket',
        dica: 'Desligado, as novas mensagens ficam no topo',
      },
    ],
  },
  {
    titulo: 'Corretor ortográfico',
    itens: [
      {
        chave: 'corretorOrtografico',
        rotulo: 'Corretor ortográfico',
        dica: 'O corretor ortográfico pode levar alguns instantes para carregar, variando conforme o desempenho do seu computador',
      },
    ],
  },
];

export function PaginaPreferencias() {
  const [prefs, setPrefs] = useState<Preferencias>(() => lerPreferencias());

  useEffect(() => {
    try {
      for (const chave of CHAVES_DE_PREFERENCIA)
        localStorage.setItem(`desk.pref.${chave}`, prefs[chave] ? '1' : '0');
    } catch {
      /* sem armazenamento (janela privada): a preferência vale só nesta aba */
    }
  }, [prefs]);

  return (
    <div className="dk-prefs">
      <h2>Preferências</h2>
      {SECOES.map((s) => (
        <section key={s.titulo} className="dk-prefs-secao">
          <h3>{s.titulo}</h3>
          {s.itens.map((item) => (
            <label key={item.chave} className="dk-prefs-item">
              <span>
                <b>{item.rotulo}</b>
                <small>{item.dica}</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={prefs[item.chave]}
                onChange={(e) => setPrefs({ ...prefs, [item.chave]: e.target.checked })}
              />
            </label>
          ))}
        </section>
      ))}
    </div>
  );
}
