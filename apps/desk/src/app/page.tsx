import { noTenant, sessaoAtual } from '../servidor/banco';
import {
  carregarConversa,
  carregarStatus,
  listarColegas,
  listarConversas,
  listarEtiquetas,
  listarEtiquetasDaConversa,
  listarHistoricoDoContato,
  listarItensDaConversa,
  listarMotivosDePausa,
  listarRespostasProntas,
  listarTemplatesAprovados,
} from '../servidor/consultas';
import { BarraStatus } from '../componentes/barra-status';
import { Conversa } from '../componentes/conversa';
import { ListaConversas } from '../componentes/lista-conversas';
import { PainelContato } from '../componentes/painel-contato';
import { CabecalhoDesk } from '../componentes/cabecalho-desk';

/**
 * A tela do atendente inteira em uma rota. A conversa aberta é `?conversa=<id>`, e não
 * uma rota filha, porque as três colunas são um estado só: trocar de conversa não
 * troca de tela, troca de foco.
 *
 * Sem cache: fila de atendimento cacheada é fila errada. O realtime por WebSocket é a
 * etapa seguinte; até lá, quem atualiza é a navegação e o `revalidatePath` das ações.
 */
export const dynamic = 'force-dynamic';

/** Ninguém digita "Cássia" com acento na pressa. A busca ignora acento e caixa. */
function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

interface Parametros {
  conversa?: string;
  busca?: string;
}

export default async function PaginaDesk({
  searchParams,
}: {
  searchParams: Promise<Parametros>;
}) {
  const parametros = await searchParams;
  const busca = (parametros.busca ?? '').trim();
  const agora = new Date();
  const sessao = await sessaoAtual();

  const dados = await noTenant(async (tx) => {
    // Em série, e não em `Promise.all`: a transação é uma conexão só, o Postgres executa
    // uma consulta por vez de qualquer jeito, e disparar em paralelo na mesma conexão é
    // caminho deprecado do `pg` que aqui derrubava o `set_config` da transação.
    const conversas = await listarConversas(tx, sessao.atendenteId);
    const status = await carregarStatus(tx, sessao.atendenteId);
    const motivos = await listarMotivosDePausa(tx);
    const etiquetas = await listarEtiquetas(tx);
    const colegas = await listarColegas(tx, sessao.atendenteId);
    const respostas = await listarRespostasProntas(tx, sessao.atendenteId);

    const filtradas = busca
      ? conversas.filter((c) =>
          semAcento(`${c.contatoNome ?? ''} ${c.filaNome ?? ''}`).includes(semAcento(busca)),
        )
      : conversas;

    // Sem `?conversa=`, abre a primeira da fila: ninguém entra no Desk para olhar tela vazia.
    const escolhida = parametros.conversa ?? filtradas[0]?.id ?? null;
    if (!escolhida) {
      return { conversas: filtradas, status, motivos, etiquetas, colegas, respostas, aberta: null };
    }

    const conversa = await carregarConversa(tx, escolhida, sessao.atendenteId);
    if (!conversa) {
      return { conversas: filtradas, status, motivos, etiquetas, colegas, respostas, aberta: null };
    }

    const itens = await listarItensDaConversa(tx, conversa.id);
    const templates = await listarTemplatesAprovados(tx, conversa.canalId);
    const etiquetasDaConversa = await listarEtiquetasDaConversa(tx, conversa.id);
    const historico = await listarHistoricoDoContato(tx, conversa.contatoId, conversa.id);

    return {
      conversas: filtradas,
      status,
      motivos,
      etiquetas,
      colegas,
      respostas,
      aberta: { conversa, itens, templates, etiquetasDaConversa, historico },
    };
  });

  const selecionadaNaUrl = Boolean(parametros.conversa);

  return (
    <div className="p-app">
      <CabecalhoDesk
        iniciais={sessao.iniciais}
        nome={sessao.nome}
        estado={dados.status.estado}
      />

      <div className="p-miolo">
        <main className="desk" data-selecionada={selecionadaNaUrl ? 'true' : 'false'}>
          <div className="col list">
            <div className="col-head">
              <h2>Atendimentos</h2>
              <span className="contagem">{dados.conversas.length}</span>
            </div>
            <BarraStatus
              nome={sessao.nome}
              estado={dados.status.estado}
              motivoPausa={dados.status.motivoPausa}
              motivos={dados.motivos}
            />
            <ListaConversas
              conversas={dados.conversas}
              selecionadaId={dados.aberta?.conversa.id ?? null}
              busca={busca}
              agora={agora}
            />
          </div>

          {dados.aberta ? (
            <Conversa
              conversa={dados.aberta.conversa}
              itens={dados.aberta.itens}
              etiquetas={dados.etiquetas}
              respostas={dados.respostas}
              templates={dados.aberta.templates}
              colegas={dados.colegas}
              atendente={{ nome: sessao.nome, email: sessao.email }}
              agora={agora}
            />
          ) : (
            <div className="thread">
              <div className="msgs">
                <p className="vazio">
                  Escolha um atendimento na lista. Se a lista está vazia, rode{' '}
                  <code>pnpm seed:demo</code>.
                </p>
              </div>
            </div>
          )}

          {dados.aberta ? (
            <PainelContato
              conversa={dados.aberta.conversa}
              etiquetas={dados.aberta.etiquetasDaConversa}
              historico={dados.aberta.historico}
            />
          ) : (
            <aside className="col panel" aria-label="Contato" />
          )}
        </main>
      </div>
    </div>
  );
}
