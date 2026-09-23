import { useState } from 'react';
import { Avatar } from '@pipe/ui';
import type { EquipeDoFluxo, MembroDoFluxo, PapelNoFluxo, PermissoesNoFluxo } from '@pipe/contracts';
import { useNavigate, useParams } from 'react-router-dom';
import { IconePortal } from '../../../componentes/icones-portal';
import { Selecao } from '../../../componentes/selecao';
import { atualizarLeituras } from '../../../lib/acoes';
import { api, ErroDaApi } from '../../../lib/api';
import { useLeitura } from '../../../lib/consulta';
import { NaoEncontrado } from '../../nao-encontrado';
import { BarrasDoContato, baseDoContato, useContato } from '../contato';
import { BotaoBds, CabecalhoDaPagina, Papel } from '../configuracoes/pecas';
import { ListaDePermissoes } from './tela';
import {
  NIVEIS_DA_EDICAO,
  nivelDaEdicao,
  permissoesDoNivelDaEdicao,
  type NivelDaEdicao,
} from './permissoes';
import '../configuracoes/configuracoes.css';
import './equipe.css';

/**
 * A página `auth.application.detail.team.edit` da Blip. O bundle prova
 * `url:"/team/edit"`, `back-button="auth.application.detail.team"` e o botão
 * Salvar no cabeçalho; por isso a edição não volta a ser modal.
 */
export function PaginaDeEditarMembro() {
  const { contato } = useContato();
  const { usuarioId = '' } = useParams();
  const leitura = useLeitura<EquipeDoFluxo>(`/v1/gestao/fluxos/${contato.id}/equipe`);
  const semPermissao = leitura.error instanceof ErroDaApi && leitura.error.status === 403;
  const membro = leitura.data?.membros.find((item) => item.usuarioId === usuarioId);

  return (
    <div className="pt-app">
      <BarrasDoContato ativo="Equipe" />
      <main>
        {semPermissao ? (
          <p className="cf-aviso cf-container" role="alert">
            Você não tem permissão para editar a equipe.
          </p>
        ) : leitura.error ? (
          <p className="cf-aviso cf-container" role="alert">
            Não foi possível carregar o membro: {leitura.error.message}
          </p>
        ) : !leitura.data ? null : !leitura.data.podeGerir ? (
          <p className="cf-aviso cf-container" role="alert">
            Você não tem permissão para editar a equipe.
          </p>
        ) : !membro ? (
          <NaoEncontrado />
        ) : (
          <Edicao
            key={membro.usuarioId}
            fluxoId={contato.id}
            base={baseDoContato(contato.tipo, contato.id)}
            membro={membro}
            recursos={leitura.data.recursos}
          />
        )}
      </main>
    </div>
  );
}

function Edicao({
  fluxoId,
  base,
  membro,
  recursos,
}: {
  fluxoId: string;
  base: string;
  membro: MembroDoFluxo;
  recursos: EquipeDoFluxo['recursos'];
}) {
  const navegar = useNavigate();
  const [nivel, setNivel] = useState<NivelDaEdicao>(() =>
    nivelDaEdicao(membro.papelNoFluxo, recursos, membro.permissoes),
  );
  const [permissoes, setPermissoes] = useState<PermissoesNoFluxo>(membro.permissoes);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const papelNoFluxo: PapelNoFluxo = nivel === 'nenhum' ? 'personalizado' : nivel;
  const mudou =
    papelNoFluxo !== membro.papelNoFluxo ||
    recursos.some(
      (recurso) =>
        (permissoes[recurso.chave] ?? 'nenhum') !==
        (membro.permissoes[recurso.chave] ?? 'nenhum'),
    );

  function escolher(proximo: NivelDaEdicao) {
    setNivel(proximo);
    setPermissoes(permissoesDoNivelDaEdicao(proximo, recursos, permissoes));
  }

  async function salvar() {
    setEnviando(true);
    setAviso('');
    try {
      await api.patch(`/v1/gestao/fluxos/${fluxoId}/equipe/${membro.usuarioId}`, {
        papelNoFluxo,
        permissoes,
      });
      atualizarLeituras();
      navegar(`${base}/equipe`);
    } catch (erro) {
      setAviso((erro as Error).message || 'Não foi possível salvar as alterações.');
      setEnviando(false);
    }
  }

  return (
    <>
      <CabecalhoDaPagina
        titulo={
          <div className="cf-equipe-editar-titulo">
            <button
              type="button"
              className="cf-equipe-voltar"
              aria-label="Voltar para Equipe"
              onClick={() => navegar(`${base}/equipe`)}
            >
              <IconePortal nome="esquerda" tamanho={24} />
            </button>
            <h1>Editar</h1>
          </div>
        }
        acoes={
          <BotaoBds variante="bot" disabled={enviando || !mudou} onClick={salvar}>
            Salvar
          </BotaoBds>
        }
      />

      <div className="cf-container cf-equipe-editar">
        <div className="cf-equipe-editar-pessoa">
          <Avatar nome={membro.nome} className="cf-equipe-editar-avatar" />
          <div>
            <div className="cf-equipe-editar-nome">
              <strong>{membro.nome}</strong>
              {nivel === 'admin' ? <span className="cf-equipe-selo">Admin</span> : null}
            </div>
            <span>{membro.email}</span>
          </div>
        </div>

        <Papel className="cf-equipe-editar-cartao">
          <div className="cf-equipe-editar-controle">
            <h2>Permissões</h2>
            <Selecao
              value={nivel}
              onChange={(evento) => escolher(evento.currentTarget.value as NivelDaEdicao)}
              aria-label="Permissões"
            >
              {NIVEIS_DA_EDICAO.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.rotulo}
                </option>
              ))}
            </Selecao>
          </div>
          <ListaDePermissoes
            recursos={recursos}
            permissoes={permissoes}
            editavel={nivel === 'personalizado'}
            aoTrocar={(chave, valor) => {
              setNivel('personalizado');
              setPermissoes({ ...permissoes, [chave]: valor });
            }}
          />
          {aviso ? (
            <p className="cf-aviso" role="alert">
              {aviso}
            </p>
          ) : null}
        </Papel>
      </div>
    </>
  );
}
