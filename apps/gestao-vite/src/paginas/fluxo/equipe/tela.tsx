import { useMemo, useState } from 'react';
import { Avatar } from '@pipe/ui';
import { Link } from '../../../componentes/link';
import { IconePortal } from '../../../componentes/icones-portal';
import { atualizarLeituras } from '../../../lib/acoes';
import { api } from '../../../lib/api';
import { BotaoBds, CabecalhoDaPagina } from '../configuracoes/pecas';
import '../configuracoes/configuracoes.css';
import './equipe.css';

export interface MembroDaEquipe {
  id: string;
  tipo: 'usuario' | 'convite';
  nome: string;
  email: string;
  papelId: string | null;
  papel: string;
}

export interface OpcaoDePapelDaEquipe {
  id: string;
  roleId: string;
  rotulo: string;
}

interface ResultadoSimples {
  ok: boolean;
  erro?: string;
}

/**
 * As duas ações da linha — `POST .../papel` e `POST .../excluir`, as MESMAS
 * da tabela cheia (`contrato/membros/tabela.tsx`). Não reaproveita
 * `contrato/acoes.ts` na cara porque aquelas voltam pra `/contrato/membros`
 * no erro (`voltarComErro`) — aqui o erro fica na própria linha, sem navegar
 * pra fora de `/fluxo/:id/equipe`.
 */
async function mudarPapelDaLinha(alvo: string, papelId: string): Promise<ResultadoSimples> {
  const resultado = await api
    .post<ResultadoSimples>('/v1/gestao/contrato/membros/papel', { papelId, alvos: [alvo] })
    .catch((erro: Error) => ({ ok: false, erro: erro.message }) as ResultadoSimples);
  if (resultado.ok) atualizarLeituras();
  return resultado;
}

async function excluirLinha(alvo: string): Promise<ResultadoSimples> {
  const resultado = await api
    .post<ResultadoSimples>('/v1/gestao/contrato/membros/excluir', { alvos: [alvo] })
    .catch((erro: Error) => ({ ok: false, erro: erro.message }) as ResultadoSimples);
  if (resultado.ok) atualizarLeituras();
  return resultado;
}

function chaveDoAlvo(membro: MembroDaEquipe): string {
  return `${membro.tipo}:${membro.id}`;
}

/**
 * `/team` do contato — a mesma tela em `/fluxo/:id/equipe` e
 * `/roteador/:id/equipe`, porque na origem ela é um estado de
 * `auth.application.detail` e vale para chatbot e roteador igual.
 *
 * A estrutura é a do template da origem (`portal.js`, o `<page-header
 * class="team-header">` seguido de `.container.mb-5 > .row.team-cards`, e o
 * mesmo DOM renderizado em `docs/capturas/blip/roteador/roteador-team__pagina.html`):
 *
 *   cabeçalho  h1 "Equipe" à esquerda; à direita a busca
 *              ("Pesquisar por nome ou e-mail", ícone `avatar-user`, 260px) e
 *              DEPOIS o botão "Adicionar Membro" — nessa ordem;
 *   subtítulo  "Adicione pessoas para a sua equipe e dê permissões para
 *              alterarem o Chatbot." (`additional-info`), abaixo do traço;
 *   lista      um `card--mini-card` por membro: avatar (5%) · "Membro" + nome
 *              (25%) · divisória · "E-mail" + e-mail (20%) · divisória ·
 *              selo do papel (10%) · divisória · editar/excluir (5%);
 *   vazio      "Nenhum membro encontrado =(" (`.no-content-found`).
 *
 * O `page-help` ("Ver documentação") existe no template mas nasce escondido
 * (`class="animated fadeOut ng-hide"` no DOM capturado, com `ng-show` de
 * título/corpo que a tela nunca preenche): não é bloco desta tela e aqui
 * também não aparece.
 *
 * Duas coisas que a origem decide por dado e nós decidimos por dado também: o
 * selo só existe quando há papel a mostrar (lá, `user.owner || user.isAdmin`;
 * aqui todo membro tem um dos três papéis da conta, então ele está sempre
 * lá, e o e-mail fica no ramo de 20%), e as ações da linha somem para o
 * próprio usuário logado (lá `ng-if="!user.owner"`; aqui ele nem entra na
 * lista — filtro do `equipe.tsx`).
 *
 * De onde vem a lista, na origem: `TeamController._loadMembers()` chama
 * `getUsersAccounts` (`GET /applications/{shortName}@msging.net/users/accounts`)
 * e `_loadUsers()` cruza com `getApplicationUsersPermissions`
 * (`GET /applications/{shortName}@msging.net/permissions`) — tudo POR
 * CONTATO, nunca herdado do contrato. O contrato é pré-requisito, não fonte:
 * `confirmAddUser` convida a pessoa para o tenant como `guest` se ela ainda
 * não estiver nele, e o próprio aviso da origem diz "Essa pessoa não faz
 * parte do contrato. O administrador deve incluir a pessoa no contrato antes
 * de adicioná-la ao chatbot.".
 *
 * O Pipe ainda não tem RBAC por fluxo — o de hoje é da conta inteira
 * (`itens.ts`, "Não recebe permissão... até existir RBAC por fluxo"). Por
 * isso a lista aqui é a mesma de `/contrato/membros` (dado real, sem
 * invenção): todo mundo com acesso à conta tem acesso a todos os fluxos dela,
 * ou seja, o subconjunto por contato é hoje o conjunto inteiro.
 * "Adicionar Membro" abre a tela de convite de verdade — não um modal
 * encenado só para esta rota.
 *
 * Editar e excluir SÃO de verdade (`.icon-edit`/`.icon-delete` da linha,
 * origem em `roteador-team__pagina.html`): os dois modais chamam os MESMOS
 * endpoints que `/contrato/membros` já usa (`.../membros/papel`,
 * `.../membros/excluir`) — nada de contrato inventado. Textos pt-BR
 * (`editTitle`, `confirmExclusion`, `modalBody`) vieram do pacote de
 * tradução da cópia (`vendor-app_modules_translate_translationLoaders_…js`,
 * chave `team`), não do HTML capturado (que só tem o ícone, sem o modal
 * aberto). O rótulo do botão de salvar do editar e a ordem/estilo exatos do
 * seletor de papel não estavam nesse texto — aqui é "Salvar" (convenção do
 * resto do Pipe) num `<select>` nativo, não o menu customizado da origem. Os
 * botões do confirmar exclusão são os da origem: `utils.misc.no` / `yes`.
 */
export function TelaDeEquipe({
  membros,
  papeis,
  podeEscrever,
}: {
  membros: MembroDaEquipe[];
  papeis: OpcaoDePapelDaEquipe[];
  podeEscrever: boolean;
}) {
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<MembroDaEquipe | null>(null);
  const [excluindo, setExcluindo] = useState<MembroDaEquipe | null>(null);
  const [papelEscolhido, setPapelEscolhido] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');

  /* `editUser(user)` da origem: o cartão inteiro (`<a class="no-decoration">`)
     e o ícone de lápis abrem a MESMA edição. */
  function abrirEdicao(membro: MembroDaEquipe) {
    setEditando(membro);
    setPapelEscolhido(membro.papelId ?? '');
    setAviso('');
  }

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return membros;
    return membros.filter(
      (m) => m.nome.toLowerCase().includes(termo) || m.email.toLowerCase().includes(termo),
    );
  }, [membros, busca]);

  return (
    <>
      <CabecalhoDaPagina
        titulo={<h1>Equipe</h1>}
        acoes={
          <div className="cf-equipe-acoes">
            <label className="cf-equipe-busca">
              <IconePortal nome="avatar" tamanho={24} />
              <input
                type="text"
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
                placeholder="Pesquisar por nome ou e-mail"
                aria-label="Pesquisar por nome ou e-mail"
              />
            </label>
            {podeEscrever ? (
              <Link href="/contrato/membros" className="cf-botao cf-botao--primary">
                <IconePortal nome="mais" tamanho={24} />
                <span>Adicionar Membro</span>
              </Link>
            ) : null}
          </div>
        }
        descricao={
          <p>Adicione pessoas para a sua equipe e dê permissões para alterarem o Chatbot.</p>
        }
      />
      <div className="cf-container cf-equipe">
        {visiveis.map((membro) => (
          <div
            key={membro.id}
            className={podeEscrever ? 'cf-equipe-link cf-equipe-link--clicavel' : 'cf-equipe-link'}
            onClick={podeEscrever ? () => abrirEdicao(membro) : undefined}
          >
            <div className="cf-equipe-cartao">
              <div className="cf-equipe-linha">
                <div className="cf-equipe-secao cf-equipe-w5 cf-equipe-avatar-secao">
                  <Avatar nome={membro.nome} className="cf-equipe-avatar" />
                </div>
                <div className="cf-equipe-secao cf-equipe-secao--corta cf-equipe-w25">
                  <span className="cf-equipe-rotulo">Membro</span>
                  <span className="cf-equipe-valor">{membro.nome}</span>
                </div>
                <div className="cf-equipe-divisor" />
                <div className="cf-equipe-secao cf-equipe-secao--corta cf-equipe-w20">
                  <span className="cf-equipe-rotulo">E-mail</span>
                  <span className="cf-equipe-valor" title={membro.email}>
                    {membro.email}
                  </span>
                </div>
                <div className="cf-equipe-divisor" />
                <div className="cf-equipe-secao cf-equipe-secao--selo">
                  <span className="cf-equipe-selo">{membro.papel}</span>
                </div>
                {podeEscrever ? (
                  <>
                    <div className="cf-equipe-divisor cf-equipe-oculto" />
                    <div className="cf-equipe-icones cf-equipe-oculto cf-equipe-w5">
                      <button
                        type="button"
                        className="cf-equipe-icone"
                        aria-label={`Editar ${membro.nome}`}
                        onClick={(evento) => {
                          evento.stopPropagation();
                          abrirEdicao(membro);
                        }}
                      >
                        <IconePortal nome="editar" tamanho={20} />
                      </button>
                      <button
                        type="button"
                        className="cf-equipe-icone"
                        aria-label={`Remover ${membro.nome}`}
                        onClick={(evento) => {
                          evento.stopPropagation();
                          setExcluindo(membro);
                          setAviso('');
                        }}
                      >
                        <IconePortal nome="lixeira" tamanho={20} />
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ))}

        {visiveis.length === 0 ? (
          <span className="cf-equipe-vazio">Nenhum membro encontrado =(</span>
        ) : null}
      </div>

      {editando ? (
        <div
          className="cf-sobreposicao"
          role="presentation"
          onMouseDown={(evento) => evento.target === evento.currentTarget && setEditando(null)}
        >
          <section
            className="cf-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cf-editar-membro-titulo"
          >
            <h2 id="cf-editar-membro-titulo">Editar membro</h2>
            <label className="cf-campo">
              <span className="cf-campo-cabecalho">
                <span className="cf-campo-rotulo">Papel</span>
              </span>
              <span className="cf-campo-linha">
                <select
                  value={papelEscolhido}
                  onChange={(evento) => setPapelEscolhido(evento.target.value)}
                >
                  <option value="" disabled>
                    Escolha o papel
                  </option>
                  {papeis.map((papel) => (
                    <option key={papel.id} value={papel.id}>
                      {papel.rotulo}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            {aviso ? (
              <p className="cf-aviso" role="alert">
                {aviso}
              </p>
            ) : null}
            <footer className="cf-modal-acoes">
              <BotaoBds variante="secondary" onClick={() => setEditando(null)}>
                Cancelar
              </BotaoBds>
              <BotaoBds
                disabled={enviando || !papelEscolhido}
                onClick={async () => {
                  setEnviando(true);
                  const resultado = await mudarPapelDaLinha(chaveDoAlvo(editando), papelEscolhido);
                  setEnviando(false);
                  if (!resultado.ok) {
                    setAviso(resultado.erro ?? 'Não foi possível alterar o papel.');
                    return;
                  }
                  setEditando(null);
                }}
              >
                Salvar
              </BotaoBds>
            </footer>
          </section>
        </div>
      ) : null}

      {excluindo ? (
        <div
          className="cf-sobreposicao"
          role="presentation"
          onMouseDown={(evento) => evento.target === evento.currentTarget && setExcluindo(null)}
        >
          <section
            className="cf-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cf-excluir-membro-titulo"
          >
            <h2 id="cf-excluir-membro-titulo">Confirmar exclusão</h2>
            <p>Deseja realmente remover {excluindo.email} do seu chatbot?</p>
            {aviso ? (
              <p className="cf-aviso" role="alert">
                {aviso}
              </p>
            ) : null}
            <footer className="cf-modal-acoes">
              <BotaoBds variante="secondary" onClick={() => setExcluindo(null)}>
                Não
              </BotaoBds>
              <BotaoBds
                variante="perigo"
                disabled={enviando}
                onClick={async () => {
                  setEnviando(true);
                  const resultado = await excluirLinha(chaveDoAlvo(excluindo));
                  setEnviando(false);
                  if (!resultado.ok) {
                    setAviso(resultado.erro ?? 'Não foi possível remover.');
                    return;
                  }
                  setExcluindo(null);
                }}
              >
                Sim
              </BotaoBds>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
