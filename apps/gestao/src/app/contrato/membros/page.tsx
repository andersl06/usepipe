import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BarraDoPortal } from '../../../componentes/barra-do-portal';
import { IconePortal } from '../../../componentes/icones-portal';
import { exigirEu } from '../../../lib/banco';
import {
  carregarMembros,
  carregarPapeisDaConta,
  carregarResumoDoContrato,
} from '../../../lib/contrato';
import { carregarCascaDoPortal } from '../../../lib/portal';
import { PAPEIS_DA_ORIGEM, ehPapelDeConta } from '../catalogo';
import '../contrato.css';
import { ConvidarMembros } from './convidar';
import { AbasDeMembros, TabelaDeMembros } from './tabela';

/**
 * Membros — o cartão "Adicione e exclua membros do contrato" do painel, que na
 * origem abre a rota `/panel` do fragmento.
 *
 * Quem entra aqui precisa de `conta.membros.ler`, e a conferência é a DE
 * VERDADE: o `?demo=1` do painel é só desenho e não abre porta nenhuma. Quem
 * chegar sem a permissão volta para o painel.
 *
 * O contrato de dados da origem está em `docs/pesquisa/blip-membros-do-contrato.md`.
 * A casca é a de lá: a seta de voltar e "Membros do contrato {nome}" no alto
 * (`setHeaderContent({ redirect: "/", text: … })`), e abaixo um cartão só, com a
 * tabela de seleção dentro. O que o painel chama de descrição do cartão
 * ("Adicione e exclua membros do contrato") **não** se repete aqui: lá também
 * não se repete.
 *
 * Os papéis são os três DA CONTA (migração 0021) e aparecem com os rótulos
 * deles — "Admin", "Pode editar", "Pode visualizar" —, nunca com o nome do
 * banco. Gestor, supervisor, atendente e avaliador são de atendimento e não
 * entram aqui: na origem eles são dados por contato.
 *
 * **Convidar** fica abaixo da tabela, à direita, só para quem escreve — como o
 * `bp-btn--blip-dark` deles. Quem grava é a `api` (`POST /v1/convites`), e o
 * link volta pelo estado do modal, nunca pela URL (ver `convidarMembros`). Os
 * convites emitidos aparecem na lista com "(Pendente)", como na origem.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Membros do contrato · Pipe',
  description: 'Quem tem acesso a este contrato e o que cada um pode.',
};

export default async function PaginaDeMembros({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const eu = await exigirEu();
  if (!eu.permissoes.includes('conta.membros.ler')) redirect('/contrato');

  const podeEscrever = eu.permissoes.includes('conta.membros.escrever');
  const [casca, contrato, membros, papeis, parametros] = await Promise.all([
    carregarCascaDoPortal(),
    carregarResumoDoContrato(),
    carregarMembros(),
    carregarPapeisDaConta(),
    searchParams,
  ]);

  /* Na ordem da origem (guest, member, admin), que é a ordem das chaves do mapa. */
  const ordem = Object.keys(PAPEIS_DA_ORIGEM);
  const opcoesDePapel = papeis
    .flatMap((p) => (ehPapelDeConta(p.nome) ? [{ id: p.id, roleId: p.nome, ...PAPEIS_DA_ORIGEM[p.nome] }] : []))
    .sort((a, b) => ordem.indexOf(a.roleId) - ordem.indexOf(b.roleId));

  return (
    <div className="pt-app">
      <BarraDoPortal dados={casca} />

      <main className="pt-conteudo">
        <div className="mb-tela">
          <div className="mb-cabecalho">
            <Link className="mb-voltar" href="/contrato" aria-label="Voltar ao painel do contrato">
              <IconePortal nome="esquerda" tamanho={24} />
            </Link>
            <h1>Membros do contrato {contrato.nome}</h1>
          </div>

          {parametros.erro ? (
            <p className="ct-aviso" role="alert">
              {parametros.erro}
            </p>
          ) : null}

          <div className="mb-quadro">
            <div className="mb-cartao">
              <AbasDeMembros podeEscrever={podeEscrever}>
                <TabelaDeMembros
                  podeEscrever={podeEscrever}
                  papeis={opcoesDePapel}
                  /* Você não entra na sua própria lista — é o filtro deles
                     (`userIdentity !== loggedUser.identity`). Quem quer sair usa
                     "Deixar contrato", no cartão de resumo do painel. */
                  membros={membros
                    .filter((m) => !(m.tipo === 'usuario' && m.id === eu.usuario.id))
                    .map((m) => ({
                      id: m.id,
                      tipo: m.tipo,
                      nome: m.nome,
                      email: m.email,
                      papel: ehPapelDeConta(m.papelNome)
                        ? PAPEIS_DA_ORIGEM[m.papelNome].rotulo
                        : '',
                    }))}
                />
                {podeEscrever ? (
                  <ConvidarMembros
                    papeis={opcoesDePapel}
                    emailsDeMembros={membros
                      .filter((m) => m.tipo === 'usuario')
                      .map((m) => m.email.toLowerCase())}
                  />
                ) : null}
              </AbasDeMembros>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
