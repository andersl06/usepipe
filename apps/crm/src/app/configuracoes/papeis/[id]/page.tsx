import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Etiqueta, Icone } from '@pipe/ui';
import { Block } from '../../../../componentes/configuracoes/cabecalho';
import {
  ConfirmationButton,
  Formulario,
} from '../../../../componentes/configuracoes/formulario';
import { readRole, permissionsListarCatalogo } from '../../../../lib/configuracoes-dados';
import { ehUuid, type CatalogoPermission } from '../../../../lib/configuracoes-comum';
import { numero } from '../../../../lib/formato';
import { actionExcluirRole, actionSalvarPermissions } from '../../acoes';

export const dynamic = 'force-dynamic';

/**
 * Um papel, permissão por permissão.
 *
 * O agrupamento é o do próprio catálogo (`permissao.grupo`), não uma taxonomia
 * nova: o banco já sabe que `conversa.transferir` é de conversa, e inventar
 * outra separação aqui criaria duas verdades sobre a mesma coisa.
 *
 * A caixa de seleção é `<input type="checkbox">` de verdade, com `<label>` em
 * volta: teclado, `aria-checked` e o estado lido em voz alta vêm de graça, e o
 * `name="permissao"` repetido é o que faz o `FormData` chegar como lista no
 * servidor. Reimplementar isso com `div` e `role="checkbox"` é trabalho para
 * ficar com menos.
 *
 * A zona de perigo é o padrão do Twenty, com uma diferença: aqui o botão só
 * arma depois do primeiro clique, e recusa quando ainda há gente com o papel.
 * Excluir papel com membro dentro é tirar acesso de alguém sem dizer de quem.
 */

const NOME_DO_GRUPO: Record<string, string> = {
  conversa: 'Conversa',
  contato: 'Contato',
  crm: 'CRM',
  gestao: 'Gestão',
  monitoria: 'Monitoria',
  automacao: 'Automação',
  administracao: 'Administração',
};

function agrupar(catalogo: CatalogoPermission[]): [string, CatalogoPermission[]][] {
  const groups = new Map<string, CatalogoPermission[]>();
  for (const item of catalogo) {
    const lista = groups.get(item.grupo) ?? [];
    lista.push(item);
    groups.set(item.grupo, lista);
  }
  return [...groups.entries()];
}

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ehUuid(id)) notFound();

  const role = await readRole(id);
  if (!role) notFound();

  const catalogo = await permissionsListarCatalogo();
  const concedidas = new Set(role.concedidas);

  return (
    <>
      <div className="cfg-cabecalho">
        <Link className="cfg-voltar" href="/settings/roles">
          <Icone nome="esquerda" tamanho={14} />
          Papéis e permissões
        </Link>
        <h2>
          {role.nome}
          {role.deSistema ? <Etiqueta>Sistema</Etiqueta> : null}
        </h2>
        <p className="sub">
          {role.description ? `${role.description} · ` : ''}
          {numero(role.permissions)} de {numero(catalogo.length)} permissões ·{' '}
          {numero(role.members)} pessoa{role.members === 1 ? '' : 's'}
        </p>
      </div>

      {role.deSistema ? (
        <p className="cfg-nota" role="note">
          Este é um dos papéis do dia 1. Ele é a base que a semente garante, e mexer nele mudaria o
          Desk e a Gestão de todo mundo aqui dentro. Para uma combinação diferente,{' '}
          <Link href="/settings/roles">crie um papel próprio</Link>.
        </p>
      ) : null}

      <Block
        titulo="Permissões"
        description="Cada linha é uma capacidade nomeada do produto. Sem marca, o papel não a tem."
      >
        <Formulario acao={actionSalvarPermissions} rotuloBotao="Salvar permissões">
          <input type="hidden" name="papelId" value={role.id} />
          {agrupar(catalogo).map(([grupo, itens]) => (
            <fieldset className="cfg-permissoes" key={grupo}>
              <legend>{NOME_DO_GRUPO[grupo] ?? grupo}</legend>
              {itens.map((item) => (
                <label key={item.codigo}>
                  <input
                    type="checkbox"
                    name="permissao"
                    value={item.codigo}
                    defaultChecked={concedidas.has(item.codigo)}
                    disabled={role.deSistema}
                  />
                  <span>
                    <b>{item.description}</b>
                    <span className="sub mono">{item.codigo}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </Formulario>
      </Block>

      <Block
        titulo="Quem tem este papel"
        description="Trocar o papel de alguém é na tela de Membros."
      >
        {role.membersNames.length === 0 ? (
          <p className="sub">Ninguém ainda.</p>
        ) : (
          <ul className="cfg-pessoas">
            {role.membersNames.map((nome) => (
              <li key={nome}>
                <Etiqueta>{nome}</Etiqueta>
              </li>
            ))}
          </ul>
        )}
      </Block>

      {role.deSistema ? null : (
        <Block
          titulo="Excluir papel"
          description="Só é possível quando ninguém está com ele. Fica registrado no log de auditoria."
        >
          <Formulario
            acao={actionExcluirRole}
            botao={
              <ConfirmationButton
                rotulo="Excluir papel"
                pergunta={`Excluir "${role.nome}"? Isto não volta.`}
                rotuloConfirmar="Excluir mesmo"
              />
            }
          >
            <input type="hidden" name="papelId" value={role.id} />
          </Formulario>
        </Block>
      )}
    </>
  );
}
