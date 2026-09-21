import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Botao, Campo, Etiqueta } from '@pipe/ui';
import type { ContextoDoCanalWhatsapp, ContextoSemCanal } from './casca';
import { useLeitura } from '../../../../lib/consulta';
import { gravarPreferenciasWhatsapp } from '../../../../lib/canais-gravar';
import { emailsParaTexto, textoParaEmails, type PreferenciasDoCanal } from '../../../../lib/canais';
import { Interruptor } from '../../integracoes/interruptor';

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
  const contexto = useOutletContext<ContextoDoCanalWhatsapp | ContextoSemCanal>();
  const canalId = 'canal' in contexto ? contexto.canal.id : null;
  const leitura = useLeitura<PreferenciasDoCanal>(
    canalId ? `/v1/canais/whatsapp/${canalId}/preferencias` : null,
    { retry: false },
  );
  const [emailsTexto, setEmailsTexto] = useState('');
  const [tocado, setTocado] = useState(false);
  const [gravandoSwitch, setGravandoSwitch] = useState(false);
  const [gravandoEmails, setGravandoEmails] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (leitura.data && !tocado) setEmailsTexto(emailsParaTexto(leitura.data.alertaRecategorizacao.emails));
  }, [leitura.data, tocado]);

  if (canalId && leitura.error) {
    return <p role="alert" className="cb-typo-16">Não foi possível carregar os alertas: {leitura.error.message}</p>;
  }
  if (canalId && !leitura.data) return null;
  const preferencias = leitura.data ?? null;
  const semCanal = canalId === null;

  async function alternar(valor: boolean) {
    if (!canalId) return;
    setGravandoSwitch(true);
    setErro(null);
    const resultado = await gravarPreferenciasWhatsapp(canalId, {
      alertaRecategorizacao: { ativo: valor },
    });
    setGravandoSwitch(false);
    if (!resultado.ok) setErro(resultado.erro);
  }

  async function salvarEmails() {
    if (!canalId) return;
    setGravandoEmails(true);
    setErro(null);
    const resultado = await gravarPreferenciasWhatsapp(canalId, {
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
          ligado={preferencias?.alertaRecategorizacao.ativo ?? false}
          desabilitado={semCanal || gravandoSwitch}
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
          disabled={semCanal || gravandoEmails}
        />
      </label>
      <div className="cl-acoes">
        <Botao
          type="button"
          variante="primario"
          onClick={() => void salvarEmails()}
          disabled={semCanal || gravandoEmails}
        >
          {gravandoEmails ? 'Salvando…' : 'Salvar e-mails'}
        </Botao>
      </div>
    </div>
  );
}
