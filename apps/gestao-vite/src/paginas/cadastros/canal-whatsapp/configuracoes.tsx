import { useState } from 'react';
import { Etiqueta } from '@pipe/ui';
import { useCanalWhatsapp } from './casca';
import { useLeitura } from '../../../lib/consulta';
import { gravarPreferenciasWhatsapp } from '../../../lib/canais-gravar';
import type { PreferenciasDoCanal } from '../../../lib/canais';
import { Interruptor } from '../../fluxo/integracoes/interruptor';

/**
 * Configurações — `FICHA-canal-whatsapp.md` §3: Quick reply e Menu, cada um
 * um `bds-switch` que "parece persistir a alteração diretamente" — sem botão
 * de salvar, o toggle já grava (`gravarPreferenciasWhatsapp`).
 */
export function AbaConfiguracoes() {
  const { canal } = useCanalWhatsapp();
  const leitura = useLeitura<PreferenciasDoCanal>(`/v1/canais/whatsapp/${canal.id}/preferencias`);
  const [gravando, setGravando] = useState<'quickReply' | 'menu' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  if (!leitura.data) return null;
  const preferencias = leitura.data;

  async function alternar(campo: 'quickReply' | 'menu', valor: boolean) {
    setGravando(campo);
    setErro(null);
    const resultado = await gravarPreferenciasWhatsapp(canal.id, { [campo]: valor });
    setGravando(null);
    if (!resultado.ok) setErro(resultado.erro);
  }

  return (
    <div>
      <p className="sub" style={{ marginTop: 0 }}>
        Configure as funcionalidades disponíveis para o seu chatbot no WhatsApp:
      </p>

      {erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}

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
          ligado={preferencias.quickReply}
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
          ligado={preferencias.menu}
          desabilitado={gravando === 'menu'}
          rotulo="Menu"
          aoMudar={(v) => void alternar('menu', v)}
        />
      </div>
    </div>
  );
}
