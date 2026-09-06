'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar, Icone, Simbolo, estaAtivo, type ItemDeNavegacao, type NomeDeIcone } from '@pipe/ui';
import { IconeGestao } from './icones-gestao';
import { AlternarTema } from './alternar-tema';
import type { DadosDoCabecalho } from '../lib/cabecalho';

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

const MODULOS: readonly ItemDeNavegacao[] = [{ rotulo: 'Atendimento', href: '/' }];

/** Item de lateral: ícone à esquerda do rótulo, como na tela deles. */
type ItemLateral = { rotulo: string; href: string; icone: NomeDeIcone };

/** Grupo de lateral: abre e fecha pela seta à direita; os filhos ficam recuados. */
type GrupoLateral = { rotulo: string; icone: NomeDeIcone; filhos: readonly ItemDeNavegacao[] };

const ITENS: readonly ItemLateral[] = [
  { rotulo: 'Monitoramento', href: '/', icone: 'painel' },
  { rotulo: 'Histórico', href: '/historico', icone: 'relogio' },
];

/*
 * Os grupos, na ordem e com os nomes da lateral deles, medida em
 * `docs/pesquisa/blip-medidas-monitoramento.md` §3.5: dois itens soltos e cinco
 * grupos, e NADA de configuração no primeiro nível.
 *
 * Cada filho abaixo é uma tela que EXISTE aqui. Onde eles têm item e nós não
 * temos tela, fica a lacuna registrada — nenhum item desabilitado, nenhuma
 * funcionalidade inventada:
 *
 * - Relatórios ├ Atendimento, Satisfação, Calls, Vendas — não temos pesquisa de
 *   satisfação, telefonia nem funil de vendas no modelo.
 * - Comunicação ├ Respostas prontas, Modelos de mensagens — o grupo inteiro é
 *   lacuna: isso vive no app do atendente, não na gestão. Por isso ele não
 *   aparece na lista abaixo.
 * - Regras ├ Atendimento, Horários — só SLA e filas viraram tela.
 * - Atendentes ├ Filas de atendimento, Pausas personalizadas — o que elas
 *   mostrariam está na tela de Operação e no cartão "Status dos atendentes".
 * - Preferências ├ Configurações gerais — está diluída na tela de Dados.
 */
const GRUPOS: readonly GrupoLateral[] = [
  {
    rotulo: 'Relatórios',
    icone: 'grade',
    filhos: [{ rotulo: 'Esforço por atendente', href: '/relatorios/esforco' }],
  },
  {
    rotulo: 'Regras',
    icone: 'funil',
    filhos: [{ rotulo: 'SLA', href: '/configuracoes/regras' }],
  },
  {
    rotulo: 'Atendentes',
    icone: 'pessoas',
    filhos: [{ rotulo: 'Operação', href: '/configuracoes/operacao' }],
  },
  {
    rotulo: 'Preferências',
    icone: 'engrenagem',
    filhos: [{ rotulo: 'Dados', href: '/configuracoes/dados' }],
  },
];

/** Onde vive o app do atendente. O rodapé da lateral aponta para lá. */
const URL_DESK = process.env['NEXT_PUBLIC_PIPE_DESK_URL'] ?? 'http://localhost:3200';

/* ====================================================== barra superior */

function BarraSuperior({ dados }: { dados: DadosDoCabecalho }) {
  return (
    <header className="g-barra g-barra-sup">
      <div className="g-tenant">
        <b>{dados.tenant.nome}</b>
        <span>Plano {dados.tenant.plano}</span>
      </div>

      <Link className="g-marca" href="/">
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
            <p>
              {dados.avisos > 0
                ? `${dados.avisos} pausa(s) acima da duração sugerida pelo motivo.`
                : 'Nenhuma pausa acima da duração sugerida pelo motivo.'}
            </p>
            <Link href="/">Ver o status dos atendentes</Link>
          </div>
        </details>

        <AlternarTema />

        <details className="g-menu">
          <summary
            className="g-iconbtn g-avatar"
            title={dados.tenant.nome}
            aria-label={`Conta de ${dados.tenant.nome}`}
          >
            <Avatar nome={dados.tenant.nome} />
          </summary>
          <div className="g-painel">
            <b>{dados.tenant.nome}</b>
            <p>Plano {dados.tenant.plano}</p>
            <Link href="/configuracoes">Configurações</Link>
            <a href={URL_DESK} target="_blank" rel="noreferrer">
              Abrir o Pipe Desk
            </a>
          </div>
        </details>
      </div>
    </header>
  );
}

/* ====================================================== barra inferior */

const ATALHOS: readonly ItemLateral[] = [
  { rotulo: 'Monitoramento', href: '/', icone: 'painel' },
  { rotulo: 'Histórico', href: '/historico', icone: 'relogio' },
  { rotulo: 'Esforço por atendente', href: '/relatorios/esforco', icone: 'grade' },
  { rotulo: 'Configurações', href: '/configuracoes', icone: 'engrenagem' },
];

function BarraInferior({ dados, caminho }: { dados: DadosDoCabecalho; caminho: string }) {
  const canal = dados.canais[0];
  return (
    <div className="g-barra g-barra-inf">
      <details className="g-menu g-canal">
        <summary>
          <Avatar nome={canal?.nome ?? 'Pipe'} className="g-av-sm" />
          <span>{canal?.nome ?? 'Sem canal'}</span>
          <IconeGestao nome="baixo" tamanho={20} />
        </summary>
        <div className="g-painel">
          <b>Canais do tenant</b>
          {dados.canais.length === 0 ? (
            <p>Nenhum canal cadastrado.</p>
          ) : (
            dados.canais.map((c) => (
              <p key={c.id}>
                {c.nome} <span className="g-tipo">{c.tipo}</span>
              </p>
            ))
          )}
          <Link href="/configuracoes/dados">Ver em Configurações</Link>
        </div>
      </details>

      <nav className="g-modulos" aria-label="Módulos">
        {MODULOS.map((m) => (
          <Link key={m.href} href={m.href} aria-current={estaAtivo(m.href, caminho) ? 'page' : undefined}>
            {m.rotulo}
          </Link>
        ))}
      </nav>

      <nav className="g-barra-fim" aria-label="Atalhos">
        {ATALHOS.map((a) => (
          <Link key={a.href} className="g-iconbtn" href={a.href} title={a.rotulo} aria-label={a.rotulo}>
            <Icone nome={a.icone} tamanho={20} />
          </Link>
        ))}
      </nav>
    </div>
  );
}

/* ============================================================= lateral */

function Lateral({ caminho }: { caminho: string }) {
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
            </details>
          );
        })}
      </div>

      {/* Rodapé: o app do atendente vive em outra origem, como o "blipdesk" deles. */}
      <a className="g-lateral-rodape" href={URL_DESK} target="_blank" rel="noreferrer">
        <IconeGestao nome="externo" tamanho={20} />
        Pipe Desk
      </a>
    </nav>
  );
}

/* ========================================================== estrutura */

export function EstruturaGestao({
  dados,
  children,
}: {
  dados: DadosDoCabecalho;
  children: React.ReactNode;
}) {
  const caminho = usePathname();

  /*
   * UMA estrutura para todas as telas. A área de configurações separada saiu:
   * na lateral deles, Regras, Atendentes e Preferências são grupos da MESMA
   * lateral, e trocar de casco no meio da navegação era a nossa divergência
   * mais visível contra a tela medida.
   */
  return (
    <div className="p-app">
      <BarraSuperior dados={dados} />
      {/* Todo caminho de trabalho pertence a Atendimento: sem normalizar, o
          módulo apagaria ao abrir Histórico ou Esforço. */}
      <BarraInferior dados={dados} caminho="/" />
      <div className="p-miolo">
        <Lateral caminho={caminho} />
        <main className="p-conteudo">{children}</main>
      </div>
    </div>
  );
}
