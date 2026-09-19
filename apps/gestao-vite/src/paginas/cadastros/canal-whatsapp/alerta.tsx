import { useEffect, useState } from 'react';
import { Botao, Campo, Etiqueta } from '@pipe/ui';
import { useCanalWhatsapp } from './casca';
import { useLeitura } from '../../../lib/consulta';
import { gravarPreferenciasWhatsapp } from '../../../lib/canais-gravar';
import { emailsParaTexto, textoParaEmails, type PreferenciasDoCanal } from '../../../lib/canais';
import { Interruptor } from '../../fluxo/integracoes/interruptor';

/**
 * Configurações de alerta — `FICHA-canal-whatsapp.md` §4: o switch liga/
 * desliga na hora, como em Configurações; o campo de e-mails (texto livre,
 * "separados por vírgula") tem "Salvar" próprio — diferente do switch, digitar
 * e perder foco não é o momento de gravar.
 */
export function AbaAlerta() {
  const { canal } = useCanalWhatsapp();
  const leitura = useLeitura<PreferenciasDoCanal>(`/v1/canais/whatsapp/${canal.id}/preferencias`);
  const [emailsTexto, setEmailsTexto] = useState('');
  const [tocado, setTocado] = useState(false);
  const [gravandoSwitch, setGravandoSwitch] = useState(false);
  const [gravandoEmails, setGravandoEmails] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (leitura.data && !tocado) setEmailsTexto(emailsParaTexto(leitura.data.alertaRecategorizacao.emails));
  }, [leitura.data, tocado]);

  if (!leitura.data) return null;
  const preferencias = leitura.data;

  async function alternar(valor: boolean) {
    setGravandoSwitch(true);
    setErro(null);
    const resultado = await gravarPreferenciasWhatsapp(canal.id, {
      alertaRecategorizacao: { ativo: valor },
    });
    setGravandoSwitch(false);
    if (!resultado.ok) setErro(resultado.erro);
  }

  async function salvarEmails() {
    setGravandoEmails(true);
    setErro(null);
    const resultado = await gravarPreferenciasWhatsapp(canal.id, {
      alertaRecategorizacao: { emails: textoParaEmails(emailsTexto) },
    });
    setGravandoEmails(false);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    setTocado(false);
    setEmailsTexto(emailsParaTexto(resultado.valor.alertaRecategorizacao.emails));
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Configurações de alerta</h3>
      <p className="sub">Defina quais eventos da plataforma podem gerar alertas para sua equipe</p>

      {erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}

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
          ligado={preferencias.alertaRecategorizacao.ativo}
          desabilitado={gravandoSwitch}
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
          disabled={gravandoEmails}
        />
      </label>
      <div className="cl-acoes">
        <Botao type="button" variante="primario" onClick={() => void salvarEmails()} disabled={gravandoEmails}>
          {gravandoEmails ? 'Salvando…' : 'Salvar e-mails'}
        </Botao>
      </div>
    </div>
  );
}
