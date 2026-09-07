import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Etiqueta, Icone } from '@pipe/ui';
import { Bloco } from '../../../../componentes/configuracoes/cabecalho';
import {
  BotaoDeConfirmacao,
  Formulario,
} from '../../../../componentes/configuracoes/formulario';
import { lerPapel, listarCatalogoDePermissoes } from '../../../../lib/configuracoes-dados';
import { ehUuid, type PermissaoDoCatalogo } from '../../../../lib/configuracoes-comum';
import { numero } from '../../../../lib/formato';
import { acaoExcluirPapel, acaoSalvarPermissoes } from '../../acoes';

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

function agrupar(catalogo: PermissaoDoCatalogo[]): [string, PermissaoDoCatalogo[]][] {
  const grupos = new Map<string, PermissaoDoCatalogo[]>();
  for (const item of catalogo) {
    const lista = grupos.get(item.grupo) ?? [];
    lista.push(item);
    grupos.set(item.grupo, lista);
  }
  return [...grupos.entries()];
}

export default async function PaginaDoPapel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ehUuid(id)) notFound();

  const papel = await lerPapel(id);
  if (!papel) notFound();

  const catalogo = await listarCatalogoDePermissoes();
  const concedidas = new Set(papel.concedidas);

  return (
    <>
      <div className="cfg-cabecalho">
        <Link className="cfg-voltar" href="/configuracoes/papeis">
          <Icone nome="esquerda" tamanho={14} />
          Papéis e permissões
        </Link>
        <h2>
          {papel.nome}
          {papel.deSistema ? <Etiqueta>Sistema</Etiqueta> : null}
        </h2>
        <p className="sub">
          {papel.descricao ? `${papel.descricao} · ` : ''}
          {numero(papel.permissoes)} de {numero(catalogo.length)} permissões ·{' '}
          {numero(papel.membros)} pessoa{papel.membros === 1 ? '' : 's'}
        </p>
      </div>

      {papel.deSistema ? (
        <p className="cfg-nota" role="note">
          Este é um dos papéis do dia 1. Ele é a base que a semente garante, e mexer nele mudaria o
          Desk e a Gestão de todo mundo aqui dentro. Para uma combinação diferente,{' '}
          <Link href="/configuracoes/papeis">crie um papel próprio</Link>.
        </p>
      ) : null}

      <Bloco
        titulo="Permissões"
        descricao="Cada linha é uma capacidade nomeada do produto. Sem marca, o papel não a tem."
      >
        <Formulario acao={acaoSalvarPermissoes} rotuloBotao="Salvar permissões">
          <input type="hidden" name="papelId" value={papel.id} />
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
                    disabled={papel.deSistema}
                  />
                  <span>
                    <b>{item.descricao}</b>
                    <span className="sub mono">{item.codigo}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </Formulario>
      </Bloco>

      <Bloco
        titulo="Quem tem este papel"
        descricao="Trocar o papel de alguém é na tela de Membros."
      >
        {papel.nomesDosMembros.length === 0 ? (
          <p className="sub">Ninguém ainda.</p>
        ) : (
          <ul className="cfg-pessoas">
            {papel.nomesDosMembros.map((nome) => (
              <li key={nome}>
                <Etiqueta>{nome}</Etiqueta>
              </li>
            ))}
          </ul>
        )}
      </Bloco>

      {papel.deSistema ? null : (
        <Bloco
          titulo="Excluir papel"
          descricao="Só é possível quando ninguém está com ele. Fica registrado no log de auditoria."
        >
          <Formulario
            acao={acaoExcluirPapel}
            botao={
              <BotaoDeConfirmacao
                rotulo="Excluir papel"
                pergunta={`Excluir "${papel.nome}"? Isto não volta.`}
                rotuloConfirmar="Excluir mesmo"
              />
            }
          >
            <input type="hidden" name="papelId" value={papel.id} />
          </Formulario>
        </Bloco>
      )}
    </>
  );
}
