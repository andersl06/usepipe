import { useEffect, useState } from 'react';
import { CHAVES_DE_PREFERENCIA, readPreferences, type Preferences } from '../../lib/preferences';

/**
 * `Preferências` at `/preferences` has no measurable rendered reference because `~/desk-clone` leaves MFE `desk-preferences-mfe` blank. Structure follows reference `app.js` i18n (`"preferences":"Preferências","notifications":"Notificações"`) and `referencias-blip/pesquisa/blip-desk-preferencias.md`: immediate switches in sections, no Save button. Ponytail: confirm measurements when the reference screen is extracted. Copy replaces `Blip Desk` with `Pipe Desk`. The five preferences use separate browser keys and belong to this machine, not the person (`referencias-blip/pesquisa/blip-desk-medidas.md` §12).
 */
const SECTIONS: {
  titulo: string;
  itens: { key: keyof Preferences; rotulo: string; dica: string }[];
}[] = [
  {
    titulo: 'Notificações',
    itens: [
      {
        key: 'navegadorNotifications',
        rotulo: 'Notificações no navegador',
        dica: 'Permite que o navegador de internet utilizado no Desk envie notificações',
      },
      {
        key: 'ticketInQueueAlerta',
        rotulo: 'Alertas sonoros para novos tickets na fila',
        dica: 'Receba alertas sonoros quando novos tickets entrarem na fila de atendimento',
      },
      {
        key: 'alertaDeTicketAtribuido',
        rotulo: 'Alertas sonoros para novos tickets atribuídos',
        dica: 'Receba alertas sonoros quando novos tickets forem atribuídos a você',
      },
      {
        key: 'messageAlerta',
        rotulo: 'Alertas sonoros para novas mensagens',
        dica: 'Receba alertas sonoros quando novas mensagens forem recebidas',
      },
      {
        key: 'alertaWithAbaActive',
        rotulo: 'Alertas sonoros na aba ativa do navegador',
        dica: 'Receba alertas sonoros enquanto a aba do navegador estiver ativa',
      },
    ],
  },
  {
    titulo: 'Sessão',
    itens: [
      {
        key: 'continuarOnline',
        rotulo: 'Continuar online ao fechar o Pipe Desk',
        dica: 'Mantém o seu status ao fechar a janela; desliga a queda por inatividade',
      },
    ],
  },
  {
    titulo: 'Barra de tickets',
    itens: [
      {
        key: 'aberturaOrder',
        rotulo: 'Ver mensagens por ordem de abertura do ticket',
        dica: 'Desligado, as novas mensagens ficam no topo',
      },
    ],
  },
  {
    titulo: 'Corretor ortográfico',
    itens: [
      {
        key: 'corretorOrtografico',
        rotulo: 'Corretor ortográfico',
        dica: 'O corretor ortográfico pode levar alguns instantes para carregar, variando conforme o desempenho do seu computador',
      },
    ],
  },
];

export function PagePreferences() {
  const [prefs, setPrefs] = useState<Preferences>(() => readPreferences());

  useEffect(() => {
    try {
      for (const key of CHAVES_DE_PREFERENCIA)
        localStorage.setItem(`desk.pref.${key}`, prefs[key] ? '1' : '0');
    } catch {
      /* If storage is unavailable (for example, a private window), this preference applies only in the current tab. */
    }
  }, [prefs]);

  return (
    <div className="dk-prefs">
      <h2>Preferências</h2>
      {SECTIONS.map((s) => (
        <section key={s.titulo} className="dk-prefs-secao">
          <h3>{s.titulo}</h3>
          {s.itens.map((item) => (
            <label key={item.key} className="dk-prefs-item">
              <span>
                <b>{item.rotulo}</b>
                <small>{item.dica}</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={prefs[item.key]}
                onChange={(e) => setPrefs({ ...prefs, [item.key]: e.target.checked })}
              />
            </label>
          ))}
        </section>
      ))}
    </div>
  );
}
