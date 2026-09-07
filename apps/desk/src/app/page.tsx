import { cookies } from 'next/headers';
import { noTenant, sessaoAtual } from '../servidor/banco';
import { buscarFichaDoCrm } from '../lib/crm';
import { COOKIE_SESSAO } from '../lib/sessao';
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
import { ehAbaDoPainel, PainelContato } from '../componentes/painel-contato';
import type { AbaDoPainel } from '../componentes/painel-contato';
import { EstadoVazio } from '@pipe/ui';
import { TrilhoDesk } from '../componentes/trilho-desk';
import { VigiaDeInatividade } from '../componentes/inatividade';
import { RecargaDaFila } from '../componentes/recarga-fila';

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
  /** Aba do painel do contato: perfil, historico ou metadados. */
  painel?: string;
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
  const aba = ehAbaDoPainel(parametros.painel) ? parametros.painel : 'perfil';
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

  /**
   * O que o CRM sabe do cliente da conversa aberta.
   *
   * Vai à `api` e não ao banco, porque quem fala com o CRM é a `api` — regra do dono.
   * É a única leitura desta tela que sai por HTTP, e por isso fica FORA do `noTenant`:
   * segurar uma conexão de banco esperando resposta de rede é conexão que falta para
   * todo mundo.
   *
   * `buscarFichaDoCrm` nunca lança: CRM fora do ar devolve `null`, o cartão some e a
   * conversa continua. O atendimento vale mais que o cartão do CRM.
   */
  const cookieDaSessao = (await cookies()).get(COOKIE_SESSAO);
  const fichaDoCrm =
    dados.aberta && cookieDaSessao
      ? await buscarFichaDoCrm(
          `${COOKIE_SESSAO}=${cookieDaSessao.value}`,
          dados.aberta.conversa.contatoId,
        )
      : null;

  /**
   * Trocar de aba no painel não pode desfazer nada do resto da tela: a
   * conversa aberta, a busca, a ficha, a ordem e a fila continuam todas na
   * URL. É a mesma regra que a coluna de atendimentos já segue nos seus links.
   */
  function linkDaAba(destino: AbaDoPainel): string {
    const chaves = new URLSearchParams({ filtro: ficha });
    if (busca) chaves.set('busca', busca);
    if (ordem !== 'recentes') chaves.set('ordem', ordem);
    if (fila) chaves.set('fila', fila);
    if (dados.aberta) chaves.set('conversa', dados.aberta.conversa.id);
    if (destino !== 'perfil') chaves.set('painel', destino);
    return `/?${chaves.toString()}`;
  }

  return (
    // Trilho de altura cheia à esquerda e três colunas à direita, na disposição
    // medida no Desk deles. Não há barra superior: ela repetiria o que o trilho
    // já diz e roubaria dobra da conversa.
    <div className="desk-app">
      {/* Escuta o teclado da tela inteira. Fica fora das colunas de propósito:
          o atalho vale mesmo sem conversa aberta. */}
      <AtalhosDeTeclado />
      {/* Conta os 10 minutos até o aviso e os 10 seguintes até a queda para
          Offline. Fica fora das colunas pelo mesmo motivo dos atalhos: a regra
          vale com ou sem conversa aberta. */}
      <VigiaDeInatividade estado={dados.status.estado} />
      {/* Recarrega a fila a cada 15s, preservando o estado do cliente. */}
      <RecargaDaFila />
      <TrilhoDesk
        iniciais={sessao.iniciais}
        nome={sessao.nome}
        email={sessao.email}
        tenantNome={sessao.tenantNome}
        estado={dados.status.estado}
      />

      <main className="desk" data-selecionada={selecionadaNaUrl ? 'true' : 'false'}>
        <div className="col list">
          {/* Só o título. O seletor "Lista / Quadro" saiu: o modo Quadro não
              existe no Pipe, a segunda opção nascia desabilitada e a primeira
              já estava escolhida — um controle que não podia mudar nada. Ele
              volta junto com o quadro, não antes. A contagem que ficava aqui
              também saiu: ela vive dentro do rótulo de cada ficha. */}
          <header className="col-topo">
            <h1>Atendimentos</h1>
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
            aba={aba}
            href={linkDaAba}
            fichaDoCrm={fichaDoCrm}
          />
        ) : (
          <aside className="col panel" aria-label="Contato" />
        )}
      </main>
    </div>
  );
}
