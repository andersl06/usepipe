import Link from 'next/link';
import { Campo, Etiqueta, Tabela, type Column } from '@pipe/ui';
import { Block, SectionHeader } from '../../../components/settings/cabecalho';
import { Formulario } from '../../../components/settings/formulario';
import { permissionsListarCatalogo, listarPapeis } from '../../../lib/settings-data';
import type { RoleSummary } from '../../../lib/settings-comum';
import { numero } from '../../../lib/format';
import { actionCreateRole } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * Roles.
 *
 * The permission catalog already existed in `permissao` and `papel_permissao` since day
 * one, with 47 named capabilities and five day-one roles — and no screen showed it.
 * This is that screen.
 *
 * **System roles aren't editable**, and show up with a lock icon. It's the same
 * decision Twenty made (`isEditable: false`) and for the same reason: the five
 * day-one roles are the contract the seed guarantees, and a customer who removes
 * `conversa.responder` from `atendente` breaks their whole Desk without knowing
 * why. Whoever needs a different combination creates their own role, which is what
 * this block offers.
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
