import { Etiqueta } from '@pipe/ui';
import type { TomDeEtiqueta } from '@pipe/ui';
import { BarraDoPortal } from '../../components/barra-do-portal';
import { useEu } from '../../context/session';
import { portalUseShell } from '../../lib/shell';
import { useRead } from '../../lib/query';
import type { Deployment } from '../../lib/deployment';
import { montarPassos } from '../../lib/passos-of-deployment';
import type { PassoState } from '../../lib/passos-of-deployment';
import { numero } from '../../lib/format';
import { ConectarWhatsApp } from '../../components/registration-embedded-whatsapp';
import { FormularioInvitation, FormularioImport, FormularioManual } from './formularios';

/**
 * Implantação — from contract to first attended conversation, with no manual rollout.
 *
 * The script follows Chatwoot's onboarding (`onboarding/Index.vue` and `InboxSetup.vue`): a greeting, the list of what's missing and, for each step without its own screen, the section that resolves it right there — the channel row with the "Conectar" button is their `ChannelRow.vue`. The layout is Gestão's: board header, row card and settings card, in Pipe's colors.
 *
 * Each step is read from the database (`passos-da-implantacao.ts`): it's done when what it asks for exists, not when someone clicked "continue".
 *
 * The chrome is the PORTAL's (`pt-app` + `BarraDoPortal`), as in "Novidades" and the contract Panel: this screen is ACCOUNT onboarding, not a fluxo or roteador — there's no contact here to hang the contact bar on, and pushing the person into a contact that may not even exist yet would be inventing context the screen doesn't have. Before this delivery it lived under `EstruturaGestao` (two dark bars, the top one the same as this and the bottom one with the module selector) — but Builder and Growth, the two modules that occupied that bar, moved inside the contact, and without them the bottom bar drew an empty row. A single bar, the usual one, is the honest frame for a screen that has no module at all.
 */

const URL_DESK =
  (import.meta.env['VITE_PIPE_DESK_URL'] as string | undefined) ?? 'http://localhost:3200';

const ROTULO: Record<PassoState, string> = {
  feito: 'Feito',
  andamento: 'Em andamento',
  pendente: 'Pendente',
};

const TOM: Record<PassoState, TomDeEtiqueta> = {
  feito: 'sucesso',
  andamento: 'info',
  pendente: 'alerta',
};

export function PageDeployment() {
  const eu = useEu();
  const shell = portalUseShell();
  const read = useRead<Deployment>('/v1/management/deployment');
  if (!read.data) {
    return (
      <div className="pt-app">
        <BarraDoPortal data={shell} />
      </div>
    );
  }
  const { signals, channels } = read.data;
  const passos = montarPassos(signals, URL_DESK);
  const feitos = passos.filter((p) => p.state === 'feito').length;
  const firstName = eu.user.nome.split(' ')[0] ?? eu.user.nome;
  const ultima = signals.ultimaImport;

  return (
    <div className="pt-app">
      <BarraDoPortal data={shell} />
      <main className="p-conteudo">
        <div className="board-head">
          <h2>Implantação</h2>
          <span className="sub">
            Olá, {firstName}. {numero(feitos)} de {numero(passos.length)} passos concluídos para
            chegar na primeira conversa atendida.
          </span>
        </div>

        <div className="list-cards">
          <div className="group-cards">
            Passos <span className="qt">{passos.length}</span>
          </div>
          {passos.map((passo, i) => (
            <article key={passo.id} className="card-list">
              <span />
              <div className="cl-campos" style={{ '--cl-colunas': 2 } as React.CSSProperties}>
                <div className="cl-campo">
                  <span className="r">Passo {i + 1}</span>
                  <span className="v">{passo.titulo}</span>
                </div>
                <div className="cl-campo">
                  <span className="r">{passo.state === 'feito' ? 'Situação' : 'O que falta'}</span>
                  <span className="v" title={passo.resumo}>
                    {passo.resumo}
                  </span>
                </div>
              </div>
              <div className="cl-actions">
                <Etiqueta tom={TOM[passo.state]}>{ROTULO[passo.state]}</Etiqueta>
                {passo.acao && passo.state !== 'feito' ? (
                  <a
                    className="btn"
                    href={passo.acao.href}
                    {...(passo.acao.externo ? { target: '_blank', rel: 'noreferrer' } : {})}
                  >
                    {passo.acao.rotulo}
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>

        <section className="card" id="whatsapp">
          <h3>WhatsApp</h3>
          <p className="sub">
            O número é do cliente: a conexão roda pelo cadastro embutido da Meta, dentro do Business
            Manager dele. Ao fim, o Pipe troca o código pelo token, registra o número e aponta o
            webhook — ninguém copia URL nem token.
          </p>

          {channels.length === 0 ? null : (
            <div className="list-cards">
              {channels.map((c) => {
                const precisaReconectar = !c.ativo || c.reauthorizationPending;
                return (
                  <article key={c.id} className="card-list">
                    <span />
                    <div className="cl-campos" style={{ '--cl-colunas': 2 } as React.CSSProperties}>
                      <div className="cl-campo">
                        <span className="r">Canal</span>
                        <span className="v">{c.nome}</span>
                      </div>
                      <div className="cl-campo">
                        <span className="r">Número</span>
                        <span className="v">{c.numero ?? 'Sem número'}</span>
                      </div>
                    </div>
                    <div className="cl-actions">
                      <Etiqueta tom={precisaReconectar ? 'alerta' : 'sucesso'}>
                        {!c.ativo
                          ? 'Desligado'
                          : c.reauthorizationPending
                            ? 'Reautorizar'
                            : 'Conectado'}
                      </Etiqueta>
                      {precisaReconectar && c.numero ? (
                        <ConectarWhatsApp channelId={c.id} rotulo="Reconectar" variante="padrao" />
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <ConectarWhatsApp
            rotulo={channels.length === 0 ? 'Conectar WhatsApp' : 'Conectar outro número'}
          />
          <FormularioManual />
        </section>

        <section className="card" id="equipe">
          <h3>Equipe</h3>
          <p className="sub">
            Quem ainda não tem domínio verificado entra por convite: o link cria o acesso com o
            papel escolhido e liga a conta do Google na primeira entrada. {numero(signals.members)}{' '}
            pessoa(s) com acesso e {numero(signals.convites)} convite(s) criado(s).
          </p>
          <FormularioInvitation />
        </section>

        <section className="card" id="contatos">
          <h3>Contatos</h3>
          <p className="sub">
            Uma planilha com as colunas nome, telefone e e-mail — outras colunas viram atributos do
            contato. O telefone vira E.164, o celular antigo ganha o nono dígito, e quem já existe é
            atualizado, não duplicado.
          </p>
          {ultima ? (
            <p className="note">
              Última importação: <b>{ROTULO_IMPORT[ultima.state] ?? ultima.state}</b>,{' '}
              {numero(ultima.aceitos)} aceito(s) e {numero(ultima.rejeitados)} rejeitado(s).{' '}
              {ultima.temFalhas ? (
                <a href={`/v1/contacts/imports/${ultima.id}/failures`}>
                  Baixar as linhas rejeitadas, com o motivo
                </a>
              ) : null}
            </p>
          ) : null}
          <FormularioImport />
        </section>
      </main>
    </div>
  );
}

const ROTULO_IMPORT: Record<string, string> = {
  pronta: 'na fila',
  executando: 'em andamento',
  concluida: 'concluída',
  falhou: 'falhou',
};
