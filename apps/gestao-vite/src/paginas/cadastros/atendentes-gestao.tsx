import { useLeitura } from '../../lib/consulta';
import type { AtendenteCadastrado } from '../../lib/cadastros';
import { numero } from '../../lib/formato';

/**
 * Gestão de atendentes — o primeiro item do grupo Atendentes na lateral deles,
 * e a lacuna mais barata do levantamento (`blip-gestao-medidas.md` §8.3).
 *
 * As quatro colunas são as deles, na ordem deles: **Atendente · E-mail · Filas ·
 * Tickets simultâneos**. As duas do fim são nossas e vieram da tela de Operação,
 * que esta substitui: status agora e situação.
 *
 * **Esta tela SUBSTITUI `/configuracoes/operacao`.** Aquela mostrava duas
 * coisas: um quadro de atendentes (que é este) e uma cópia só-leitura dos
 * motivos de pausa, que já têm tela própria com formulário em
 * `/atendentes/pausas`. Sobrava um item de menu sem par na lateral deles e uma
 * tabela repetida em dois lugares.
 *
 * **Não tem formulário, e isso é honesto e não preguiça.** Adicionar atendente
 * lá é convidar por e-mail, e no Pipe o convite já existe em `/convite/[token]`,
 * com fluxo próprio. Editar teto individual pede o override por participação em
 * fila, que se edita em `/atendentes/filas`, onde a fila e a capacidade padrão
 * estão do lado. Duplicar os dois aqui seria dar dois caminhos para a mesma
 * gravação — que é o que o levantamento cobra de errado na plataforma deles.
 */
export function PaginaGestaoDeAtendentes() {
  const leitura = useLeitura<AtendenteCadastrado[]>('/v1/gestao/atendentes/gestao');
  if (!leitura.data) return null;
  const atendentes = leitura.data;
  const semFila = atendentes.filter((a) => a.filas.length === 0).length;

  return (
    <>
      <div className="board-head">
        <h2>Atendentes</h2>
        <span className="sub">
          {numero(atendentes.length)} pessoas
          {semFila > 0
            ? ` · ${numero(semFila)} sem fila, e quem não está em fila não recebe conversa`
            : ''}
        </span>
      </div>

      <div className="tblwrap">
        <div className="tblhead">
          <h3>Gestão de atendentes</h3>
        </div>

        {atendentes.length === 0 ? (
          <div className="vazio">
            <b>Nenhum atendente cadastrado</b>
            <p>Não existem atendentes cadastrados. Que tal adicionar alguns?</p>
          </div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Atendente</th>
                  <th>E-mail</th>
                  <th>Filas</th>
                  <th>Tickets simultâneos</th>
                  <th>Status agora</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {atendentes.map((a) => (
                  <tr key={a.id}>
                    <td className="who">{a.nome}</td>
                    <td>{a.email}</td>
                    <td>
                      {/* "Sem filas" é o vazio deles, e aqui ele é alerta e não
                          travessão: pessoa fora de fila não recebe conversa
                          nenhuma, e isso é uma configuração pela metade. */}
                      {a.filas.length === 0 ? (
                        <span className="etiqueta alerta">Sem filas</span>
                      ) : (
                        a.filas.join(', ')
                      )}
                    </td>
                    <td className="num">
                      {a.limiteSimultaneo === null ? '—' : numero(a.limiteSimultaneo)}
                    </td>
                    <td>{ROTULO_ESTADO[a.estado ?? ''] ?? 'Nunca conectou'}</td>
                    <td>{a.ativo ? 'Ativo' : <span className="etiqueta">Desativado</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="note">
        O teto de conversas simultâneas é o <b>maior</b> entre as filas da pessoa, e não a soma:
        quem está em duas filas não atende o dobro por estar em duas. Ele se edita em{' '}
        <b>Filas de atendimento</b>, onde a capacidade padrão da fila e o valor próprio de cada
        atendente ficam lado a lado.
      </p>
    </>
  );
}

/** Os quatro estados de atendente, no vocabulário deles. */
const ROTULO_ESTADO: Record<string, string> = {
  online: 'Online',
  pausa: 'Em Pausa',
  invisivel: 'Invisível',
  offline: 'Offline',
};
