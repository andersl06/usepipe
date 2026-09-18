import { useMemo, useState } from 'react';
import { Avatar } from '@pipe/ui';
import { Link } from '../../../componentes/link';
import { IconeBusca, IconePortal } from '../../../componentes/icones-portal';
import { CabecalhoDaPagina, Papel } from '../configuracoes/pecas';
import '../configuracoes/configuracoes.css';
import './equipe.css';

export interface MembroDaEquipe {
  id: string;
  nome: string;
  email: string;
  papel: string;
}

/**
 * `/team` (LEIA.md, captura 1 — a única tela desta leva com dado real, não
 * mock): busca "Pesquisar por nome ou e-mail", botão "Adicionar Membro" e a
 * lista (avatar + Nome + E-mail + badge de papel), como
 * `docs/pesquisa/blip-portal-telas.md` §7 descreve.
 *
 * O Pipe não tem uma equipe POR FLUXO — o RBAC de hoje é da conta inteira
 * (`itens.ts`, "Não recebe permissão... até existir RBAC por fluxo"). Por
 * isso a lista aqui é a mesma de `/contrato/membros` (dado real, sem
 * invenção): todo mundo com acesso à conta tem acesso a todos os fluxos dela.
 * "Adicionar Membro" abre a tela de convite de verdade — não um modal
 * encenado só para esta rota.
 */
export function TelaDeEquipe({
  membros,
  podeEscrever,
}: {
  membros: MembroDaEquipe[];
  podeEscrever: boolean;
}) {
  const [busca, setBusca] = useState('');

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
          podeEscrever ? (
            <Link href="/contrato/membros" className="cf-botao cf-botao--primary">
              <IconePortal nome="mais" tamanho={24} />
              <span>Adicionar Membro</span>
            </Link>
          ) : undefined
        }
      />
      <div className="cf-container cf-equipe">
        <label className="cf-equipe-busca">
          <IconeBusca tamanho={20} />
          <input
            type="text"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Pesquisar por nome ou e-mail"
            aria-label="Pesquisar por nome ou e-mail"
          />
        </label>

        {visiveis.map((membro) => (
          <Papel key={membro.id} className="cf-equipe-linha">
            <Avatar nome={membro.nome} className="cf-equipe-avatar" />
            <div className="cf-equipe-dados">
              <span className="cf-equipe-nome">{membro.nome}</span>
              <span className="cf-equipe-email">{membro.email}</span>
            </div>
            <span className="cf-selo cf-selo--info">{membro.papel}</span>
          </Papel>
        ))}

        {visiveis.length === 0 ? <p className="cf-equipe-vazio">Nenhum membro encontrado.</p> : null}
      </div>
    </>
  );
}
