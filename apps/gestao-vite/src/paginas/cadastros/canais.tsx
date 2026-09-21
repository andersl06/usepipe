import { useState } from 'react';
import { Icone } from '@pipe/ui';
import { useLeitura } from '../../lib/consulta';
import type { CanalDetalhado } from '../../lib/configuracoes';
import { numero } from '../../lib/formato';
import { IconeGestao } from '../../componentes/icones-gestao';
import { ConectarWhatsApp } from '../../componentes/cadastro-embutido-whatsapp';
import { ConectarInstagramManual, ConectarMessengerManual, ConectarWhatsappManual } from './canal-conectar-manual';
import { desconectarInstagram, desconectarMessenger, desconectarWhatsapp } from '../../lib/canais-gravar';
import { useContato } from '../fluxo/contato';
import { baseDoAtendimento } from '../operacao/casca';
import Link from '../../componentes/link';
import { ModalConfirmacao } from './_modal';

const ROTULO_TIPO: Record<string, string> = {
  whatsapp_cloud: 'WhatsApp',
  instagram: 'Instagram',
  messenger: 'Facebook Messenger',
  email: 'E-mail',
  widget: 'Site',
};

/**
 * Canais de atendimento — `attendance/desk/channels` da origem
 * (`FICHA-channels.md`): título sem subtítulo nem botão, e uma GRADE de
 * cartões (`bds-grid direction="row"`, `bds-paper` de 242×292), cada um com
 * ícone, título 16/700, subtítulo 14/400 e um botão no pé — "Conectado"
 * (terciário, com o `checkball`) ou "Conectar" (primário, com a seta).
 *
 * O desalinhamento de dado fica registrado: lá é um CATÁLOGO fixo de
 * integrações (Pipe Desk, Salesforce, Salesforce MIAW, Canal Personalizado);
 * aqui cada cartão é um canal REAL já conectado, com as caixas de entrada e
 * a fila padrão de cada uma no subtítulo — dado que a tela deles não tem e
 * que não pode sumir. Os dois últimos cartões são "Conectar": WhatsApp
 * (cadastro embutido OU manual — item da tarefa "ligar canais") e Instagram
 * (só manual, mesmo backend de `POST /v1/canais/instagram/manual`).
 *
 * WhatsApp ganhou link "Detalhes" para as abas do canal
 * (`canal-whatsapp/casca.tsx`) e "Desconectar" (`DELETE /v1/canais/
 * whatsapp/:id`) sem `window.confirm` — `ModalConfirmacao`, como em
 * `regras-atendimento.tsx`. Instagram só tem "Desconectar": não tem tela de
 * abas própria ainda (perfil/preferências/modelos são só do WhatsApp na
 * `api`).
 */
export function PaginaCanais() {
  const leitura = useLeitura<CanalDetalhado[]>('/v1/gestao/canais');
  const { contato } = useContato();
  const base = baseDoAtendimento(contato.tipo, contato.id);
  const [paraDesconectar, setParaDesconectar] = useState<CanalDetalhado | null>(null);
  const [desconectando, setDesconectando] = useState(false);
  const [erroDesconectar, setErroDesconectar] = useState<string | null>(null);

  if (!leitura.data) return null;
  const canais = leitura.data;

  async function confirmarDesconexao() {
    if (!paraDesconectar) return;
    setDesconectando(true);
    setErroDesconectar(null);
    const resultado =
      paraDesconectar.tipo === 'instagram'
        ? await desconectarInstagram(paraDesconectar.id)
        : paraDesconectar.tipo === 'messenger' ? await desconectarMessenger(paraDesconectar.id)
        : await desconectarWhatsapp(paraDesconectar.id);
    setDesconectando(false);
    if (!resultado.ok) {
      setErroDesconectar(resultado.erro);
      return;
    }
    setParaDesconectar(null);
  }

  return (
    <>
      <div className="board-head">
        <h2>Canais de atendimento</h2>
      </div>

      <div className="canais-grade">
        {canais.map((c) => (
          <section className="canal-cartao" key={c.id}>
            <span className="canal-icone" aria-hidden="true">
              <Icone nome="balao" tamanho={40} />
            </span>
            <h3>{c.nome}</h3>
            <p>
              {ROTULO_TIPO[c.tipo] ?? c.tipo}
              {c.caixas.length === 0
                ? ' · sem caixa de entrada'
                : c.caixas.map(
                    (cx) =>
                      ` · ${cx.nome}: ${cx.filaPadrao ?? 'sem fila padrão'} (${numero(cx.abertas)} aberta(s))`,
                  )}
            </p>
            <div className="canal-acao" style={{ display: 'flex', gap: 'var(--p-e-2)', alignItems: 'center' }}>
              {c.tipo === 'whatsapp_cloud' ? (
                <Link href={`${base}/canais/whatsapp/${c.id}`} className="btn fantasma">
                  Detalhes
                </Link>
              ) : null}
              {(c.tipo === 'whatsapp_cloud' || c.tipo === 'instagram' || c.tipo === 'messenger') && c.ativo ? (
                <button
                  type="button"
                  className="btn fantasma"
                  onClick={() => {
                    setErroDesconectar(null);
                    setParaDesconectar(c);
                  }}
                >
                  Desconectar
                </button>
              ) : (
                <span className={c.ativo ? 'btn fantasma canal-acao' : 'btn fantasma canal-acao apagado'}>
                  <IconeGestao nome="circuloOk" tamanho={20} />
                  {c.ativo ? 'Conectado' : 'Desligado'}
                </span>
              )}
            </div>
          </section>
        ))}

        <section className="canal-cartao">
          <span className="canal-icone" aria-hidden="true">
            <Icone nome="balao" tamanho={40} />
          </span>
          <h3>WhatsApp</h3>
          <p>Conecte um número pelo cadastro embutido da Meta, ou manualmente</p>
          <div className="canal-acao" style={{ display: 'flex', gap: 'var(--p-e-2)', flexWrap: 'wrap' }}>
            <ConectarWhatsApp rotulo="Conectar" />
            <ConectarWhatsappManual />
          </div>
        </section>
        <section className="canal-cartao"><span className="canal-icone" aria-hidden="true"><Icone nome="balao" tamanho={40} /></span><h3>Facebook Messenger</h3><p>Conecte uma Página pelo token do aplicativo do cliente</p><div className="canal-acao"><ConectarMessengerManual /></div></section>

        <section className="canal-cartao">
          <span className="canal-icone" aria-hidden="true">
            <Icone nome="balao" tamanho={40} />
          </span>
          <h3>Instagram</h3>
          <p>Conecte uma conta profissional pelo token do seu aplicativo</p>
          <div className="canal-acao">
            <ConectarInstagramManual />
          </div>
        </section>
      </div>

      <ModalConfirmacao
        aberto={paraDesconectar !== null}
        titulo="Desconectar canal"
        mensagem={`Desconectar "${paraDesconectar?.nome}"? A conversa e o histórico ficam guardados; para voltar, conecte de novo.`}
        erro={erroDesconectar}
        confirmando={desconectando}
        rotuloConfirmar="Desconectar"
        onConfirmar={() => void confirmarDesconexao()}
        onCancelar={() => setParaDesconectar(null)}
      />
    </>
  );
}
