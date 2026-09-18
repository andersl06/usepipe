import Link from './link';
import { useLocation } from 'react-router-dom';
import { Avatar, Simbolo, estaAtivo, type ItemDeNavegacao } from '@pipe/ui';
import { IconeGestao } from './icones-gestao';
import { Outlet } from 'react-router-dom';
import { useSair } from '../lib/casca';
import { useCabecalho, type DadosDoCabecalho } from '../lib/cabecalho';

/**
 * Estrutura da Gestão — o casco do portal PARALELO que existia para as telas
 * de Atendimento (Monitoramento, Histórico, Relatórios, Atendentes,
 * Comunicação, Regras, Preferências, Canais de atendimento) enquanto elas
 * viviam soltas na raiz. Essas telas se mudaram para dentro do contato —
 * `/{tipo}/:id/atendimento/*`, casco em `paginas/operacao/casca.tsx` — que é
 * a moldura de verdade da origem (barra do portal + barra do contato +
 * `desk-sidebar`). Ver o mapa completo no relatório da tarefa que fez a
 * mudança.
 *
 * O que sobra aqui é o casco para as três telas que NÃO pertencem a nenhum
 * contato — Builder, Growth e Implantação — enquanto elas não ganham (Builder,
 * Growth) ou não precisam (Implantação, que é onboarding de conta) de uma
 * moldura própria. Duas barras escuras no topo, sem lateral: Builder e Growth
 * já desenhavam tela cheia por escolha (o construtor de fluxo e o roteador não
 * usam este casco na origem), e sem o módulo Atendimento não sobra nenhuma
 * lateral para desenhar.
 *
 * **Barra superior**, a mais escura: o tenant à esquerda em duas linhas (nome e
 * plano), a marca centralizada, e à direita ajuda, avisos e o avatar. É a barra
 * da CONTA — nada do trabalho mora nela.
 *
 * **Barra inferior**, um degrau mais clara: o canal com a seta à esquerda e os
 * módulos centralizados. É a barra do PRODUTO.
 */

/*
 * Só Builder e Growth sobraram: Atendimento, Análise e Canais eram os módulos
 * das telas que se mudaram para dentro do contato (ver o cabeçalho do
 * arquivo). `raizes` continua sendo o que decide qual módulo está sublinhado
 * — a raiz mais longa que prefixa o caminho ganha.
 *
 * Builder e Growth abrem tela de verdade, e a tela diz o que ainda não existe
 * ali. É a fronteira que a régua permite: item apagado, nunca; item que abre
 * uma página honesta sobre o que vem, sim.
 */
type Modulo = ItemDeNavegacao & { raizes: readonly string[]; resumo: string };

const MODULOS: readonly Modulo[] = [
  {
    rotulo: 'Builder',
    href: '/builder',
    raizes: ['/builder'],
    resumo: 'O fluxo que atende antes da pessoa.',
  },
  {
    rotulo: 'Growth',
    href: '/growth',
    raizes: ['/growth'],
    resumo: 'Mensagem ativa e campanha, fora da janela de 24 horas.',
  },
];

const VISIVEIS = MODULOS;
const EXCEDENTES: readonly Modulo[] = [];

/**
 * O módulo dono do caminho, ou nenhum — `/implantacao` não é Builder nem
 * Growth, e não tem por que acender um dos dois. A raiz mais longa ganha.
 */
function moduloDoCaminho(caminho: string): Modulo | undefined {
  let escolhido: Modulo | undefined;
  let maior = -1;
  for (const m of MODULOS) {
    for (const raiz of m.raizes) {
      if (!estaAtivo(raiz, caminho)) continue;
      if (raiz.length > maior) {
        maior = raiz.length;
        escolhido = m;
      }
    }
  }
  return escolhido;
}

/** Onde vive o app do atendente. O rodapé da lateral aponta para lá. */
export const URL_DESK =
  (import.meta.env['VITE_PIPE_DESK_URL'] as string | undefined) ?? 'http://localhost:3200';

/* ====================================================== barra superior */

function BarraSuperior({ dados }: { dados: DadosDoCabecalho }) {
  const sair = useSair();
  return (
    <header className="g-barra g-barra-sup">
      <div className="g-tenant">
        <b>{dados.tenant.nome}</b>
        <span>Plano {dados.tenant.plano}</span>
      </div>

      <Link className="g-marca" href="/portal">
        <Simbolo tamanho={29} />
        <b>Pipe Gestão</b>
      </Link>

      <div className="g-barra-fim">
        <details className="g-menu">
          <summary className="g-iconbtn" title="Ajuda" aria-label="Ajuda">
            <IconeGestao nome="ajuda" tamanho={20} />
          </summary>
          <div className="g-painel">
            <b>Como ler esta tela</b>
            <p>
              Os cartões de cima olham conversas ainda abertas neste instante, com o cronômetro
              correndo.
            </p>
            <p>
              Os cartões de hoje olham conversas encerradas dentro do período, com o cronômetro
              parado. Misturar as duas populações é o erro clássico de painel de atendimento.
            </p>
            <p>
              O ícone de informação ao lado de cada rótulo traz a fórmula e a população daquele
              número.
            </p>
          </div>
        </details>

        <details className="g-menu">
          <summary className="g-iconbtn" title="Avisos" aria-label={`Avisos (${dados.avisos})`}>
            <IconeGestao nome="sino" tamanho={20} />
            {dados.avisos > 0 ? <span className="g-selo">{dados.avisos}</span> : null}
          </summary>
          <div className="g-painel">
            <b>Avisos</b>
            {/* O estado vazio é o deles, literal. */}
            <p>
              {dados.avisos > 0
                ? `${dados.avisos} pausa(s) acima da duração sugerida pelo motivo.`
                : 'Você não tem nenhuma notificação'}
            </p>
          </div>
        </details>

        {/* O avatar é de QUEM ESTÁ LOGADO, não do cliente: é o gesto que a
            pessoa procura para conferir com que conta entrou e para sair. O
            nome do cliente continua na ponta esquerda desta mesma barra. */}
        <details className="g-menu">
          <summary
            className="g-iconbtn g-avatar"
            title={dados.usuario?.nome ?? dados.tenant.nome}
            aria-label={`Conta de ${dados.usuario?.nome ?? dados.tenant.nome}`}
          >
            <Avatar nome={dados.usuario?.nome ?? dados.tenant.nome} />
          </summary>
          <div className="g-painel">
            {dados.usuario ? (
              <div className="eu-bloco">
                <b>{dados.usuario.nome}</b>
                <span>{dados.usuario.email}</span>
                <span>
                  {dados.tenant.nome} · plano {dados.tenant.plano}
                </span>
              </div>
            ) : (
              <b>{dados.tenant.nome}</b>
            )}
            <a href={URL_DESK} target="_blank" rel="noreferrer">
              Abrir o Pipe Desk
            </a>
            {dados.usuario ? (
              <form
                className="eu-sair"
                onSubmit={(evento) => {
                  evento.preventDefault();
                  void sair();
                }}
              >
                <button type="submit" className="btn">
                  Sair
                </button>
              </form>
            ) : null}
          </div>
        </details>
      </div>
    </header>
  );
}

/* ====================================================== barra inferior */

function BarraInferior({ dados, caminho }: { dados: DadosDoCabecalho; caminho: string }) {
  const canal = dados.canais[0];
  const ativo = moduloDoCaminho(caminho);
  return (
    <div className="g-barra g-barra-inf">
      <details className="g-menu g-canal">
        <summary>
          {/* O ponto de status monta sobre o canto do ícone, como na barra
              deles: 13px no vértice, verde ligado e vermelho desligado. */}
          <span className="g-canal-av">
            <Avatar nome={canal?.nome ?? 'Pipe'} className="g-av-sm" />
            {canal ? (
              <i
                className={canal.ativo ? 'g-ponto g-ponto-on' : 'g-ponto'}
                title={canal.ativo ? 'Canal ligado' : 'Canal desligado'}
              />
            ) : null}
          </span>
          <span className="g-canal-nome">{canal?.nome ?? 'Sem canal'}</span>
          <IconeGestao nome="baixo" tamanho={20} />
        </summary>
        <div className="g-painel">
          <b>Canais do tenant</b>
          {dados.canais.length === 0 ? (
            <p>Nenhum canal cadastrado.</p>
          ) : (
            dados.canais.map((c) => (
              <p key={c.id}>
                {c.nome}{' '}
                <span className="g-tipo">{c.ativo ? c.tipo : `${c.tipo} · desligado`}</span>
              </p>
            ))
          )}
        </div>
      </details>

      <nav className="g-modulos" aria-label="Módulos">
        {VISIVEIS.map((m) => (
          <Link key={m.href} href={m.href} aria-current={m === ativo ? 'page' : undefined}>
            {m.rotulo}
          </Link>
        ))}

        {/* O "…" só existe quando SOBRA módulo — com só Builder e Growth,
            `EXCEDENTES` fica vazio e ele nem chega a aparecer. */}
        {EXCEDENTES.length > 0 ? (
          <details className="g-menu g-mais">
            <summary className="g-iconbtn" title="Mais módulos" aria-label="Mais módulos">
              <IconeGestao nome="reticencias" tamanho={24} />
            </summary>
            <div className="g-painel">
              {EXCEDENTES.map((m) => (
                <Link key={m.href} href={m.href}>
                  {m.rotulo} <span className="g-tipo">{m.resumo}</span>
                </Link>
              ))}
            </div>
          </details>
        ) : null}
      </nav>
    </div>
  );
}

/* ========================================================== estrutura */

/**
 * As rotas que trazem o PRÓPRIO casco, e por isso passam inteiras por aqui.
 *
 * `entrar` e `convite` são as duas públicas do produto: quem chega nelas não
 * está logado, e todo o cromo desta estrutura mostra dado de tenant.
 *
 * `portal` é logada, mas copia outra tela: lá o cromo é UMA barra de 80px com
 * o seletor de conta à esquerda, e não as duas barras com lateral. Empilhar as
 * duas coisas daria 136px de cromo antes do primeiro cartão — 56px que a tela
 * medida não tem. Ver o cabeçalho próprio em `app/portal/page.tsx`.
 *
 * `novidades` pendura no PORTAL, e não no produto: lá a barra escura continua e
 * a lateral do atendimento não existe, então a tela monta o próprio casco com a
 * `BarraDoPortal` (ver `app/novidades/page.tsx`).
 *
 * `bem-vindo` e `minha-conta` são os dois passos do onboarding: a conta acabou
 * de nascer e ainda não tem canal, fila nem atendente — o cromo mostraria uma
 * operação vazia para quem ainda nem disse de que empresa é.
 */
const CASCO_PROPRIO =
  /^\/(entrar|convite|portal|novidades|criar|contrato|fluxo|roteador|bem-vindo|minha-conta|trocar-conta)(\/|$)/;

/**
 * Como rota-pai do React Router: as telas de operação penduram aqui e saem
 * pelo `<Outlet>`. As de casco próprio têm as próprias rotas, fora desta.
 */
export function EstruturaGestao() {
  const caminho = useLocation().pathname;
  const dados = useCabecalho();

  if (CASCO_PROPRIO.test(caminho)) return <Outlet />;

  /* Sem lateral: nenhum dos módulos que sobraram (Builder, Growth) ou das
     rotas sem módulo (Implantação) tem uma. */
  return (
    <div className="p-app">
      <BarraSuperior dados={dados} />
      <BarraInferior dados={dados} caminho={caminho} />
      <div className="p-miolo">
        <main className="p-conteudo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
