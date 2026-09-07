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
import { AtalhosDeTeclado } from '../componentes/atalhos';
import { BarraStatus } from '../componentes/barra-status';
import { Conversa } from '../componentes/conversa';
import { ehFicha, ListaConversas, naFicha } from '../componentes/lista-conversas';
import { ehOrdem, filasDe, naFila, ordenar } from '../lib/ordem';
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

/**
 * O que a busca da coluna varre. O telefone entra sem pontuação dos dois lados
 * porque ninguém digita `+55 (31) 9...` no campo: o atendente cola o número do
 * jeito que veio, e o banco guarda em E.164.
 */
function alvoDaBusca(conversa: { contatoNome: string | null; contatoTelefone: string | null; filaNome: string | null }): string {
  const telefone = (conversa.contatoTelefone ?? '').replace(/\D/g, '');
  return `${semAcento(`${conversa.contatoNome ?? ''} ${conversa.filaNome ?? ''}`)} ${telefone}`;
}

interface Parametros {
  conversa?: string;
  busca?: string;
  filtro?: string;
  ordem?: string;
  fila?: string;
}

export default async function PaginaDesk({
  searchParams,
}: {
  searchParams: Promise<Parametros>;
}) {
  const parametros = await searchParams;
  const busca = (parametros.busca ?? '').trim();
  const ficha = ehFicha(parametros.filtro) ? parametros.filtro : 'todos';
  const ordem = ehOrdem(parametros.ordem) ? parametros.ordem : 'recentes';
  const fila = (parametros.fila ?? '').trim();
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
    //
    // A fila entra junto da busca, e não junto da ficha: quem recortou o
    // Financeiro quer as fichas contando o Financeiro. A ordem vem por último,
    // porque ordenar o que vai ser descartado é trabalho jogado fora.
    const termo = semAcento(busca);
    const termoDigitos = busca.replace(/\D/g, '');
    const filtradas = conversas.filter((c) => {
      if (!naFila(c, fila)) return false;
      if (!busca) return true;
      const alvo = alvoDaBusca(c);
      return alvo.includes(termo) || (termoDigitos.length >= 3 && alvo.includes(termoDigitos));
    });
    const visiveis = ordenar(
      filtradas.filter((c) => naFicha(c, ficha, agora)),
      ordem,
    );

    // Sem `?conversa=`, abre a primeira da fila: ninguém entra no Desk para olhar tela vazia.
    const escolhida = parametros.conversa ?? visiveis[0]?.id ?? null;
    const semConversa = {
      conversas: filtradas,
      visiveis,
      // Do conjunto INTEIRO, e não do recortado: um seletor de fila que só
      // oferece a fila já escolhida é um beco sem saída.
      filas: filasDe(conversas),
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
      {/* Escuta o teclado da tela inteira. Fica fora das colunas de propósito:
          o atalho vale mesmo sem conversa aberta. */}
      <AtalhosDeTeclado />
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
            ordem={ordem}
            fila={fila}
            filas={dados.filas}
            estado={dados.status.estado}
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
          //
          // Duas frases, não uma: ficar sem conversa porque a fila zerou e
          // ficar sem conversa porque ninguém te vê são dois problemas, e só o
          // segundo tem uma ação óbvia do outro lado.
          <div className="thread">
            <div className="msgs vazio-conversa">
              {dados.status.estado === 'online' ? (
                <EstadoVazio titulo="Nenhuma conversa aberta" ilustracao="concluido">
                  <p>
                    Você está online e a fila está zerada. Escolha um atendimento à esquerda ou
                    espere o próximo cair aqui.
                  </p>
                </EstadoVazio>
              ) : (
                <EstadoVazio titulo="Fique online para atender">
                  <p>
                    Enquanto o seu status não for Online, a distribuição não te enxerga e nenhuma
                    conversa nova chega.
                  </p>
                </EstadoVazio>
              )}
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
