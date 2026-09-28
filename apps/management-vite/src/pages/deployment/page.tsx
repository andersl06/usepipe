import { Etiqueta } from '@pipe/ui';
import type { TomDeEtiqueta } from '@pipe/ui';
import type { GradeDoPortal } from '@pipe/contracts';
import { BarraDoPortal } from '../../components/barra-do-portal';
import { useEu } from '../../context/session';
import { portalUseShell } from '../../lib/shell';
import { useRead } from '../../lib/query';
import type { Deployment } from '../../lib/deployment';
import { montarPassos } from '../../lib/passos-of-deployment';
import type { StepState } from '../../lib/passos-of-deployment';
import { numero } from '../../lib/format';
import { ConectarWhatsApp } from '../../components/registration-embedded-whatsapp';
import { InvitationForm, ImportForm, FormularioManual } from './formularios';

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

const ROTULO: Record<StepState, string> = {
  feito: 'Feito',
  andamento: 'Em andamento',
  pendente: 'Pendente',
};

const TOM: Record<StepState, TomDeEtiqueta> = {
  feito: 'sucesso',
  andamento: 'info',
  pendente: 'alerta',
};

export function PageDeployment() {
  const eu = useEu();
  const shell = portalUseShell();
  const read = useRead<Deployment>('/v1/management/deployment');
  /*
   * The most recent flow, so the "Ver canais" and "Abrir filas" steps below can link into a
   * contact (`lib/passos-of-deployment.ts`). The account may have none yet, in which case those
   * steps fall back to the portal list.
   */
  const primaryFlow = useRead<GradeDoPortal>('/v1/management/flows?search=&pagina=1&porPagina=1');
  if (!read.data) {
    return (
      <div className="pt-app">
        <BarraDoPortal data={shell} />
      </div>
    );
  }
  const { signals, channels } = read.data;
  const primaryShortName = primaryFlow.data?.flows[0]?.shortName ?? null;
  const passos = montarPassos(signals, URL_DESK, primaryShortName);
  const feitos = passos.filter((p) => p.state === 'feito').length;
  const firstName = eu.user.nome.split(' ')[0] ?? eu.user.nome;
  const ultima = signals.lastImport;

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
                const precisaReconectar = !c.active || c.reauthorizationPending;
                return (
                  <article key={c.id} className="card-list">
                    <span />
                    <div className="cl-campos" style={{ '--cl-colunas': 2 } as React.CSSProperties}>
                      <div className="cl-campo">
                        <span className="r">Canal</span>
                        <span className="v">{c.name}</span>
                      </div>
                      <div className="cl-campo">
                        <span className="r">Número</span>
                        <span className="v">{c.number ?? 'Sem número'}</span>
                      </div>
                    </div>
                    <div className="cl-actions">
                      <Etiqueta tom={precisaReconectar ? 'alerta' : 'sucesso'}>
                        {!c.active
                          ? 'Desligado'
                          : c.reauthorizationPending
                            ? 'Reautorizar'
                            : 'Conectado'}
                      </Etiqueta>
                      {precisaReconectar && c.number ? (
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
          <InvitationForm />
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
              Última importação: <b>{LABEL_IMPORT[ultima.state] ?? ultima.state}</b>,{' '}
              {numero(ultima.accepted)} aceito(s) e {numero(ultima.rejeitados)} rejeitado(s).{' '}
              {ultima.temFalhas ? (
                <a href={`/v1/contacts/imports/${ultima.id}/failures`}>
                  Baixar as linhas rejeitadas, com o motivo
                </a>
              ) : null}
            </p>
          ) : null}
          <ImportForm />
        </section>
      </main>
    </div>
  );
}

const LABEL_IMPORT: Record<string, string> = {
  pronta: 'na fila',
  executando: 'em andamento',
  concluida: 'concluída',
  falhou: 'falhou',
};
