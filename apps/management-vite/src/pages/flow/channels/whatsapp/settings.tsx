import { useState } from 'react';
import { Etiqueta } from '@pipe/ui';
import { useChannelWhatsapp } from './shell';
import { useRead } from '../../../../lib/query';
import { savePreferencesWhatsapp } from '../../../../lib/channels-gravar';
import type { ChannelPreferences } from '../../../../lib/channels';
import { Interruptor } from '../../integrations/interruptor';

/**
 * Configurações — `FICHA-canal-whatsapp.md` §3: Quick reply e Menu, cada um
 * um `bds-switch` que "parece persistir a alteração diretamente" — sem botão
 * de salvar, o toggle já grava (`gravarPreferenciasWhatsapp`). O canal é o do
 * bot (`useCanalWhatsapp`).
 */
export function AbaSettings() {
  const { channel } = useChannelWhatsapp();
  const read = useRead<ChannelPreferences>(`/v1/channels/whatsapp/${channel.id}/preferences`, { retry: false });
  const [gravando, setGravando] = useState<'quickReply' | 'menu' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (read.error) return <p role="alert" className="cb-typo-16">Não foi possível carregar as configurações: {read.error.message}</p>;
  if (!read.data) return null;
  const preferences = read.data;

  async function alternar(campo: 'quickReply' | 'menu', value: boolean) {
    setGravando(campo);
    setError(null);
    const resultado = await savePreferencesWhatsapp(channel.id, { [campo]: value });
    setGravando(null);
    if (!resultado.ok) setError(resultado.error);
  }

  return (
    <div>
      <p className="sub" style={{ marginTop: 0 }}>
        Configure as funcionalidades disponíveis para o seu chatbot no WhatsApp:
      </p>

      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}

      <div className="cw-linha-config">
        <div className="cw-linha-config-texto">
          <h4>Quick reply</h4>
          <p>
            Utilize o componente de quick reply para até 3 opções de respostas rápidas. A exibição
            de componentes com 4 ou mais opções de respostas continuará sendo feita em formato de
            texto.
          </p>
        </div>
        <Interruptor
          id="cw-quick-reply"
          ligado={preferences.quickReply}
          desabilitado={gravando === 'quickReply'}
          rotulo="Quick reply"
          aoMudar={(v) => void alternar('quickReply', v)}
        />
      </div>

      <div className="cw-linha-config">
        <div className="cw-linha-config-texto">
          <h4>Menu</h4>
          <p>
            Utilize no máximo 10 opções com o componente de menu. Com 11 ou mais opções, o conteúdo
            do componente será exibido em formato de texto.
          </p>
        </div>
        <Interruptor
          id="cw-menu"
          ligado={preferences.menu}
          desabilitado={gravando === 'menu'}
          rotulo="Menu"
          aoMudar={(v) => void alternar('menu', v)}
        />
      </div>
    </div>
  );
}
