import { Botao, Campo, Etiqueta, Tabela, type Coluna } from '@pipe/ui';
import { Bloco, CabecalhoDaSecao } from '../../../componentes/configuracoes/cabecalho';
import {
  BotaoDeConfirmacao,
  Formulario,
  FormularioDeLinha,
} from '../../../componentes/configuracoes/formulario';
import { lerEspaco, listarChaves, listarWebhooks } from '../../../lib/configuracoes-dados';
import {
  CATALOGO_DE_ESCOPOS,
  CATALOGO_DE_EVENTOS,
  type ChaveDeApi,
  type WebhookDeSaida,
} from '../../../lib/configuracoes-comum';
import { data, dataHora, numero } from '../../../lib/formato';
import {
  acaoAlternarWebhook,
  acaoCriarChave,
  acaoCriarWebhook,
  acaoExcluirWebhook,
  acaoRevogarChave,
} from '../acoes';

export const dynamic = 'force-dynamic';

/**
 * Chaves de API e webhooks de saída.
 *
 * É o "MCP & APIs" do Twenty, com o que o Pipe realmente tem atrás. As duas
 * metades desta tela já existiam no produto e não tinham porta: `chave_api`
 * autentica a REST desde o começo (`apps/api/src/autenticacao.ts`) e
 * `webhook_saida` é emitido a cada evento (`apps/api/src/webhooks-saida.ts`).
 * Faltava o lugar de emitir uma e assinar o outro sem `psql`.
 *
 * O que muda em relação ao Twenty, e por quê:
 *
 * - **A chave carrega ESCOPO, não papel.** Lá a chave recebe um role de usuário.
 *   Aqui `chave_api.escopos` é a régua que `apps/api` confere por rota, e papel
 *   é de gente. Emprestar papel de pessoa a um programa é o caminho para uma
 *   integração de leitura ganhar permissão de excluir contato.
 * - **Não há regenerar.** Regenerar é revogar e emitir, com um nome que sugere
 *   que a chave antiga continua valendo por um tempo. Revogue e emita outra: são
 *   dois cliques e nenhuma ambiguidade sobre o que ainda funciona.
 * - **O webhook tem liga-desliga.** Lá o webhook existe ou é apagado. Aqui
 *   `webhook_saida.ativo` já existia, e desligar durante uma manutenção do outro
 *   lado é melhor do que apagar e recadastrar com um segredo novo.
 * - **O segredo do webhook é nosso e é obrigatório.** No Twenty ele é opcional;
 *   aqui a coluna é `not null` e a assinatura inclui o timestamp
 *   (`sha256=HMAC(segredo, "<timestamp>.<corpo>")`), que é o que fecha o replay.
 */

function colunasDeChaves(fuso: string): readonly Coluna<ChaveDeApi>[] {
  return [
    {
      chave: 'nome',
      rotulo: 'Chave',
      celula: (c) => (
        <span>
          <b>{c.nome}</b>
          <span className="sub mono">pipe_{c.prefixo}_…</span>
        </span>
      ),
    },
    {
      chave: 'escopos',
      rotulo: 'Pode',
      celula: (c) =>
        c.escopos.length === 0 ? (
          <span className="sub">nenhum escopo</span>
        ) : (
          c.escopos.map((e) => (
            <Etiqueta key={e} titulo={e}>
              {e}
            </Etiqueta>
          ))
        ),
    },
    {
      chave: 'uso',
      rotulo: 'Último uso',
      celula: (c) =>
        c.ultimoUsoEm ? dataHora(c.ultimoUsoEm, fuso) : <span className="sub">Nunca usada</span>,
    },
    {
      chave: 'estado',
      rotulo: 'Estado',
      celula: (c) =>
        c.revogadaEm ? (
          <Etiqueta tom="erro">Revogada em {data(c.revogadaEm, fuso)}</Etiqueta>
        ) : (
          <FormularioDeLinha acao={acaoRevogarChave} campos={{ id: c.id }}>
            <Etiqueta tom="sucesso">Ativa</Etiqueta>
            <BotaoDeConfirmacao
              rotulo="Revogar"
              pergunta={`Revogar "${c.nome}"? Quem usa esta chave para de conseguir na hora.`}
              rotuloConfirmar="Revogar mesmo"
            />
          </FormularioDeLinha>
        ),
    },
  ];
}

function colunasDeWebhooks(fuso: string): readonly Coluna<WebhookDeSaida>[] {
  return [
    {
      chave: 'url',
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
      chave: 'entregas',
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
      chave: 'desde',
      rotulo: 'Criado',
      celula: (w) => (w.criadoEm ? data(w.criadoEm, fuso) : '—'),
    },
    {
      chave: 'acao',
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
            <BotaoDeConfirmacao
              rotulo="Excluir"
              pergunta="Excluir apaga o segredo junto: o outro lado precisará de um novo."
            />
          </FormularioDeLinha>
        </span>
      ),
    },
  ];
}

export default async function PaginaApi() {
  const espaco = await lerEspaco();
  const chaves = await listarChaves();
  const webhooks = await listarWebhooks();

  return (
    <>
      <CabecalhoDaSecao titulo="Chaves e webhooks">
        A chave abre a API REST de fora para dentro; o webhook empurra evento de dentro para fora.
      </CabecalhoDaSecao>

      <Bloco
        titulo="Chaves de API"
        descricao="O cabeçalho é Authorization: Bearer. A chave é opaca e some da tela assim que você sai."
      >
        <Tabela
          colunas={colunasDeChaves(espaco.fuso)}
          linhas={chaves}
          chaveDaLinha={(c) => c.id}
          larguraMinima={760}
          vazio="Nenhuma chave emitida."
        />
      </Bloco>

      <Bloco
        titulo="Emitir chave"
        descricao="Escolha só o que a integração precisa. Escopo a mais é permissão que ninguém revisa depois."
      >
        <Formulario acao={acaoCriarChave} rotuloBotao="Emitir chave">
          <label className="cfg-campo">
            <span>Para que serve</span>
            <Campo name="nome" required maxLength={120} placeholder="Integração do site" />
          </label>
          <fieldset className="cfg-permissoes">
            <legend>Escopos</legend>
            {CATALOGO_DE_ESCOPOS.map((escopo) => (
              <label key={escopo.codigo}>
                <input type="checkbox" name="escopo" value={escopo.codigo} />
                <span>
                  <b>{escopo.rotulo}</b>
                  <span className="sub mono">{escopo.codigo}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </Formulario>
      </Bloco>

      <Bloco
        titulo="Webhooks de saída"
        descricao="Cada evento vira um POST assinado. Falha é registrada e reenviada; não some em silêncio."
      >
        <Tabela
          colunas={colunasDeWebhooks(espaco.fuso)}
          linhas={webhooks}
          chaveDaLinha={(w) => w.id}
          larguraMinima={820}
          vazio="Nenhum webhook cadastrado."
        />
      </Bloco>

      <Bloco
        titulo="Novo webhook"
        descricao="Só https: a assinatura protege contra adulteração, não contra leitura no caminho."
      >
        <Formulario acao={acaoCriarWebhook} rotuloBotao="Criar webhook">
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
      </Bloco>
    </>
  );
}
