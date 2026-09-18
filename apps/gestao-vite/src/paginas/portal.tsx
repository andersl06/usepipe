import { useSearchParams } from 'react-router-dom';
import { Ilustracao } from '@pipe/ui';
import { POR_PAGINA, type FluxoDoPortal, type GradeDoPortal } from '@pipe/contracts';
import { BarraDoPortal } from '../componentes/barra-do-portal';
import { IconeBusca, IconePortal, type NomeDeIconePortal } from '../componentes/icones-portal';
import Link from '../componentes/link';
import { useCascaDoPortal, type CascaDoPortal } from '../lib/casca';
import { useLeitura } from '../lib/consulta';

export const dynamic = 'force-dynamic';

/* Os dois destinos de fora do produto que o menu de ajuda da origem oferece
   (`Blip Help` e `Blip Community`). Vazio = item não desenhado: link para
   site que ainda não existe é pior do que menu com dois itens. */
const URL_AJUDA = (import.meta.env['VITE_PIPE_AJUDA_URL'] as string | undefined) ?? '';

type Fluxo = FluxoDoPortal;

/** O que a tela mostra: a casca (sessão) mais a grade (`GET /v1/gestao/fluxos`). */
type DadosDoPortal = CascaDoPortal & GradeDoPortal;

/**
 * Portal — a porta da plataforma, e a única tela do produto que muda de forma
 * conforme o que a conta tem dentro.
 *
 * Medido na tela ORIGINAL rodando (o portal deles servido local, rota
 * `auth.application.list`, janela de 1920) com `getBoundingClientRect` e
 * `getComputedStyle`, e no template do bundle deles para o que o mock da
 * conta de teste não acende.
 *
 * ═══ O QUE MUDA COM A QUANTIDADE DE CONTATOS ═══
 *
 * Conferido no DOM RENDERIZADO de `supernova.blip.ai/application` (conta com
 * onze bots) e nas respostas LIME do HAR da mesma sessão.
 *
 * SEMPRE na tela, em qualquer estado:
 *   · as duas barras;
 *   · a FILEIRA DE CARTÕES DE AÇÃO (`action-card-container`), cuja condição
 *     na origem é `!isCarouselBannerEnabled || !canCreateChatBot` — nada a ver
 *     com a quantidade de contatos. Ela está lá com onze bots.
 *
 * SÓ com NENHUM contato:
 *   · o bloco de boas-vindas (`welcome-banner`: `!applications.length &&
 *     tenant.id && canCreateChatBot`) — ilustração à esquerda, saudação com o
 *     nome da PESSOA, descrição e UM botão, a única saída de criação da tela.
 *
 * SÓ com UM contato ou mais, o `<div id="applications"
 * ng-if="applications.length > 0">`:
 *   · o título "Fluxos e roteadores em {conta}" em `fs-24` negrito;
 *   · a grade — colunas fixas de 188, o que sobra vira espaço nas pontas, do
 *     contato MAIS NOVO para o mais antigo;
 *   · a paginação, que aparece mesmo com uma página só ("1-11 de 11",
 *     "Itens por página: [40,80,120]", "de 1 páginas").
 *
 * ═══ MEDIDAS (original × nosso, em 1920) ═══
 *
 *   barra escura       80 · barra clara 80, branca, recheio 40
 *   coluna             540 · 830 (≥852) · 1300 (≥1300), centrada
 *   boas-vindas        recheio 56, vão de 72, texto `flex: 1 0 200px`
 *   cartão de ação     `flex: 1 0 300px`, recheio 24, ícone com canto 8 a 24
 *   título de seção    20/700/20, régua de 1px, recuo 8, 24 depois
 *   cartão             188×196, canto 16, recheio 15, avatar 56, nome 50, etq 25
 *   grade              auto-fill de 188 com 24 de intervalo, nas pontas
 *
 * A DISPOSIÇÃO É A DELES, A TINTA É A NOSSA: nenhum hex deles entra, tudo sai
 * dos token `--p-*` e dos `--g-barra-*`. Os ícones e a marca são os nossos.
 */
export function PaginaPortal() {
  const [parametros] = useSearchParams();
  const busca = (parametros.get('q') ?? '').trim();
  const pagina = Math.max(1, Number(parametros.get('pagina')) || 1);
  const porPagina = Number(parametros.get('por')) || POR_PAGINA[0];

  /* A busca filtra no BANCO, num `<form method="get">`: com a lista paginada,
     filtrar em memória só acharia o que estivesse na página aberta. */
  const casca = useCascaDoPortal();
  const grade = useLeitura<GradeDoPortal>(
    `/v1/gestao/fluxos?busca=${encodeURIComponent(busca)}&pagina=${pagina}&porPagina=${porPagina}`,
  );
  /* Banco fora do ar não pode apagar a barra: a grade cai no estado vazio. */
  const dados: DadosDoPortal = {
    ...casca,
    ...(grade.data ?? { fluxos: [], total: 0, encontrados: 0 }),
  };
  if (grade.isPending)
    return (
      <div className="pt-app">
        <BarraDoPortal dados={casca} />
      </div>
    );

  /* Vazio é a conta SEM NENHUM fluxo — não "a busca não achou nada". Confundir
     os dois faz a tela de quem tem trinta fluxos virar tela de conta nova. */
  const vazio = dados.total === 0;

  return (
    <div className="pt-app">
      <BarraDoPortal dados={dados} />
      <SubBarra dados={dados} busca={busca} />

      <main className="pt-conteudo">
        <div className="pt-coluna">
          {/* O banner de boas-vindas só existe na conta SEM nenhum contato e
              para quem pode criar — é o `welcome-banner` deles
              (`!applications.length && tenant.id && canCreateChatBot`). */}
          {vazio && dados.podeCriar ? <BoasVindas dados={dados} /> : null}

          {/* A fileira de cartões de ação NÃO é do estado vazio: no DOM da
              conta com onze bots ela está lá, acima da lista. A condição dela
              na origem é `!isCarouselBannerEnabled || !canCreateChatBot` — ou
              seja, nada a ver com a quantidade de contatos. */}
          <CartoesDeAcao />

          {/* A seção da lista, o `<div id="applications"
              ng-if="applications.length > 0">` deles: só existe quando a conta
              tem contato, e é ela que some na conta nova. */}
          {vazio ? null : (
            <div id="applications">
              <div className="pt-secao">
                <h2>Fluxos e roteadores em {dados.tenant.nome}</h2>
              </div>

              {dados.fluxos.length === 0 ? (
                <p className="pt-nada">
                  Não foi encontrado nenhum fluxo com o nome &ldquo;{busca}&rdquo;.
                </p>
              ) : (
                <>
                  <div className="pt-grade">
                    {dados.fluxos.map((f) => (
                      <CartaoDeFluxo key={f.id} fluxo={f} />
                    ))}
                  </div>
                  <Paginacao
                    busca={busca}
                    pagina={pagina}
                    porPagina={porPagina}
                    encontrados={dados.encontrados}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * A paginação da origem (`bds-pagination` com `page-counter`, `number-items` e
 * `items-page`): contador de itens à esquerda, escolha de itens por página e as
 * páginas à direita.
 *
 * Tudo em link e num `<form method="get">`: a lista é do servidor, e trocar de
 * página em JavaScript exigiria um componente de cliente para reimplementar o
 * que a URL já faz — e a URL, de quebra, é compartilhável.
 */
function Paginacao({
  busca,
  pagina,
  porPagina,
  encontrados,
}: {
  busca: string;
  pagina: number;
  porPagina: number;
  encontrados: number;
}) {
  const tamanho = POR_PAGINA.includes(porPagina as never) ? porPagina : POR_PAGINA[0];
  const paginas = Math.max(1, Math.ceil(encontrados / tamanho));
  const primeiroItem = encontrados === 0 ? 0 : (pagina - 1) * tamanho + 1;
  const ultimoItem = Math.min(pagina * tamanho, encontrados);

  const enderecoDa = (n: number) => {
    const cauda = new URLSearchParams();
    if (busca) cauda.set('q', busca);
    if (tamanho !== POR_PAGINA[0]) cauda.set('por', String(tamanho));
    if (n > 1) cauda.set('pagina', String(n));
    const texto = cauda.toString();
    return texto ? `/portal?${texto}` : '/portal';
  };

  /* Aparece SEMPRE, inclusive com uma página só: no DOM da conta de onze
     bots a barra está lá, dizendo "1-11 de 11" e "de 1 páginas". Escondê-la
     era invenção nossa. */

  return (
    <div className="pt-paginacao">
      <span className="pt-paginacao-conta">
        {primeiroItem}-{ultimoItem} de {encontrados}
      </span>

      {/* Sem JavaScript: trocar o tamanho recarrega pelo botão, e a lista volta
          para a primeira página — que é o que a origem também faz. */}
      <form className="pt-paginacao-tamanho" method="get" action="/portal">
        {busca ? <input type="hidden" name="q" value={busca} /> : null}
        <label htmlFor="pt-por">Itens por página:</label>
        <select id="pt-por" name="por" defaultValue={String(tamanho)}>
          {POR_PAGINA.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button type="submit">Aplicar</button>
      </form>

      <nav className="pt-paginacao-paginas" aria-label="Páginas">
        {Array.from({ length: paginas }, (_, i) => i + 1).map((n) => (
          <Link
            key={n}
            href={enderecoDa(n)}
            aria-current={n === pagina ? 'page' : undefined}
            aria-label={`Página ${n}`}
          >
            {n}
          </Link>
        ))}
        {/* O "de N páginas" que fecha a barra deles, à direita das páginas. */}
        <span className="pt-paginacao-de">de {paginas} páginas</span>
      </nav>
    </div>
  );
}

/* ======================================================= barra clara */

/**
 * A segunda barra: 80px brancos logo abaixo da escura, com o conteúdo alinhado
 * à MESMA coluna do miolo. É ela que diz de qual conta é tudo que vem abaixo.
 *
 * À direita, onde eles põem a busca (um campo de 32×36 na ponta da coluna),
 * vai a nossa busca — e ela só aparece quando há o que buscar. Debaixo do
 * título vai o ENDEREÇO da conta: na origem o portal de cada conta vive num
 * subdomínio, e é ali que a pessoa lê em qual conta está; a nossa URL não
 * carrega isso, então o slug precisa estar visível.
 */
function SubBarra({ dados, busca }: { dados: DadosDoPortal; busca: string }) {
  return (
    <div className="pt-subbarra">
      <div className="pt-subbarra-conteudo">
        {/* O título deles é uma FRASE, não o nome solto da conta:
            `navbar.subheader.workspaceOf` = "Espaço de trabalho de {conta}",
            num `bds-typo variant="fs-20" bold tag="h2"`. */}
        <h2 className="pt-subbarra-titulo">Espaço de trabalho de {dados.tenant.nome}</h2>

        {/* A ponta direita da barra clara deles (`action-icons`): a busca e,
            quando `canCreateChatbot`, os DOIS botões de criar — "Criar
            roteador" em terciário e "Criar fluxo" em primário. É daqui que se
            cria, em qualquer estado da conta; o botão do banner de boas-vindas
            é um atalho a mais, não o único caminho.

            A busca aparece SEMPRE, inclusive na conta sem nenhum contato: na
            origem ela está lá na conta vazia. */}
        <div className="pt-subbarra-acoes">
          {/* A busca deles NÃO é uma caixa: é a lupa de 32 em cinza, solta, com
              o campo sem borda ao lado (`search-input-container`). A nossa
              estava dentro de uma caixa com contorno, e era isso que destoava. */}
          <form className="pt-busca" method="get" action="/portal" role="search">
            <IconeBusca tamanho={32} />
            <input
              type="search"
              name="q"
              defaultValue={busca}
              placeholder="Buscar fluxos…"
              aria-label="Buscar fluxos"
            />
          </form>

          {dados.podeCriar ? (
            <>
              <Link className="btn" href="/criar/roteador">
                <IconePortal nome="roteador" tamanho={20} />
                Criar roteador
              </Link>
              <Link className="btn primario" href="/criar/fluxo">
                <IconePortal nome="fluxo" tamanho={20} />
                Criar fluxo
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ==================================================== estado 1: vazio */

/**
 * O bloco de boas-vindas do estado 1, na medida deles: 56px de recheio, 72 de
 * vão entre a ilustração e o texto, e o texto com `flex: 1 0 200px`.
 *
 * A saudação usa o nome da PESSOA (na origem, `blipAccount.fullName`) e não o
 * da conta — é o único lugar da tela em que isso acontece, e é o que faz a
 * tela parecer dirigida a quem abriu.
 */
function BoasVindas({ dados }: { dados: DadosDoPortal }) {
  const primeiroNome = dados.usuario.nome.trim().split(/\s+/)[0] ?? dados.usuario.nome;

  return (
    <div className="pt-boasvindas">
      <Ilustracao nome="vazio" tamanho={160} className="pt-boasvindas-desenho" />
      <div className="pt-boasvindas-texto">
        <h2>Olá, {primeiroNome}!</h2>
        <p>
          Esta conta ainda não tem nenhum contato inteligente. Que tal começar criando o primeiro
          fluxo — a conversa que atende antes da pessoa?
        </p>
        <div className="pt-boasvindas-acao">
          <Link className="btn primario" href="/builder">
            Criar meu primeiro fluxo
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ================================================== cartões de ação */

/**
 * A fileira de cartões de ação — o `action-card-container` deles.
 *
 * ELA NÃO É DO ESTADO VAZIO. No DOM da conta com onze bots a fileira está lá,
 * entre a barra clara e a lista; a condição na origem é
 * `ng-if="!isCarouselBannerEnabled || !canCreateChatBot"`, que não olha a
 * quantidade de contatos. Escondê-la quando a conta tinha fluxo era invenção
 * nossa, e era a diferença mais visível entre as duas telas.
 *
 * Os quatro deles são de LEITURA — novidades, contrato, ajuda e comunidade —,
 * e nenhum cria nada: a única saída de criação vive no botão do banner de
 * boas-vindas. Os nossos "Criar fluxo" e "Criar roteador" saíram daqui por
 * isso.
 *
 * "Novidades" fica de fora enquanto não houver o que mostrar. Ajuda e
 * comunidade são os dois sites de fora, e cada um só aparece quando o endereço
 * está configurado — cartão que leva a lugar nenhum é pior do que fileira
 * curta.
 */
function CartoesDeAcao() {
  return (
    <div className="pt-acoes">
      {/* Os quatro deles, na mesma ordem: novidades, contrato, ajuda e
          comunidade. A comunidade ainda está sendo feita e entra apagada. */}
      <CartaoDeAcao
        href="/novidades"
        icone="novidades"
        rotulo="Novidades no Pipe"
        texto="O que mudou, o que chegou e o que está a caminho."
      />
      {/* CONTRATO, e não "Minha conta": na origem são duas telas diferentes e o
          \`onContractCardClick\` leva ao painel do contrato (o fragmento
          \`tenant\`), não ao cadastro da pessoa. Estava apontando para o lugar
          errado. */}
      <CartaoDeAcao
        href="/contrato"
        icone="contrato"
        rotulo="Acompanhe seu contrato"
        texto="Plano, endereço, pessoas com acesso e os dados do contrato."
      />
      {URL_AJUDA ? (
        <CartaoDeAcao
          href={URL_AJUDA}
          externo
          icone="aprender"
          rotulo="Aprenda a usar o Pipe"
          texto="O que é fluxo, o que é roteador e como montar o primeiro atendimento."
        />
      ) : (
        <CartaoDeAcao
          emObra
          icone="aprender"
          rotulo="Aprenda a usar o Pipe"
          texto="O que é fluxo, o que é roteador e como montar o primeiro atendimento."
        />
      )}
      <CartaoDeAcao
        emObra
        icone="comunidade"
        rotulo="Converse com a Comunidade"
        texto="Quem já usa o Pipe todo dia, e o que essa gente aprendeu antes de você."
      />
    </div>
  );
}

function CartaoDeAcao({
  href,
  icone,
  rotulo,
  texto,
  externo,
  emObra,
}: {
  href?: string;
  icone: NomeDeIconePortal;
  rotulo: string;
  texto: string;
  /** Sai do aplicativo (ajuda, comunidade): abre em outra aba, como na origem. */
  externo?: boolean;
  /** Ainda não existe: o cartão aparece apagado, com o selo, e não clica. */
  emObra?: boolean;
}) {
  const miolo = (
    <>
      <span className="pt-acao-icone">
        <IconePortal nome={icone} tamanho={28} />
      </span>
      <span className="pt-acao-texto">
        <b>
          {rotulo}
          {emObra ? <span className="pt-obra-selo">em breve</span> : null}
        </b>
        <span>{texto}</span>
      </span>
    </>
  );

  if (emObra) {
    return (
      <span className="pt-acao pt-acao-obra" aria-disabled="true" title="Em desenvolvimento">
        {miolo}
      </span>
    );
  }

  return externo ? (
    <a className="pt-acao" href={href} target="_blank" rel="noreferrer">
      {miolo}
    </a>
  ) : (
    <Link className="pt-acao" href={href ?? '/portal'}>
      {miolo}
    </Link>
  );
}

/* =============================================== estados 2 e 3: grade */

/**
 * O que a etiqueta do cartão diz, por tipo.
 *
 * O texto vem DEPOIS do ícone do tipo: no DOM renderizado de `supernova` o
 * `bds-chip-tag icon="builder-router"` (roteador) ou `icon="builder-new-state"`
 * (fluxo) desenha o `bds-icon` x-small no `chip_tag--icon` e a palavra no
 * `chip_tag--text` ao lado. Olhar só o template, sem o shadow root, esconde o
 * ícone — foi o engano de antes.
 */
const ETIQUETA = { roteador: 'Roteador', fluxo: 'Fluxo' } as const;

/**
 * O cartão, nos três andares de altura FIXA da tela deles — avatar de 56,
 * nome de 50 e etiqueta de 25 dentro de 188×196 com 15 de recheio. É isso que
 * impede o nome de duas linhas de empurrar a etiqueta para fora.
 *
 * A etiqueta é onde fluxo e roteador se distinguem, exatamente como no
 * `ContactBody.html` deles (`template === 'builder'` vira "Fluxo",
 * `template === 'master'` vira "Roteador"). Não temos imagem de contato, então
 * o avatar é sempre a inicial.
 *
 * NÃO PUBLICADO é o ponto no canto do cartão, como na origem — `rascunho` é o
 * nosso nome para o mesmo estado. O ponto é desenhado no CSS, e o `title` do
 * cartão diz por extenso o que ele significa: cor sozinha não é informação.
 *
 * BLOQUEADO (cadeado, cartão apagado, clique morto) a origem usa para bot que o
 * contrato barrou. Não temos bloqueio por contrato, então não há o que desenhar
 * — está no relatório. `arquivado` nem chega aqui: sai na consulta.
 */
function CartaoDeFluxo({ fluxo }: { fluxo: Fluxo }) {
  const etq = fluxo.tipo === 'roteador' ? ETIQUETA.roteador : ETIQUETA.fluxo;

  const naoPublicado = fluxo.estado !== 'publicado';

  return (
    <Link
      className={naoPublicado ? 'pt-cartao pt-cartao-rascunho' : 'pt-cartao'}
      /* O cartão abre a CASA do contato, e não o construtor: na origem o
         `handleContactClick` vai para `/application/detail/{contato}/home`, e é
         de lá que se escolhe Builder, Atendimento, Canais e o resto. Ir direto
         para o construtor pulava a tela que reúne tudo — e, no roteador, levava
         a um construtor que ele nem liga. */
      href={`/fluxo/${encodeURIComponent(fluxo.id)}`}
      title={naoPublicado ? `${fluxo.nome} — ainda não publicado` : fluxo.nome}
    >
      {/* Com foto, ela ocupa o círculo; sem foto, entra o ícone do produto —
          é o `ng-if="!contact.imageUri"` deles. Em nenhum dos dois casos
          aparecem as iniciais do nome, que era o que tínhamos aqui.

          `<img>` cru e não `next/image`: a foto é uma `data:` URI gravada na
          própria linha, e o otimizador do Next não tem o que otimizar nela. */}
      <span className="pt-cartao-av">
        {fluxo.imagemUrl ? (
          <img className="pt-cartao-foto" src={fluxo.imagemUrl} alt="" />
        ) : (
          <IconePortal nome="bot" tamanho={32} />
        )}
      </span>
      <span className="pt-cartao-nome">{fluxo.nome}</span>
      {/* O ícone é enfeite do lado da palavra, que continua visível e é o
          que o leitor de tela lê. */}
      <span className="pt-cartao-etq">
        <IconePortal nome={fluxo.tipo === 'roteador' ? 'roteador' : 'fluxo'} tamanho={16} />
        <span>{etq}</span>
      </span>
    </Link>
  );
}
