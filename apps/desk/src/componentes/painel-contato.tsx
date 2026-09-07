import { dia, diaEHora } from '../servidor/formato';
import { iniciaisDe } from '../lib/nome';
import type { ConversaAberta, ConversaDoHistorico } from '../servidor/consultas';

/**
 * Painel do contato: dados, atributos, etiquetas, resumo e histórico.
 *
 * O resumo é lido de `classificacao_conversa.resumo` — o texto que já está gravado.
 * **Nenhuma chamada de IA acontece nesta tela nesta etapa**; quando o `@pipe/ai` entrar,
 * é aqui que o botão de regerar aparece, e o consumo vai para `consumo_ia`.
 *
 * A edição de dado de contato também fica para a etapa seguinte, porque ela exige o log
 * de auditoria com autor, valor anterior e horário — e editar sem rastro é passivo.
 */

const ESTADO_LEGIVEL: Record<string, string> = {
  na_fila: 'Na fila',
  atribuida: 'Atribuída',
  em_atendimento: 'Em atendimento',
  em_espera: 'Em espera',
  encerrada: 'Encerrada',
};

export function PainelContato({
  conversa,
  etiquetas,
  historico,
}: {
  conversa: ConversaAberta;
  etiquetas: { id: string; nome: string }[];
  historico: ConversaDoHistorico[];
}) {
  const atributos = Object.entries(conversa.contatoAtributos);
  const nome = conversa.contatoNome ?? 'Sem nome';

  return (
    // Painel recuado com cartões por cima, na disposição medida no painel deles
    // (`docs/pesquisa/blip-desk-medidas.md`, §6): fundo em superfície 2, 8px de
    // folga em volta, cartões de 8px de espaço com recuo 16px 24px.
    //
    // O que NÃO copiamos é o painel em abas. Três abas para três seções curtas é
    // um clique a mais para ver dado que cabe numa rolagem só.
    <aside className="col panel" aria-label="Contato">
      <header className="panel-topo">
        <h2>Contato</h2>
      </header>
      <div className="panel-corpo">
      <section>
        <div className="who-card">
          <div className="av">{iniciaisDe(nome)}</div>
          <div>
            <b>{nome}</b>
            <span className="mono">{conversa.contatoTelefone ?? 'sem telefone'}</span>
          </div>
        </div>
        <dl className="kv">
          <dt>E-mail</dt>
          <dd>{conversa.contatoEmail ?? 'não informado'}</dd>
          <dt>Documento</dt>
          <dd>{conversa.contatoDocumento ?? 'não informado'}</dd>
          <dt>Fila</dt>
          <dd>{conversa.filaNome ?? 'não informado'}</dd>
          <dt>Aberta em</dt>
          <dd>{diaEHora(conversa.criadaEm)}</dd>
        </dl>
      </section>

      <section>
        <span className="rotulo">Resumo do atendimento</span>
        {conversa.resumo ? (
          <div className="summary">
            {conversa.resumo}
            <div className="cite">
              {conversa.resumoModelo ? `Gerado por ${conversa.resumoModelo}` : 'Origem não gravada'}
              {conversa.resumoEm ? ` · ${diaEHora(conversa.resumoEm)}` : ''}
            </div>
          </div>
        ) : (
          <div className="summary">
            Sem resumo gravado para esta conversa.
            <div className="cite">A geração por IA entra na etapa do @pipe/ai</div>
          </div>
        )}
      </section>

      <section>
        <span className="rotulo">Atributos</span>
        {atributos.length === 0 ? (
          <p className="vazio" style={{ padding: 0 }}>
            Nenhum atributo cadastrado.
          </p>
        ) : (
          <dl className="kv">
            {atributos.map(([chave, valor]) => (
              <div key={chave} style={{ display: 'contents' }}>
                <dt>{chave}</dt>
                <dd>{String(valor)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section>
        <span className="rotulo">Etiquetas</span>
        {etiquetas.length === 0 ? (
          <p className="vazio" style={{ padding: 0 }}>
            Sem etiqueta nesta conversa.
          </p>
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

      <section>
        <span className="rotulo">Histórico</span>
        {historico.length === 0 ? (
          <p className="vazio" style={{ padding: 0 }}>
            Primeira conversa deste contato.
          </p>
        ) : (
          <dl className="kv">
            {historico.map((anterior) => (
              <div key={anterior.id} style={{ display: 'contents' }}>
                <dt>
                  {dia(anterior.criadaEm)} · {anterior.filaNome ?? 'sem fila'}
                </dt>
                <dd>{ESTADO_LEGIVEL[anterior.estado] ?? anterior.estado}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
      </div>
    </aside>
  );
}
