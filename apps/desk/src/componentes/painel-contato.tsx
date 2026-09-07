import Link from 'next/link';
import { dia, diaEHora } from '../servidor/formato';
import { iniciaisDe } from '../lib/nome';
import type { ConversaAberta, ConversaDoHistorico } from '../servidor/consultas';

/**
 * Painel do contato: quem é, o que já aconteceu, e o que está gravado nele.
 *
 * **O painel é EM ABAS**, e não uma pilha rolada. É a disposição medida na tela
 * de referência (`docs/pesquisa/blip-desk-medidas.md`, §6): coluna recuada, uma
 * faixa de abas no topo e, sob ela, uma pilha de cartões sobre o fundo recuado.
 * Uma versão anterior desta tela tinha achatado as três abas numa rolagem só,
 * com o argumento de que era um clique a menos; o efeito real era uma coluna de
 * um metro de altura onde o histórico ficava sempre abaixo da dobra, que é
 * exatamente o dado que o atendente procura quando abre o painel.
 *
 * A aba escolhida vive na URL, em `?painel=`. Não é estado de cliente: recarregar
 * a tela não perde a aba, o botão de voltar funciona, e o painel continua
 * inteiro renderizado no servidor — o Desk já faz isso com a conversa aberta e
 * com os filtros da coluna, e uma quarta forma de guardar estado de tela seria
 * uma a mais do que o produto precisa.
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

/**
 * As três abas, na ordem da referência. A ordem é regra, não gosto: Perfil
 * primeiro porque é o que responde "com quem eu estou falando", Histórico
 * depois porque é o que responde "isso já aconteceu antes", e Metadados por
 * último porque é o que quase nunca se olha.
 */
export const ABAS_DO_PAINEL = [
  { chave: 'perfil', rotulo: 'Perfil' },
  { chave: 'historico', rotulo: 'Histórico' },
  { chave: 'metadados', rotulo: 'Metadados' },
] as const;

export type AbaDoPainel = (typeof ABAS_DO_PAINEL)[number]['chave'];

export function ehAbaDoPainel(valor: string | undefined): valor is AbaDoPainel {
  return ABAS_DO_PAINEL.some((aba) => aba.chave === valor);
}

export function PainelContato({
  conversa,
  etiquetas,
  historico,
  aba,
  href,
}: {
  conversa: ConversaAberta;
  etiquetas: { id: string; nome: string }[];
  historico: ConversaDoHistorico[];
  aba: AbaDoPainel;
  /** Monta o link de uma aba preservando a conversa aberta e os filtros. */
  href: (aba: AbaDoPainel) => string;
}) {
  const atributos = Object.entries(conversa.contatoAtributos);
  const nome = conversa.contatoNome ?? 'Sem nome';

  return (
    <aside className="col panel" aria-label="Contato">
      <header className="panel-topo">
        <h2>Contato</h2>
      </header>

      {/* Abas irmãs, não acordeão: as três estão sempre visíveis e o clique
          troca o conteúdo, sem empurrar nada para baixo. */}
      <nav className="panel-abas" aria-label="Seções do contato">
        {ABAS_DO_PAINEL.map((opcao) => (
          <Link
            key={opcao.chave}
            href={href(opcao.chave)}
            aria-current={opcao.chave === aba ? 'true' : undefined}
            scroll={false}
          >
            {opcao.rotulo}
          </Link>
        ))}
      </nav>

      <div className="panel-corpo">
        {aba === 'perfil' ? (
          <>
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
                    {conversa.resumoModelo
                      ? `Gerado por ${conversa.resumoModelo}`
                      : 'Origem não gravada'}
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
              <span className="rotulo">Etiquetas</span>
              {etiquetas.length === 0 ? (
                <p className="panel-vazio">Sem etiqueta nesta conversa.</p>
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
          </>
        ) : null}

        {aba === 'historico' ? (
          <section>
            <span className="rotulo">Atendimentos anteriores</span>
            {historico.length === 0 ? (
              <p className="panel-vazio">Primeira conversa deste contato.</p>
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
        ) : null}

        {aba === 'metadados' ? (
          <section>
            <span className="rotulo">Atributos do contato</span>
            {atributos.length === 0 ? (
              <p className="panel-vazio">Nenhum atributo cadastrado.</p>
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
        ) : null}
      </div>
    </aside>
  );
}
