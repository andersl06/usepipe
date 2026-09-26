import { Botao, Campo, Etiqueta, Tabela, type Column } from '@pipe/ui';
import { Block, SectionHeader } from '../../../components/settings/cabecalho';
import {
  ConfirmationButton,
  Formulario,
  FormularioDeLinha,
} from '../../../components/settings/formulario';
import { lerEspaco, listarChaves, listarWebhooks } from '../../../lib/settings-data';
import {
  CATALOGO_OF_SCOPES,
  CATALOGO_DE_EVENTOS,
  type ApiKey,
  type WebhookDeSaida,
} from '../../../lib/settings-comum';
import { data, dataHora, numero } from '../../../lib/format';
import {
  acaoAlternarWebhook,
  actionCreateKey,
  actionCreateWebhook,
  acaoExcluirWebhook,
  actionRevogarKey,
} from '../actions';

export const dynamic = 'force-dynamic';

/**
 * API keys and outgoing webhooks.
 *
 * This is Twenty's "MCP & APIs", with what Pipe actually has behind it. Both halves of
 * this screen already existed in the product with no way to reach them: `chave_api`
 * has authenticated the REST API since the start (`apps/api/src/autenticacao.ts`) and
 * `webhook_saida` is emitted on every event (`apps/api/src/webhooks-saida.ts`).
 * What was missing was a place to issue one and sign the other without `psql`.
 *
 * What changes compared to Twenty, and why:
 *
 * - **The key carries a SCOPE, not a role.** There, the key receives a user's role. Here
 *   `chave_api.escopos` is the ruler `apps/api` checks per route, and a role belongs to
 *   a person. Lending a person's role to a program is the path for a read-only
 *   integration to gain permission to delete a contact.
 * - **There's no regenerate.** Regenerating is revoke-and-issue, under a name that suggests
 *   the old key keeps working for a while. Revoke it and issue another: two clicks and
 *   no ambiguity about what still works.
 * - **The webhook has an on/off switch.** There, a webhook either exists or is deleted. Here
 *   `webhook_saida.ativo` already existed, and turning it off during maintenance on the other
 *   side is better than deleting and re-registering with a new secret.
 * - **The webhook secret is ours and mandatory.** In Twenty it's optional;
 *   here the column is `not null` and the signature includes the timestamp
 *   (`sha256=HMAC(secret, "<timestamp>.<body>")`), which is what closes off replay.
 */

function colunasDeChaves(fuso: string): readonly Column<ApiKey>[] {
  return [
    {
      key: 'nome',
      rotulo: 'Chave',
      celula: (c) => (
        <span>
          <b>{c.nome}</b>
          <span className="sub mono">pipe_{c.prefix}_…</span>
        </span>
      ),
    },
    {
      key: 'escopos',
      rotulo: 'Pode',
      celula: (c) =>
        c.scopes.length === 0 ? (
          <span className="sub">nenhum escopo</span>
        ) : (
          c.scopes.map((e) => (
            <Etiqueta key={e} titulo={e}>
              {e}
            </Etiqueta>
          ))
        ),
    },
    {
      key: 'uso',
      rotulo: 'Último uso',
      celula: (c) =>
        c.ultimoUsoEm ? dataHora(c.ultimoUsoEm, fuso) : <span className="sub">Nunca usada</span>,
    },
    {
      key: 'estado',
      rotulo: 'Estado',
      celula: (c) =>
        c.revogadaEm ? (
          <Etiqueta tom="erro">Revogada em {data(c.revogadaEm, fuso)}</Etiqueta>
        ) : (
          <FormularioDeLinha acao={actionRevogarKey} campos={{ id: c.id }}>
            <Etiqueta tom="sucesso">Ativa</Etiqueta>
            <ConfirmationButton
              rotulo="Revogar"
              pergunta={`Revogar "${c.nome}"? Quem usa esta chave para de conseguir na hora.`}
              rotuloConfirmar="Revogar mesmo"
            />
          </FormularioDeLinha>
        ),
    },
  ];
}

function colunasDeWebhooks(fuso: string): readonly Column<WebhookDeSaida>[] {
  return [
    {
      key: 'url',
      rotulo: 'Endereço',
      celula: (w) => (
        <span>
          <b className="mono">{w.url}</b>
          <span className="sub">
            {w.eventos.length === 0 ? 'nenhum evento' : w.eventos.join(' · ')}
          </span>
        </span>
      ),
    },
    {
      key: 'entregas',
      rotulo: 'Entregas',
      celula: (w) => (
        <span className="cfg-entregas">
          {w.entregas.pendentes > 0 ? (
            <Etiqueta tom="info">{numero(w.entregas.pendentes)} pendentes</Etiqueta>
          ) : null}
          {w.entregas.falhas > 0 ? (
            <Etiqueta tom="erro">{numero(w.entregas.falhas)} falharam</Etiqueta>
          ) : null}
          {w.entregas.pendentes === 0 && w.entregas.falhas === 0 ? (
            <span className="sub">em dia</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'desde',
      rotulo: 'Criado',
      celula: (w) => (w.criadoEm ? data(w.criadoEm, fuso) : '—'),
    },
    {
      key: 'acao',
      rotulo: 'Ação',
      celula: (w) => (
        <span className="cfg-entregas">
          <FormularioDeLinha
            acao={acaoAlternarWebhook}
            campos={{ id: w.id, ativo: w.ativo ? 'nao' : 'sim' }}
          >
            <Etiqueta tom={w.ativo ? 'sucesso' : 'alerta'}>
              {w.ativo ? 'Ativo' : 'Desligado'}
            </Etiqueta>
            <Botao type="submit">{w.ativo ? 'Desligar' : 'Ligar'}</Botao>
          </FormularioDeLinha>
          <FormularioDeLinha acao={acaoExcluirWebhook} campos={{ id: w.id }}>
            <ConfirmationButton
              rotulo="Excluir"
              pergunta="Excluir apaga o segredo junto: o outro lado precisará de um novo."
            />
          </FormularioDeLinha>
        </span>
      ),
    },
  ];
}

export default async function PageApi() {
  const espaco = await lerEspaco();
  const chaves = await listarChaves();
  const webhooks = await listarWebhooks();

  return (
    <>
      <SectionHeader titulo="Chaves e webhooks">
        A chave abre a API REST de fora para dentro; o webhook empurra evento de dentro para fora.
      </SectionHeader>

      <Block
        titulo="Chaves de API"
        description="O cabeçalho é Authorization: Bearer. A chave é opaca e some da tela assim que você sai."
      >
        <Tabela
          colunas={colunasDeChaves(espaco.fuso)}
          linhas={chaves}
          linhaKey={(c) => c.id}
          larguraMinima={760}
          empty="Nenhuma chave emitida."
        />
      </Block>

      <Block
        titulo="Emitir chave"
        description="Escolha só o que a integração precisa. Escopo a mais é permissão que ninguém revisa depois."
      >
        <Formulario acao={actionCreateKey} rotuloBotao="Emitir chave">
          <label className="cfg-campo">
            <span>Para que serve</span>
            <Campo name="nome" required maxLength={120} placeholder="Integração do site" />
          </label>
          <fieldset className="cfg-permissoes">
            <legend>Escopos</legend>
            {CATALOGO_OF_SCOPES.map((scope) => (
              <label key={scope.codigo}>
                <input type="checkbox" name="escopo" value={scope.codigo} />
                <span>
                  <b>{scope.rotulo}</b>
                  <span className="sub mono">{scope.codigo}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </Formulario>
      </Block>

      <Block
        titulo="Webhooks de saída"
        description="Cada evento vira um POST assinado. Falha é registrada e reenviada; não some em silêncio."
      >
        <Tabela
          colunas={colunasDeWebhooks(espaco.fuso)}
          linhas={webhooks}
          linhaKey={(w) => w.id}
          larguraMinima={820}
          empty="Nenhum webhook cadastrado."
        />
      </Block>

      <Block
        titulo="Novo webhook"
        description="Só https: a assinatura protege contra adulteração, não contra leitura no caminho."
      >
        <Formulario acao={actionCreateWebhook} rotuloBotao="Criar webhook">
          <label className="cfg-campo">
            <span>Endereço</span>
            <Campo
              name="url"
              type="url"
              required
              placeholder="https://exemplo.com.br/pipe"
              inputMode="url"
            />
            <span className="sub">
              O Pipe manda POST em application/json com os cabeçalhos X-Pipe-Signature,
              X-Pipe-Timestamp e X-Pipe-Delivery.
            </span>
          </label>
          <fieldset className="cfg-permissoes">
            <legend>Eventos</legend>
            {CATALOGO_DE_EVENTOS.map((evento) => (
              <label key={evento}>
                <input type="checkbox" name="evento" value={evento} />
                <span className="mono">{evento}</span>
              </label>
            ))}
          </fieldset>
        </Formulario>
      </Block>
    </>
  );
}
