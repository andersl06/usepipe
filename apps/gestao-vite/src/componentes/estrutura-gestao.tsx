import Link from './link';
import { useLocation } from 'react-router-dom';
import {
  Avatar,
  Icone,
  Simbolo,
  estaAtivo,
  type ItemDeNavegacao,
  type NomeDeIcone,
} from '@pipe/ui';
import { IconeGestao } from './icones-gestao';
import { Outlet } from 'react-router-dom';
import { useSair } from '../lib/casca';
import { useCabecalho, type DadosDoCabecalho } from '../lib/cabecalho';

/**
 * Estrutura da Gestão — a mesma da tela de Monitoramento da Blip, medida na
 * captura e descrita em `docs/pesquisa/plataformas-referencia.md` §1.
 *
 * A DISPOSIÇÃO É A DELES, A TINTA É A NOSSA. Duas barras escuras no topo,
 * lateral clara de 170px com ícone e grupo que abre, rodapé com o atalho para
 * o app do atendente. Onde eles pintam de azul, nós pintamos de moss; os
 * cinzas e o creme saem dos nossos token de superfície. Nenhum hex deles entra
 * aqui.
 *
 * **Barra superior**, a mais escura: o tenant à esquerda em duas linhas (nome e
 * plano), a marca centralizada, e à direita ajuda, avisos e o avatar. É a barra
 * da CONTA — nada do trabalho mora nela.
 *
 * **Barra inferior**, um degrau mais clara: o canal com a seta à esquerda, os
 * módulos centralizados, e a fileira de atalhos à direita. É a barra do
 * PRODUTO.
 *
 * Continua valendo, e é o que impede a volta dos 32 itens com 29 apagados:
 * **nenhum item desabilitado** — cada ícone destas barras abre alguma coisa de
 * verdade, e o sino conta pausa estourada de verdade — e **configuração atrás
 * da engrenagem**, em tela própria.
 */

/*
 * A fileira central da barra de baixo, na ordem medida na deles
 * (`blip-medidas-monitoramento.md` §2): Builder, Atendimento, Análise, Growth,
 * Canais, e o "…" no fim.
 *
 * `raizes` é o que decide qual módulo está sublinhado: o caminho da rota
 * pertence ao módulo cuja raiz o prefixa. Sem isso, abrir Satisfação apagaria
 * a barra inteira, que era o defeito de quando havia um módulo só.
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
    rotulo: 'Atendimento',
    href: '/monitoramento',
    raizes: [
      '/monitoramento',
      '/historico',
      '/comunicacao',
      '/regras',
      '/atendentes',
      '/configuracoes',
      '/implantacao',
    ],
    resumo: 'Monitoramento, histórico e as regras da operação.',
  },
  {
    rotulo: 'Análise',
    href: '/relatorios/atendimento',
    raizes: ['/relatorios', '/monitoria'],
    resumo: 'Os relatórios do período e a monitoria, com a população de cada número.',
  },
  {
    rotulo: 'Growth',
    href: '/growth',
    raizes: ['/growth'],
    resumo: 'Mensagem ativa e campanha, fora da janela de 24 horas.',
  },
  {
    rotulo: 'Canais',
    href: '/canais',
    raizes: ['/canais'],
    resumo: 'O que está conectado, e por qual chave.',
  },
];

/*
 * A barra deles mostra CINCO módulos e joga o resto no "…". O corte é por
 * CONTAGEM, não por largura disponível: eles fatiam a lista em cinco e o que
 * sobra vira o menu do "…", que só é renderizado quando sobra alguma coisa.
 *
 * Registrado aqui porque é a regra que decide o que a barra faz no dia em que
 * o sexto módulo nascer — e, com cinco, ela faz o "…" sumir.
 */
const LIMITE_VISIVEL = 5;
const VISIVEIS = MODULOS.slice(0, LIMITE_VISIVEL);
const EXCEDENTES = MODULOS.slice(LIMITE_VISIVEL);

/** O módulo dono do caminho. A raiz mais longa ganha, senão `/` levaria tudo. */
function moduloDoCaminho(caminho: string): Modulo {
  let escolhido = MODULOS[1]!;
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

/** Item de lateral: ícone à esquerda do rótulo, como na tela deles. */
type ItemLateral = { rotulo: string; href: string; icone: NomeDeIcone };

/** Grupo de lateral: abre e fecha pela seta à direita; os filhos ficam recuados. */
type GrupoLateral = { rotulo: string; icone: NomeDeIcone; filhos: readonly ItemDeNavegacao[] };

const ITENS: readonly ItemLateral[] = [
  { rotulo: 'Monitoramento', href: '/monitoramento', icone: 'painel' },
  { rotulo: 'Histórico', href: '/historico', icone: 'relogio' },
];

/*
 * A lateral do módulo Análise. Os relatórios SAÍRAM da lateral de Atendimento
 * quando Análise virou módulo próprio — na barra deles é assim, e manter os
 * mesmos três em dois lugares faria a pessoa procurar duas vezes.
 *
 * As rotas continuam em `/relatorios/*`: o módulo mudou, o endereço não, e
 * link antigo que ninguém quebrou é link que continua funcionando.
 */
const ITENS_ANALISE: readonly ItemLateral[] = [
  { rotulo: 'Atendimento', href: '/relatorios/atendimento', icone: 'painel' },
  { rotulo: 'Satisfação', href: '/relatorios/satisfacao', icone: 'cheque' },
  { rotulo: 'Esforço por atendente', href: '/relatorios/esforco', icone: 'pessoas' },
  /* A monitoria mora em Análise, e não em Atendimento, porque ela olha conversa
     já encerrada: é leitura do passado, como os três relatórios acima. A rota
     fica fora de `/relatorios/*` porque a ficha de uma avaliação não é
     relatório de período — é o registro de um caso. */
  { rotulo: 'Monitoria com IA', href: '/monitoria', icone: 'cheque' },
];

/*
 * Os grupos, na ordem e com os nomes da lateral deles, medida em
 * `docs/pesquisa/blip-medidas-monitoramento.md` §3.5, menos Relatórios, que
 * saiu para a lateral do módulo Análise: dois itens soltos e quatro grupos, e
 * NADA de configuração no primeiro nível.
 *
 * Cada filho abaixo é uma tela que EXISTE aqui. Onde eles têm item e nós não
 * temos tela, fica a lacuna registrada — nenhum item desabilitado, nenhuma
 * funcionalidade inventada:
 *
 * - Relatórios ├ Calls, Vendas — não temos telefonia, e funil de vendas é do CRM,
 *   não da gestão de atendimento.
 *
 * As duas lacunas que estavam registradas aqui — Regras ├ Atendimento e
 * Preferências ├ Configurações gerais — viraram tela. A primeira é a regra de
 * entrada da §8 da spec de métricas; a segunda é o cartão de configuração
 * medido em `blip-telas-cadastro.md` §3, com o Salvar próprio de cada cartão.
 */
const GRUPOS: readonly GrupoLateral[] = [
  {
    rotulo: 'Comunicação',
    icone: 'balao',
    filhos: [
      { rotulo: 'Respostas prontas', href: '/comunicacao/respostas-prontas' },
      { rotulo: 'Modelos de mensagens', href: '/comunicacao/modelos' },
    ],
  },
  {
    rotulo: 'Regras',
    icone: 'funil',
    filhos: [
      { rotulo: 'Atendimento', href: '/regras/atendimento' },
      { rotulo: 'SLA', href: '/configuracoes/regras' },
      { rotulo: 'Horários', href: '/regras/horarios' },
    ],
  },
  {
    rotulo: 'Atendentes',
    icone: 'pessoas',
    filhos: [
      /* A ordem é a deles: Gestão de atendentes primeiro, depois filas, depois
         pausas. "Operação" saiu — ela mostrava o quadro de atendentes, que
         agora é o primeiro item, mais uma cópia só-leitura dos motivos de
         pausa, que já têm tela com formulário logo abaixo. */
      { rotulo: 'Gestão de atendentes', href: '/atendentes/gestao' },
      { rotulo: 'Filas de atendimento', href: '/atendentes/filas' },
      { rotulo: 'Pausas personalizadas', href: '/atendentes/pausas' },
    ],
  },
  {
    rotulo: 'Preferências',
    icone: 'engrenagem',
    filhos: [
      /* O assistente de implantação: do contrato à primeira conversa atendida. */
      { rotulo: 'Implantação', href: '/implantacao' },
      { rotulo: 'Configurações gerais', href: '/configuracoes/gerais' },
      { rotulo: 'Dados', href: '/configuracoes/dados' },
    ],
  },
];

/** Onde vive o app do atendente. O rodapé da lateral aponta para lá. */
const URL_DESK =
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
            <Link href="/monitoramento">Ver o status dos atendentes</Link>
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
            <Link href="/configuracoes">Configurações</Link>
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

const ATALHOS: readonly ItemLateral[] = [
  { rotulo: 'Monitoramento', href: '/monitoramento', icone: 'painel' },
  { rotulo: 'Histórico', href: '/historico', icone: 'relogio' },
  { rotulo: 'Esforço por atendente', href: '/relatorios/esforco', icone: 'grade' },
  { rotulo: 'Configurações', href: '/configuracoes', icone: 'engrenagem' },
];

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
          <Link href="/configuracoes/dados">Ver em Configurações</Link>
        </div>
      </details>

      <nav className="g-modulos" aria-label="Módulos">
        {VISIVEIS.map((m) => (
          <Link key={m.href} href={m.href} aria-current={m === ativo ? 'page' : undefined}>
            {m.rotulo}
          </Link>
        ))}

        {/* O "…" só existe quando SOBRA módulo, e mostra exatamente o que
            sobrou. Ver a nota de `LIMITE_VISIVEL`. Com cinco módulos ele não
            aparece, e é assim que tem de ser: um "…" que abre a mesma fileira
            que já está na tela é cromo fingindo que há mais coisa. */}
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

      <nav className="g-barra-fim" aria-label="Atalhos">
        {ATALHOS.map((a) => (
          <Link
            key={a.href}
            className="g-iconbtn"
            href={a.href}
            title={a.rotulo}
            aria-label={a.rotulo}
          >
            <Icone nome={a.icone} tamanho={20} />
          </Link>
        ))}
      </nav>
    </div>
  );
}

/* ============================================================= lateral */

/*
 * Cada módulo traz a sua lateral, e três deles não trazem nenhuma.
 *
 * Builder, Growth e Canais ocupam a largura inteira de propósito: na
 * plataforma deles o construtor de fluxo e o roteador NÃO usam este casco — é
 * outra tela, com outra disposição — e uma lateral de um item só seria cromo
 * fingindo profundidade que a tela não tem.
 */
function Lateral({ caminho }: { caminho: string }) {
  const modulo = moduloDoCaminho(caminho);
  if (modulo.rotulo === 'Análise') {
    return (
      <nav className="g-lateral" aria-label="Análise">
        <div className="g-lateral-itens">
          {ITENS_ANALISE.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className="g-item"
              aria-current={estaAtivo(i.href, caminho) ? 'page' : undefined}
            >
              <Icone nome={i.icone} tamanho={24} />
              {i.rotulo}
            </Link>
          ))}
        </div>

        {/* Marca à esquerda, ícone de "abre fora" à direita — os dois extremos
            do rodapé deles. Ver `blip-gestao-medidas.md` §4.2. */}
        <a className="g-lateral-rodape" href={URL_DESK} target="_blank" rel="noreferrer">
          Pipe Desk
          <IconeGestao nome="externo" tamanho={20} />
        </a>
      </nav>
    );
  }
  if (modulo.rotulo !== 'Atendimento') return null;

  return (
    <nav className="g-lateral" aria-label="Atendimento">
      <div className="g-lateral-itens">
        {ITENS.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className="g-item"
            aria-current={estaAtivo(i.href, caminho) ? 'page' : undefined}
          >
            <Icone nome={i.icone} tamanho={24} />
            {i.rotulo}
          </Link>
        ))}

        {GRUPOS.map((g) => {
          const aberto = g.filhos.some((f) => estaAtivo(f.href, caminho));
          return (
            <details key={g.rotulo} className="g-grupo" open={aberto}>
              <summary className="g-item">
                <Icone nome={g.icone} tamanho={24} />
                {g.rotulo}
                <IconeGestao nome="baixo" tamanho={20} />
              </summary>
              {/* Os filhos vivem num contêiner próprio porque o grupo aberto
                  deles NÃO é uma lista solta: é uma lista recuada 23px ao lado
                  de uma GUIA VERTICAL de 2px que corre do primeiro ao último
                  filho. A guia é o que diz "estes pertencem àquele" quando dois
                  grupos estão abertos ao mesmo tempo, e a barra do item ativo
                  monta em cima dela, no mesmo x. Sem um contêiner não há onde
                  ancorar a guia. Medida em `blip-gestao-medidas.md` §4. */}
              <div className="g-grupo-filhos">
                {g.filhos.map((f) => (
                  <Link
                    key={f.href}
                    href={f.href}
                    className="g-subitem"
                    aria-current={estaAtivo(f.href, caminho) ? 'page' : undefined}
                  >
                    {f.rotulo}
                  </Link>
                ))}
              </div>
            </details>
          );
        })}
      </div>

      {/* Rodapé: o app do atendente vive em outra origem, como o "blipdesk" deles. */}
      <a className="g-lateral-rodape" href={URL_DESK} target="_blank" rel="noreferrer">
        Pipe Desk
        <IconeGestao nome="externo" tamanho={20} />
      </a>
    </nav>
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
  /^\/(entrar|convite|portal|novidades|criar|contrato|fluxo|bem-vindo|minha-conta|trocar-conta)(\/|$)/;

/**
 * Como rota-pai do React Router: as telas de operação penduram aqui e saem
 * pelo `<Outlet>`. As de casco próprio têm as próprias rotas, fora desta.
 */
export function EstruturaGestao() {
  const caminho = useLocation().pathname;
  const dados = useCabecalho();

  if (CASCO_PROPRIO.test(caminho)) return <Outlet />;

  /*
   * UMA estrutura para todas as telas. A área de configurações separada saiu:
   * na lateral deles, Regras, Atendentes e Preferências são grupos da MESMA
   * lateral, e trocar de casco no meio da navegação era a nossa divergência
   * mais visível contra a tela medida.
   */
  return (
    <div className="p-app">
      <BarraSuperior dados={dados} />
      <BarraInferior dados={dados} caminho={caminho} />
      <div className="p-miolo">
        <Lateral caminho={caminho} />
        <main className="p-conteudo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
