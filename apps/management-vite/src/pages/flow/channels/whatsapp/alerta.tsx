import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Botao, Campo, Etiqueta } from '@pipe/ui';
import type { ChannelWhatsappContext, ContextWithoutChannel } from './shell';
import { useRead } from '../../../../lib/query';
import { savePreferencesWhatsapp } from '../../../../lib/channels-gravar';
import { emailsParaTexto, textoParaEmails, type ChannelPreferences } from '../../../../lib/channels';
import { Interruptor } from '../../integrations/interruptor';

/**
 * Configurações de alerta — `FICHA-canal-whatsapp.md` §4: o switch liga/
 * desliga na hora, como em Configurações; o campo de e-mails (texto livre,
 * "separados por vírgula") tem "Salvar" próprio — diferente do switch, digitar
 * e perder foco não é o momento de gravar.
 *
 * A aba aparece também SEM número (foto `08` da ficha do canal), mas a origem
 * não mostra o que ela faz nesse estado (`FICHA-conectar-canal-no-bot.md`
 * §5). Aqui, sem canal, os controles ficam desabilitados — a forma, sem
 * inventar o comportamento.
 */
export function AbaAlerta() {
  const context = useOutletContext<ChannelWhatsappContext | ContextWithoutChannel>();
  const channelId = 'canal' in context ? context.channel.id : null;
  const read = useRead<ChannelPreferences>(
    channelId ? `/v1/channels/whatsapp/${channelId}/preferences` : null,
    { retry: false },
  );
  const [emailsTexto, setEmailsTexto] = useState('');
  const [tocado, setTocado] = useState(false);
  const [gravandoSwitch, setGravandoSwitch] = useState(false);
  const [gravandoEmails, setGravandoEmails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (read.data && !tocado) setEmailsTexto(emailsParaTexto(read.data.alertRecategorization.emails));
  }, [read.data, tocado]);

  if (channelId && read.error) {
    return <p role="alert" className="cb-typo-16">Não foi possível carregar os alertas: {read.error.message}</p>;
  }
  if (channelId && !read.data) return null;
  const preferences = read.data ?? null;
  const withoutChannel = channelId === null;

  async function alternar(value: boolean) {
    if (!channelId) return;
    setGravandoSwitch(true);
    setError(null);
    const resultado = await savePreferencesWhatsapp(channelId, {
      alertRecategorization: { ativo: value },
    });
    setGravandoSwitch(false);
    if (!resultado.ok) setError(resultado.error);
  }

  async function salvarEmails() {
    if (!channelId) return;
    setGravandoEmails(true);
    setError(null);
    const resultado = await savePreferencesWhatsapp(channelId, {
      alertRecategorization: { emails: textoParaEmails(emailsTexto) },
    });
    setGravandoEmails(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setTocado(false);
    setEmailsTexto(emailsParaTexto(resultado.value.alertRecategorization.emails));
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Configurações de alerta</h3>
      <p className="sub">Defina quais eventos da plataforma podem gerar alertas para sua equipe</p>

      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}

      <div className="cw-linha-config">
        <div className="cw-linha-config-texto">
          <h4>Alertas de recategorização de modelos</h4>
          <p>
            Insira e-mails de pessoas específicas para criar uma lista exclusiva de notificação. Se
            nenhum e-mail for informado, todos os administradores do fluxo serão notificados sobre a
            recategorização.
          </p>
        </div>
        <Interruptor
          id="cw-alerta-recategorizacao"
          ligado={preferences?.alertRecategorization.ativo ?? false}
          desabilitado={withoutChannel || gravandoSwitch}
          rotulo="Alertas de recategorização de modelos"
          aoMudar={(v) => void alternar(v)}
        />
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: 'var(--p-e-3)' }}>
        <span className="sub">E-mails de destino</span>
        <Campo
          value={emailsTexto}
          onChange={(e) => {
            setEmailsTexto(e.target.value);
            setTocado(true);
          }}
          placeholder="Insira os e-mails separados por vírgula"
          disabled={withoutChannel || gravandoEmails}
        />
      </label>
      <div className="cl-acoes">
        <Botao
          type="button"
          variante="primario"
          onClick={() => void salvarEmails()}
          disabled={withoutChannel || gravandoEmails}
        >
          {gravandoEmails ? 'Salvando…' : 'Salvar e-mails'}
        </Botao>
      </div>
    </div>
  );
}
