import { Etiqueta } from '@pipe/ui';
import type { TomDeEtiqueta } from '@pipe/ui';
import { BarraDoPortal } from '../../componentes/barra-do-portal';
import { useEu } from '../../contexto/sessao';
import { useCascaDoPortal } from '../../lib/casca';
import { useLeitura } from '../../lib/consulta';
import type { Implantacao } from '../../lib/implantacao';
import { montarPassos } from '../../lib/passos-da-implantacao';
import type { EstadoDoPasso } from '../../lib/passos-da-implantacao';
import { numero } from '../../lib/formato';
import { ConectarWhatsApp } from '../../componentes/cadastro-embutido-whatsapp';
import { FormularioConvite, FormularioImportacao, FormularioManual } from './formularios';

/**
 * Implantação — do contrato à primeira conversa atendida, sem implantação manual.
 *
 * O roteiro é o do onboarding do Chatwoot (`onboarding/Index.vue` e
 * `InboxSetup.vue`): uma saudação, a lista do que falta e, para cada passo que
 * não tem tela própria, a seção que o resolve ali mesmo — a linha de canal com o
 * botão "Conectar" é a `ChannelRow.vue` de lá. A disposição é a da Gestão:
 * cabeçalho de quadro, cartão-linha e cartão de configuração, com a tinta Pipe.
 *
 * Cada passo é lido do banco (`passos-da-implantacao.ts`): está feito quando o
 * que ele pede existe, e não quando alguém clicou em "continuar".
 *
 * O cromo é o do PORTAL (`pt-app` + `BarraDoPortal`), como em "Novidades" e no
 * Painel do contrato: esta tela é onboarding de CONTA, não de um fluxo ou
 * roteador — não há contato nenhum para pendurar a barra do contato aqui, e
 * empurrar a pessoa para dentro de um contato que talvez nem exista ainda
 * seria inventar contexto que a tela não tem. Até esta entrega ela vivia sob
 * `EstruturaGestao` (duas barras escuras, a de cima igual a esta e a de baixo
 * com o seletor de módulo) — mas Builder e Growth, os dois módulos que
 * ocupavam aquela barra, se mudaram para dentro do contato, e sem eles a
 * barra de baixo desenhava uma fileira vazia. Uma barra só, a mesma de sempre,
 * é a moldura honesta para uma tela que não tem módulo nenhum.
 */

const URL_DESK =
  (import.meta.env['VITE_PIPE_DESK_URL'] as string | undefined) ?? 'http://localhost:3200';

const ROTULO: Record<EstadoDoPasso, string> = {
  feito: 'Feito',
  andamento: 'Em andamento',
  pendente: 'Pendente',
};

const TOM: Record<EstadoDoPasso, TomDeEtiqueta> = {
  feito: 'sucesso',
  andamento: 'info',
  pendente: 'alerta',
};

export function PaginaImplantacao() {
  const eu = useEu();
  const casca = useCascaDoPortal();
  const leitura = useLeitura<Implantacao>('/v1/gestao/implantacao');
  if (!leitura.data) {
    return (
      <div className="pt-app">
        <BarraDoPortal dados={casca} />
      </div>
    );
  }
  const { sinais, canais } = leitura.data;
  const passos = montarPassos(sinais, URL_DESK);
  const feitos = passos.filter((p) => p.estado === 'feito').length;
  const primeiroNome = eu.usuario.nome.split(' ')[0] ?? eu.usuario.nome;
  const ultima = sinais.ultimaImportacao;

  return (
    <div className="pt-app">
      <BarraDoPortal dados={casca} />
      <main className="p-conteudo">
        <div className="board-head">
          <h2>Implantação</h2>
          <span className="sub">
            Olá, {primeiroNome}. {numero(feitos)} de {numero(passos.length)} passos concluídos para
            chegar na primeira conversa atendida.
          </span>
        </div>

        <div className="lista-cartoes">
          <div className="grupo-cartoes">
            Passos <span className="qt">{passos.length}</span>
          </div>
          {passos.map((passo, i) => (
            <article key={passo.id} className="cartao-lista">
              <span />
              <div className="cl-campos" style={{ '--cl-colunas': 2 } as React.CSSProperties}>
                <div className="cl-campo">
                  <span className="r">Passo {i + 1}</span>
                  <span className="v">{passo.titulo}</span>
                </div>
                <div className="cl-campo">
                  <span className="r">{passo.estado === 'feito' ? 'Situação' : 'O que falta'}</span>
                  <span className="v" title={passo.resumo}>
                    {passo.resumo}
                  </span>
                </div>
              </div>
              <div className="cl-acoes">
                <Etiqueta tom={TOM[passo.estado]}>{ROTULO[passo.estado]}</Etiqueta>
                {passo.acao && passo.estado !== 'feito' ? (
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

          {canais.length === 0 ? null : (
            <div className="lista-cartoes">
              {canais.map((c) => {
                const precisaReconectar = !c.ativo || c.reautorizacaoPendente;
                return (
                  <article key={c.id} className="cartao-lista">
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
                    <div className="cl-acoes">
                      <Etiqueta tom={precisaReconectar ? 'alerta' : 'sucesso'}>
                        {!c.ativo
                          ? 'Desligado'
                          : c.reautorizacaoPendente
                            ? 'Reautorizar'
                            : 'Conectado'}
                      </Etiqueta>
                      {precisaReconectar && c.numero ? (
                        <ConectarWhatsApp canalId={c.id} rotulo="Reconectar" variante="padrao" />
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <ConectarWhatsApp
            rotulo={canais.length === 0 ? 'Conectar WhatsApp' : 'Conectar outro número'}
          />
          <FormularioManual />
        </section>

        <section className="card" id="equipe">
          <h3>Equipe</h3>
          <p className="sub">
            Quem ainda não tem domínio verificado entra por convite: o link cria o acesso com o
            papel escolhido e liga a conta do Google na primeira entrada. {numero(sinais.membros)}{' '}
            pessoa(s) com acesso e {numero(sinais.convites)} convite(s) criado(s).
          </p>
          <FormularioConvite />
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
              Última importação: <b>{ROTULO_IMPORTACAO[ultima.estado] ?? ultima.estado}</b>,{' '}
              {numero(ultima.aceitos)} aceito(s) e {numero(ultima.rejeitados)} rejeitado(s).{' '}
              {ultima.temFalhas ? (
                <a href={`/v1/contatos/importacoes/${ultima.id}/falhas`}>
                  Baixar as linhas rejeitadas, com o motivo
                </a>
              ) : null}
            </p>
          ) : null}
          <FormularioImportacao />
        </section>
      </main>
    </div>
  );
}

const ROTULO_IMPORTACAO: Record<string, string> = {
  pronta: 'na fila',
  executando: 'em andamento',
  concluida: 'concluída',
  falhou: 'falhou',
};
