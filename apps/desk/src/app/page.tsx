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
import { ehFicha, ListaConversas, naFicha } from '../componentes/lista-conversas';
import { SeletorDeModo } from '../componentes/seletor-de-modo';
import { PainelContato } from '../componentes/painel-contato';
import { EstadoVazio } from '@pipe/ui';
import { TrilhoDesk } from '../componentes/trilho-desk';

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
  filtro?: string;
}

export default async function PaginaDesk({
  searchParams,
}: {
  searchParams: Promise<Parametros>;
}) {
  const parametros = await searchParams;
  const busca = (parametros.busca ?? '').trim();
  const ficha = ehFicha(parametros.filtro) ? parametros.filtro : 'todos';
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

    // Duas listas, e as duas viajam para a coluna: a busca define sobre o que as
    // fichas contam, e a ficha define o que a lista mostra. Contar depois da
    // ficha faria "Todos (0)" aparecer ao lado de uma fila cheia.
    const filtradas = busca
      ? conversas.filter((c) =>
          semAcento(`${c.contatoNome ?? ''} ${c.filaNome ?? ''}`).includes(semAcento(busca)),
        )
      : conversas;
    const visiveis = filtradas.filter((c) => naFicha(c, ficha, agora));

    // Sem `?conversa=`, abre a primeira da fila: ninguém entra no Desk para olhar tela vazia.
    const escolhida = parametros.conversa ?? visiveis[0]?.id ?? null;
    const semConversa = {
      conversas: filtradas,
      visiveis,
      status,
      motivos,
      etiquetas,
      colegas,
      respostas,
      aberta: null,
    };
    if (!escolhida) return semConversa;

    const conversa = await carregarConversa(tx, escolhida, sessao.atendenteId);
    if (!conversa) return semConversa;

    const itens = await listarItensDaConversa(tx, conversa.id);
    const templates = await listarTemplatesAprovados(tx, conversa.canalId);
    const etiquetasDaConversa = await listarEtiquetasDaConversa(tx, conversa.id);
    const historico = await listarHistoricoDoContato(tx, conversa.contatoId, conversa.id);

    return {
      ...semConversa,
      aberta: { conversa, itens, templates, etiquetasDaConversa, historico },
    };
  });

  const selecionadaNaUrl = Boolean(parametros.conversa);

  return (
    // Trilho de altura cheia à esquerda e três colunas à direita, na disposição
    // medida no Desk deles. Não há barra superior: ela repetiria o que o trilho
    // já diz e roubaria dobra da conversa.
    <div className="desk-app">
      <TrilhoDesk
        iniciais={sessao.iniciais}
        nome={sessao.nome}
        estado={dados.status.estado}
      />

      <main className="desk" data-selecionada={selecionadaNaUrl ? 'true' : 'false'}>
        <div className="col list">
          {/* Título e seletor de modo lado a lado, como no cabeçalho deles. A
              contagem que ficava aqui saiu: ela agora vive dentro do rótulo de
              cada ficha, que é onde diz mais. */}
          <header className="col-topo">
            <h1>Atendimentos</h1>
            <SeletorDeModo />
          </header>
          <BarraStatus
            nome={sessao.nome}
            estado={dados.status.estado}
            motivoPausa={dados.status.motivoPausa}
            motivos={dados.motivos}
          />
          <ListaConversas
            conversas={dados.conversas}
            visiveis={dados.visiveis}
            selecionadaId={dados.aberta?.conversa.id ?? null}
            busca={busca}
            ficha={ficha}
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
          // Estado sem conversa escolhida, na receita deles: ilustração, uma
          // linha que nomeia o estado, uma linha que diz o que fazer. Texto
          // centrado no vazio, sem caixa e sem borda.
          <div className="thread">
            <div className="msgs vazio-conversa">
              <EstadoVazio titulo="Nenhuma conversa aberta">
                <p>
                  Escolha um atendimento na coluna da esquerda. Se a lista está vazia, rode{' '}
                  <code>pnpm seed:demo</code>.
                </p>
              </EstadoVazio>
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
  );
}
