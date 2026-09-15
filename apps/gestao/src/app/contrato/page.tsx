import type { Metadata } from 'next';
import Link from 'next/link';
import { Avatar } from '@pipe/ui';
import { BarraDoPortal } from '../../componentes/barra-do-portal';
import { IconePortal } from '../../componentes/icones-portal';
import { exigirEu } from '../../lib/banco';
import { carregarResumoDoContrato, type ResumoDoContrato } from '../../lib/contrato';
import { carregarCascaDoPortal } from '../../lib/portal';
import { BotaoCopiar } from './copiar';
import { cartoesVisiveis, permissaoExigida, porGrupo, type CartaoDoContrato } from './catalogo';
import './contrato.css';

/**
 * Painel do contrato — a tela que o cartão "Acompanhe seu contrato" do portal
 * abre.
 *
 * A régua é `docs/pesquisa/blip-painel-do-contrato.md`, a pesquisa do
 * micro-frontend `{conta}.tenant.fragment.blip.ai`. A DISPOSIÇÃO É A DELES: o
 * cartão de resumo numa coluna estreita à esquerda, os grupos de cartões numa
 * coluna larga à direita, grade de `1fr 3fr` com 32 de vão.
 *
 * **O que muda a tela é o PAPEL**, como lá. A diferença é de onde o papel vem:
 * eles têm três chumbados no front (`admin`/`member`/`guest`) e uma matriz
 * literal no código; nós temos RBAC de verdade no banco, e a matriz virou onze
 * permissões (`conta.*`, migração `0019_permissoes_da_conta`). O funil ficou de
 * um passo só — `hasPermission` por cartão — porque os outros dois passos deles
 * são flag do LaunchDarkly e métrica de assinatura, e não temos nenhum dos dois.
 * O que ficou de fora por isso está listado no cabeçalho de `catalogo.ts`.
 *
 * O cromo é o do PORTAL (`pt-app` + `BarraDoPortal`), como em "Novidades": na
 * origem este painel roda num iframe dentro do portal, com a barra escura
 * inteira por cima. Por isso `/contrato` está na lista de casco próprio de
 * `estrutura-gestao.tsx`.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Painel do contrato · Pipe',
  description: 'Os dados do contrato, quem tem acesso e o que cada um pode.',
};

export default async function PaginaDoContrato({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const [eu, casca, resumo, parametros] = await Promise.all([
    exigirEu(),
    carregarCascaDoPortal(),
    carregarResumoDoContrato(),
    searchParams,
  ]);

  /* O modo demonstração é SÓ isto: um `?demo=1` na URL que faz o filtro devolver
     o catálogo inteiro. Não mexe em sessão, não vira cookie, não chega a
     nenhuma Server Action — ver o cabeçalho de `acoes.ts`. */
  const demonstracao = parametros.demo === '1';
  const secoes = porGrupo(cartoesVisiveis(eu.permissoes, { demonstracao }));
  const podeEditarResumo = eu.permissoes.includes('conta.resumo.escrever');

  return (
    <div className="pt-app">
      <BarraDoPortal dados={casca} />

      {demonstracao ? <FaixaDeDemonstracao /> : null}

      <main className="pt-conteudo">
        {/* Sem nenhum grupo o cartão de resumo deita e ocupa a largura toda —
            é o `horizontal` deles (`Ve`, `grid-column: 1 / 3`), o estado do
            `guest`. */}
        <div className={secoes.length === 0 ? 'ct-grade ct-grade--faixa' : 'ct-grade'}>
          <CartaoDeResumo
            resumo={resumo}
            podeEditar={podeEditarResumo}
            faixa={secoes.length === 0}
          />

          <div className="ct-grupos">
            {secoes.length === 0 ? (
              /* O estado do `guest` deles: só o cartão de resumo, e nada mais.
                 Uma linha de texto explicando, em vez de um branco que parece
                 tela quebrada. */
              <p className="pt-nada">
                Você tem acesso de leitura a este contrato. As configurações do contrato ficam com
                quem administra a conta.
              </p>
            ) : (
              secoes.map(({ grupo, cartoes }) => (
                <section key={grupo.id} className="ct-secao">
                  <h2 className="ct-titulo">
                    {grupo.titulo}
                    {/* O ícone de informação com tooltip que eles põem ao lado
                        de cada título de grupo — `bds-icon name="info"
                        theme="solid"` sem `size`, e o padrão do componente é
                        `medium`, 24. `title` nativo: o tooltip deles não faz
                        nada que o do navegador não faça. */}
                    <span className="ct-info" title={grupo.tooltip} aria-label={grupo.tooltip}>
                      <IconePortal nome="informacao" tamanho={24} />
                    </span>
                  </h2>

                  <div className="ct-cartoes">
                    {cartoes.map((cartao) => (
                      <Cartao
                        key={cartao.id}
                        cartao={cartao}
                        demonstracao={demonstracao}
                        temPermissao={eu.permissoes.includes(permissaoExigida(cartao))}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------ demonstração */

function FaixaDeDemonstracao() {
  return (
    <div className="ct-previa" role="status">
      <b>Prévia do painel.</b> Você está vendo todos os cartões, como se o contrato tivesse o plano
      mais alto e você fosse administrador. Nada aqui pode ser salvo neste modo.
      <Link href="/contrato">Sair da prévia</Link>
    </div>
  );
}

/* --------------------------------------------------------- cartão de resumo */

/** A data como eles escrevem: `13.09.2026`. */
function dataComPontos(instante: Date | null, fuso: string): string {
  if (!instante) return '—';
  return instante
    .toLocaleDateString('pt-BR', {
      timeZone: fuso,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
    .replaceAll('/', '.');
}

function CartaoDeResumo({
  resumo,
  podeEditar,
  faixa,
}: {
  resumo: ResumoDoContrato;
  podeEditar: boolean;
  faixa: boolean;
}) {
  return (
    <aside className={faixa ? 'ct-resumo ct-resumo--faixa' : 'ct-resumo'}>
      {/* A foto do contrato, na caixa de 92 deles (`.avatar.placeholder`) com o
          avatar de 72 (`bds-avatar size="extra-large"`) centrado dentro.
          Editável pela mesma regra do nome — e o lugar onde se edita já existe:
          "Minha conta". Refazer o formulário aqui daria dois caminhos para a
          mesma gravação. */}
      <div className="ct-foto-caixa">
        {resumo.logoUrl ? (
          <img className="ct-foto" src={resumo.logoUrl} alt="" width={72} height={72} />
        ) : (
          <Avatar nome={resumo.nome} className="ct-foto" />
        )}
      </div>

      {/* `He`: tudo o que não é a foto. Existe para que o cartão deitado possa
          recuar o corpo em 32 sem mexer no cartão em pé. */}
      <div className="ct-corpo">
        <div className="ct-bloco">
          {/* O rótulo "Nome do contrato" que eles põem acima do nome. */}
          <span className="ct-rotulo">Nome do contrato</span>
          <h1 className="ct-nome">{resumo.nome}</h1>

          {/* O `{id}.blip.ai` deles, em negrito com botão de copiar. O nosso
              identificador de endereço é o slug da conta. */}
          <p className="ct-endereco">
            <b>{resumo.slug}</b>
            <BotaoCopiar valor={resumo.slug} oQue="o endereço do contrato" />
          </p>
        </div>

        {podeEditar ? (
          <p className="ct-bloco">
            <Link className="ct-editar" href="/minha-conta">
              Editar os dados do contrato
            </Link>
          </p>
        ) : null}

        <dl className="ct-dados">
          <div className="ct-bloco">
            <dt>ID</dt>
            <dd>
              <span className="ct-id">{resumo.id}</span>
              <BotaoCopiar valor={resumo.id} oQue="o ID do contrato" />
            </dd>
          </div>

          <div className="ct-bloco">
            <dt>Data de criação</dt>
            <dd>{dataComPontos(resumo.criadoEm, resumo.fuso)}</dd>
          </div>

          {/* "Chatbots" e "Membros" só aparecem quando há — é o `ng-if` deles. */}
          {resumo.fluxos > 0 ? (
            <div className="ct-bloco">
              <dt>Fluxos e roteadores</dt>
              <dd>{resumo.fluxos}</dd>
            </div>
          ) : null}

          {resumo.membros > 0 ? (
            <div className="ct-bloco">
              <dt>Membros</dt>
              <dd>{resumo.membros}</dd>
            </div>
          ) : null}
        </dl>

        {/* "Deixar contrato" fica no pé do cartão, como lá. Apagado porque sair
            de verdade é mais do que apagar um vínculo: na origem a tela primeiro
            pergunta ao servidor se a pessoa é admin ÚNICA de algum chatbot e
            bloqueia se for, depois encerra a sessão e joga em outro contrato. Os
            dois passos são da `api`, e ela ainda não tem essa porta. */}
        <div className="ct-rodape">
          <span className="pt-obra">
            Deixar contrato
            <span className="pt-obra-selo">em breve</span>
          </span>
        </div>
      </div>
    </aside>
  );
}

/* ----------------------------------------------------------------- cartões */

function Cartao({
  cartao,
  demonstracao,
  temPermissao,
}: {
  cartao: CartaoDoContrato;
  demonstracao: boolean;
  temPermissao: boolean;
}) {
  /* Na prévia, o rótulo do que esconderia o cartão no mundo real: a permissão
     que falta e, quando havia uma na origem, a flag. É o que o painel serve
     para explicar. */
  const porQueSumiria = demonstracao
    ? [temPermissao ? null : `exige ${permissaoExigida(cartao)}`, cartao.flagNaOrigem]
        .filter((p) => p !== null && p !== undefined)
        .join(' · ')
    : '';

  const miolo = (
    <>
      {/* `de`: caixa de 48 com o ícone `size="xx-large"` (36) dentro. */}
      <span className="ct-cartao-icone">
        <IconePortal nome={cartao.icone} tamanho={36} />
      </span>
      <span className="ct-cartao-texto">
        {/* A fileira `flex row justify-between` deles: título à esquerda,
            etiqueta encostada na direita. */}
        <span className="ct-cartao-titulo">
          <b>{cartao.titulo}</b>
          {cartao.pronto ? null : <span className="pt-obra-selo">em breve</span>}
        </span>
        <span>{cartao.descricao}</span>
        {porQueSumiria ? <span className="ct-porque">{porQueSumiria}</span> : null}
      </span>
    </>
  );

  /* Cartão cuja rota ainda não existe fica no lugar, apagado e com o selo — é
     o que o portal já faz com o que está em obra (`pt-obra`), e some-lo
     esconderia que o produto o tem. */
  if (!cartao.pronto) {
    return <div className="ct-cartao pt-obra">{miolo}</div>;
  }

  return (
    <Link className="ct-cartao" href={cartao.rota}>
      {miolo}
    </Link>
  );
}
