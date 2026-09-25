import Link from 'next/link';
import { Campo, Etiqueta, Tabela, type Column } from '@pipe/ui';
import { Block, SectionHeader } from '../../../componentes/configuracoes/cabecalho';
import { Formulario } from '../../../componentes/configuracoes/formulario';
import { permissionsListarCatalogo, listarPapeis } from '../../../lib/configuracoes-dados';
import type { RoleSummary } from '../../../lib/configuracoes-comum';
import { numero } from '../../../lib/formato';
import { actionCreateRole } from '../acoes';

export const dynamic = 'force-dynamic';

/**
 * Papéis.
 *
 * O catálogo de permissões já existia em `permissao` e `papel_permissao` desde a
 * fundação, com 47 capacidades nomeadas e cinco papéis do dia 1 — e nenhuma tela
 * o mostrava. Esta é a tela.
 *
 * **Papel de sistema não é editável**, e aparece com cadeado. É a mesma decisão
 * do Twenty (`isEditable: false`) e pela mesma razão: os cinco do dia 1 são o
 * contrato que a semente garante, e um cliente que remova `conversa.responder`
 * do `atendente` quebra o Desk de todo mundo dele sem saber por quê. Quem precisa
 * de outra combinação cria um papel próprio, que é o que este bloco oferece.
 */

const COLUNAS: readonly Column<RoleSummary>[] = [
  {
    key: 'nome',
    rotulo: 'Papel',
    celula: (p) => (
      <Link className="cfg-link-forte" href={`/settings/roles/${p.id}`}>
        {p.nome}
        {p.deSistema ? <Etiqueta titulo="Papel do dia 1: não é editável">Sistema</Etiqueta> : null}
      </Link>
    ),
  },
  {
    key: 'descricao',
    rotulo: 'O que faz',
    celula: (p) => p.description ?? <span className="sub">—</span>,
  },
  {
    key: 'permissoes',
    rotulo: 'Permissões',
    numerica: true,
    celula: (p) => numero(p.permissions),
  },
  { key: 'membros', rotulo: 'Pessoas', numerica: true, celula: (p) => numero(p.members) },
];

export default async function PageRoles() {
  const papeis = await listarPapeis();
  const catalogo = await permissionsListarCatalogo();

  return (
    <>
      <SectionHeader titulo="Papéis e permissões">
        Papel é um conjunto de permissões com nome. São {numero(catalogo.length)} capacidades no
        catálogo do produto, e cada papel diz sim ou não a cada uma.
      </SectionHeader>

      <Block titulo="Papéis" description="Clique num papel para ver e mudar o que ele pode fazer.">
        <Tabela
          colunas={COLUNAS}
          linhas={papeis}
          linhaKey={(p) => p.id}
          larguraMinima={620}
          empty={
            <>
              Nenhum papel cadastrado. Rode <code>pnpm banco:semear</code>.
            </>
          }
        />
      </Block>

      <Block
        titulo="Criar papel"
        description="Nasce sem nenhuma permissão. Você escolhe as dele na tela seguinte."
      >
        <Formulario acao={actionCreateRole} rotuloBotao="Criar" className="cfg-form-linha">
          <label className="cfg-campo">
            <span>Nome</span>
            <Campo name="nome" required maxLength={120} placeholder="closer" />
          </label>
          <label className="cfg-campo">
            <span>O que faz</span>
            <Campo name="descricao" maxLength={200} placeholder="Fecha a venda do lead qualificado" />
          </label>
        </Formulario>
      </Block>
    </>
  );
}
