import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar } from '@pipe/ui';
import { ROTULOS_PRIORIDADE } from '@pipe/core/conversa';
import { noTenant, sessaoAtual } from '../../../servidor/banco';
import {
  carregarStatus,
  carregarTicketAntigo,
  listarEtiquetasDaConversa,
  listarItensDaConversa,
} from '../../../servidor/consultas';
import { diaEHora, duracaoRelogio } from '../../../servidor/formato';
import { ListaDeMensagens } from '../../../componentes/mensagens';
import { TrilhoDesk } from '../../../componentes/trilho-desk';

/**
 * Um atendimento antigo, aberto em LEITURA a partir do histórico do contato.
 *
 * É o pedaço da aba de Contatos da tela de referência que é do Desk: lá, clicar
 * num ticket do histórico abre a transcrição inteira daquele atendimento, com
 * um painel de "Informações do ticket" ao lado
 * (`docs/pesquisa/blip-desk-contatos.md`). A lista navegável de contatos, que é
 * a outra metade daquela aba, é tela do CRM — e essa fronteira é de produto,
 * não de anatomia.
 *
 * **Não há compositor, e não há como haver**: a conversa está encerrada. É a
 * mesma regra que o atendimento em curso já segue — quando não há o que compor,
 * o compositor SOME e o motivo ocupa o lugar dele, em vez de um campo
 * desabilitado com a explicação escondida num `title`.
 *
 * Quem atendeu não filtra nada aqui: o histórico do contato já lista os
 * atendimentos anteriores dele sem olhar quem atendeu, e quem fecha o cerco é a
 * RLS, que só enxerga o cliente da sessão.
 */
export const dynamic = 'force-dynamic';

const CANAL: Record<string, string> = {
  whatsapp_cloud: 'WhatsApp',
  instagram: 'Instagram',
  email: 'E-mail',
  widget: 'Site',
};

/**
 * Como o atendimento terminou, escrito por extenso.
 *
 * A tela de referência tem oito situações; o nosso domínio distingue **três**,
 * e a diferença é falta de dado, não de tela: não gravamos QUEM encerrou quando
 * não foi um atendente, então "cliente encerrou" e "encerrou por inatividade"
 * chegam aqui iguais. Enquanto for assim, a frase diz o que se sabe e não
 * inventa o resto.
 */
function comoTerminou(ticket: {
  estado: string;
  encerradaEm: Date | null;
  encerradaPorNome: string | null;
  motivoEncerramento: string | null;
}): string {
  if (!ticket.encerradaEm) return 'Em aberto';
  if (ticket.encerradaPorNome) return `Finalizado por ${ticket.encerradaPorNome}`;
  return 'Finalizado sem atendente — cliente saiu ou o prazo venceu';
}

export default async function PaginaTicketAntigo({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessao = await sessaoAtual();

  const dados = await noTenant(async (tx) => {
    const ticket = await carregarTicketAntigo(tx, id);
    if (!ticket) return null;
    return {
      ticket,
      itens: await listarItensDaConversa(tx, ticket.id),
      etiquetas: await listarEtiquetasDaConversa(tx, ticket.id),
      status: await carregarStatus(tx, sessao.atendenteId),
    };
  });

  if (!dados) notFound();
  const { ticket, itens, etiquetas, status } = dados;
  const nome = ticket.contatoNome ?? 'Sem nome';

  // O total é do começo ao fim do atendimento. Sem fim gravado, não há total —
  // e um total contado até "agora" cresceria a cada recarga da página.
  const totalSeg = ticket.encerradaEm
    ? Math.round((ticket.encerradaEm.getTime() - ticket.criadaEm.getTime()) / 1000)
    : null;

  return (
    <div className="desk-app">
      <TrilhoDesk
        iniciais={sessao.iniciais}
        nome={sessao.nome}
        email={sessao.email}
        tenantNome={sessao.tenantNome}
        estado={status.estado}
      />

      <main className="ticket">
        <header className="thread-head">
          <Link className="btn" href={`/?conversa=${encodeURIComponent(ticket.id)}`}>
            ← Voltar
          </Link>
          <Avatar nome={nome} className="av-contato" />
          <div>
            <h1>{nome}</h1>
            <div className="sub">
              <span className="mono">#{ticket.id.slice(0, 8)}</span> ·{' '}
              {CANAL[ticket.canalTipo] ?? ticket.canalTipo} ·{' '}
              {ticket.filaNome ?? 'sem fila'}
            </div>
          </div>
          {/* Nenhuma ação: o atendimento já terminou, e botão que não pode agir
              é promessa que a tela não cumpre. */}
          <span className="etiqueta">Somente leitura</span>
        </header>

        <div className="ticket-corpo">
          <div className="msgs">
            {itens.length === 0 ? (
              <p className="panel-vazio">Este atendimento não tem mensagem gravada.</p>
            ) : (
              <ListaDeMensagens conversaId={ticket.id} itens={itens} somenteLeitura />
            )}
          </div>

          {/* "Informações do ticket", nos blocos da tela de referência. */}
          <aside className="ticket-info" aria-label="Informações do ticket">
            <section>
              <span className="rotulo">Dados do atendimento</span>
              <dl className="kv">
                <dt>Atendente</dt>
                <dd>{ticket.atendenteNome ?? 'Não chegou a um atendente'}</dd>
                {ticket.atendenteEmail ? (
                  <>
                    <dt>E-mail</dt>
                    <dd>{ticket.atendenteEmail}</dd>
                  </>
                ) : null}
                <dt>Fila de atendimento</dt>
                <dd>{ticket.filaNome ?? 'sem fila'}</dd>
                <dt>Canal</dt>
                <dd>{CANAL[ticket.canalTipo] ?? ticket.canalTipo}</dd>
                <dt>Prioridade</dt>
                <dd>{ROTULOS_PRIORIDADE[ticket.prioridade]}</dd>
              </dl>
            </section>

            <section>
              <span className="rotulo">Tempo de atendimento</span>
              <dl className="kv">
                <dt>Início</dt>
                <dd>{diaEHora(ticket.criadaEm)}</dd>
                <dt>Primeira resposta</dt>
                <dd>
                  {ticket.primeiraRespostaEm
                    ? diaEHora(ticket.primeiraRespostaEm)
                    : 'nunca respondido'}
                </dd>
                <dt>Última interação</dt>
                <dd>
                  {ticket.ultimaMensagemEm ? diaEHora(ticket.ultimaMensagemEm) : 'sem mensagem'}
                </dd>
                <dt>Tempo total</dt>
                <dd>{duracaoRelogio(totalSeg)}</dd>
                {ticket.pausadoSeg > 0 ? (
                  <>
                    <dt>Em espera</dt>
                    <dd>{duracaoRelogio(ticket.pausadoSeg)}</dd>
                  </>
                ) : null}
                <dt>Situação</dt>
                <dd>{comoTerminou(ticket)}</dd>
                {ticket.motivoEncerramento ? (
                  <>
                    <dt>Motivo</dt>
                    <dd>{ticket.motivoEncerramento}</dd>
                  </>
                ) : null}
              </dl>
            </section>

            <section>
              <span className="rotulo">Etiquetas</span>
              {etiquetas.length === 0 ? (
                <p className="panel-vazio">Não há etiqueta neste atendimento.</p>
              ) : (
                <div className="tags">
                  {etiquetas.map((etiqueta) => (
                    <span className="etiqueta" key={etiqueta.id}>
                      {etiqueta.nome}
                    </span>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
