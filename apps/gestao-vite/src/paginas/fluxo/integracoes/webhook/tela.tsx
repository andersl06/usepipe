import { useState } from 'react';
import Link from '../../../../componentes/link';
import { IconePortal } from '../../../../componentes/icones-portal';
import { useLeitura } from '../../../../lib/consulta';
import { ModalConfirmacao } from '../../../cadastros/_modal';
import { Interruptor } from '../interruptor';
import { IlustracaoIntegracao } from '../ilustracoes';
import { urlValida } from './regras';
import {
  criarWebhook,
  editarWebhook,
  excluirWebhook,
  testarWebhook,
  type WebhookListado,
} from './gravar';

/**
 * A tela do Webhook — `auth.application.detail.integrations.webhook`
 * (portal.js, módulo 29045). A origem mostra UM webhook com várias URLs; o
 * Pipe grava em `webhook_saida` (`apis.md` §5.5), que é o inverso — várias
 * LINHAS, uma URL e uma lista de eventos cada. A tela virou CRUD de verdade
 * sobre essa forma (`GET/POST/PATCH/DELETE /v1/gestao/webhooks`,
 * `dominio/gestao/integracoes.ts`): a URL entra por linha, os eventos são os
 * de `webhooks-saida.ts` (não os `contacts/messages/eventtrackings` da
 * origem, que não existem no Pipe), o segredo do HMAC aparece uma vez na
 * criação, e "Testar" dispara um evento sintético na hora.
 *
 * ponytail: sem OAuth 2.0 nem cabeçalhos customizados por webhook — a
 * entrega (`entregarUma`) sempre assina com `x-pipe-signature`, e nenhuma
 * das duas colunas extras existe em `webhook_saida`.
 */

const EVENTOS_ROTULOS: Record<string, string> = {
  'conversa.criada': 'Conversa criada',
  'conversa.estado_alterado': 'Conversa mudou de estado',
  'conversa.atribuida': 'Conversa atribuída',
  'conversa.encerrada': 'Conversa encerrada',
  'mensagem.criada': 'Mensagem criada',
  'mensagem.estado_entrega_alterado': 'Mensagem mudou de estado de entrega',
  'contato.criado': 'Contato criado',
  'modelo.recategorizado': 'Modelo de mensagem recategorizado',
};
const TODOS_OS_EVENTOS = Object.keys(EVENTOS_ROTULOS);

function rotuloDoEvento(evento: string): string {
  return EVENTOS_ROTULOS[evento] ?? evento;
}

export function TelaDoWebhook({ base }: { base: string }) {
  const { data, isLoading } = useLeitura<WebhookListado[]>('/v1/gestao/webhooks');
  const webhooks = data ?? [];

  const [novaUrl, setNovaUrl] = useState('');
  const [novosEventos, setNovosEventos] = useState<string[]>([...TODOS_OS_EVENTOS]);
  const [criando, setCriando] = useState(false);
  const [avisoDeCriacao, setAvisoDeCriacao] = useState('');
  const [segredoGerado, setSegredoGerado] = useState<{ url: string; segredo: string } | null>(
    null,
  );
  const [excluindo, setExcluindo] = useState<WebhookListado | null>(null);
  const [excluindoAgora, setExcluindoAgora] = useState(false);
  const [erroDeExclusao, setErroDeExclusao] = useState<string | null>(null);
  const [testeDe, setTesteDe] = useState<Record<string, string>>({});

  const novaUrlAparada = novaUrl.trim();
  /* `urlValida` conta quantas vezes a URL aparece na lista para checar
     repetição (`webhook-regras.test.ts`) — a lista tem de INCLUIR a própria
     candidata, senão uma URL nova e válida nunca bate count === 1. */
  const urlDaNovaLinhaEValida =
    novaUrlAparada !== '' &&
    urlValida(novaUrlAparada, [...webhooks.map((w) => w.url), novaUrlAparada]);

  async function adicionar() {
    if (novosEventos.length === 0) {
      setAvisoDeCriacao('Selecione ao menos um evento.');
      return;
    }
    if (!urlDaNovaLinhaEValida) {
      setAvisoDeCriacao('Informe um endereço HTTPS válido, que ainda não esteja em uso.');
      return;
    }
    setCriando(true);
    setAvisoDeCriacao('');
    const resultado = await criarWebhook(novaUrl.trim(), novosEventos);
    setCriando(false);
    if (!resultado.ok) {
      setAvisoDeCriacao(resultado.erro);
      return;
    }
    setSegredoGerado({ url: resultado.valor.url, segredo: resultado.valor.segredo });
    setNovaUrl('');
    setNovosEventos([...TODOS_OS_EVENTOS]);
  }

  async function alternarAtivo(webhook: WebhookListado) {
    await editarWebhook(webhook.id, { ativo: !webhook.ativo });
  }

  async function testar(webhook: WebhookListado) {
    setTesteDe((atual) => ({ ...atual, [webhook.id]: 'Testando…' }));
    const resultado = await testarWebhook(webhook.id);
    const texto = !resultado.ok
      ? resultado.erro
      : resultado.valor.ok
        ? `Entregue (HTTP ${resultado.valor.status}).`
        : `Falhou: ${resultado.valor.erro ?? `HTTP ${resultado.valor.status}`}`;
    setTesteDe((atual) => ({ ...atual, [webhook.id]: texto }));
  }

  async function confirmarExclusao() {
    if (!excluindo) return;
    setExcluindoAgora(true);
    setErroDeExclusao(null);
    const resultado = await excluirWebhook(excluindo.id);
    setExcluindoAgora(false);
    if (!resultado.ok) {
      setErroDeExclusao(resultado.erro);
      return;
    }
    setExcluindo(null);
  }

  return (
    <>
      <header className="ph-cabecalho">
        <div className="ph-conteudo">
          <div className="ph-voltar-caixa">
            <Link className="ph-voltar" href={`${base}/integracoes`} aria-label="Voltar">
              <IconePortal nome="voltar" tamanho={22} />
            </Link>
          </div>
          <div className="ph-titulo-caixa">
            <h1 className="ph-titulo">Webhook</h1>
          </div>
        </div>
      </header>

      <div className="ig-grade">
        <section className="ig-papel">
          <div className="ig-papel-miolo">
            <div className="ig-painel">
              <IlustracaoIntegracao nome="webhook" altura={72} className="ig-figura-grande" />
              <div className="ig-painel-texto">
                <p className="ig-typo-16">
                  Envie os dados do seu chatbot para sua aplicação, por HTTPS, assinados por HMAC
                  (`X-Pipe-Signature`).
                </p>
                {webhooks.length === 0 && !isLoading ? (
                  <div className="ig-faixa-alerta" role="status">
                    <IconePortal nome="alerta" tamanho={24} />
                    <p className="ig-typo-16">Nenhum webhook configurado ainda.</p>
                  </div>
                ) : null}
              </div>
            </div>

            {segredoGerado ? (
              <div className="ig-form ig-segredo-gerado">
                <p className="ig-typo-16">
                  <strong>Webhook criado.</strong> Copie o segredo agora: por segurança, ele não
                  pode ser mostrado de novo.
                </p>
                <div className="cf-copiavel">
                  <input readOnly value={segredoGerado.segredo} aria-label="Segredo do webhook" />
                  <button
                    type="button"
                    className="cf-copiavel-botao"
                    aria-label="Copiar segredo"
                    onClick={() => void navigator.clipboard?.writeText(segredoGerado.segredo)}
                  >
                    Copiar
                  </button>
                </div>
                <button
                  type="button"
                  className="ig-botao ig-botao--fantasma"
                  onClick={() => setSegredoGerado(null)}
                >
                  Já copiei
                </button>
              </div>
            ) : null}

            <form
              className="ig-form"
              noValidate
              onSubmit={(evento) => {
                evento.preventDefault();
                void adicionar();
              }}
            >
              <div className="ig-mb4">
                <p className="ig-typo-16">Novo webhook</p>
              </div>
              <div className="ig-grupo-url">
                <div className="ig-linha-url">
                  <Campo
                    id="nova-url-webhook"
                    className="ig-campo-url"
                    rotulo="Endereço HTTPS"
                    valor={novaUrl}
                    erro={
                      novaUrl.trim() && !urlDaNovaLinhaEValida
                        ? 'O endereço precisa ser HTTPS, não repetir e não apontar para rede privada.'
                        : undefined
                    }
                    aoMudar={setNovaUrl}
                    placeholder="https://minha-aplicacao.com/webhook"
                  />
                </div>
                <div className="ig-chips-linha">
                  {TODOS_OS_EVENTOS.map((evento) => (
                    <label key={evento} className="ig-chip-checkbox">
                      <input
                        type="checkbox"
                        checked={novosEventos.includes(evento)}
                        onChange={(e) =>
                          setNovosEventos((atual) =>
                            e.target.checked
                              ? [...atual, evento]
                              : atual.filter((item) => item !== evento),
                          )
                        }
                      />
                      {rotuloDoEvento(evento)}
                    </label>
                  ))}
                </div>
              </div>

              {avisoDeCriacao ? (
                <p role="alert" className="ig-aviso">
                  {avisoDeCriacao}
                </p>
              ) : null}
              <div className="ig-acoes">
                <button
                  type="submit"
                  className="ig-botao ig-botao--principal"
                  disabled={criando || !urlDaNovaLinhaEValida}
                >
                  {criando ? 'Adicionando…' : '+ Adicionar'}
                </button>
              </div>
            </form>

            <ul className="ig-lista-webhooks">
              {webhooks.map((webhook) => (
                <li key={webhook.id} className="ig-grupo-url">
                  <div className="ig-linha-url">
                    <span className="ig-typo-16">{webhook.url}</span>
                    <Interruptor
                      id={`webhook-ativo-${webhook.id}`}
                      ligado={webhook.ativo}
                      rotulo={webhook.ativo ? 'Desativar webhook' : 'Ativar webhook'}
                      aoMudar={() => void alternarAtivo(webhook)}
                    />
                    <button
                      type="button"
                      className="ig-botao-icone"
                      aria-label="Testar webhook"
                      onClick={() => void testar(webhook)}
                    >
                      <IconePortal nome="testar" tamanho={24} />
                    </button>
                    <button
                      type="button"
                      className="ig-botao-icone"
                      aria-label="Excluir webhook"
                      onClick={() => {
                        setErroDeExclusao(null);
                        setExcluindo(webhook);
                      }}
                    >
                      <IconePortal nome="lixeira" tamanho={24} />
                    </button>
                  </div>
                  <div className="ig-chips-linha">
                    {webhook.eventos.map((evento) => (
                      <span className="ig-chip" key={evento}>
                        {rotuloDoEvento(evento)}
                      </span>
                    ))}
                  </div>
                  {testeDe[webhook.id] ? <p className="ig-typo-14">{testeDe[webhook.id]}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <ModalConfirmacao
        aberto={excluindo !== null}
        titulo="Excluir webhook"
        mensagem={<>Quer mesmo excluir o webhook para &quot;{excluindo?.url}&quot;?</>}
        erro={erroDeExclusao}
        confirmando={excluindoAgora}
        onConfirmar={() => void confirmarExclusao()}
        onCancelar={() => setExcluindo(null)}
      />
    </>
  );
}

/* ---- `bds-input`: div.input > div.input__container > label (fs-12 bold) + input (14px). */
function Campo({
  id,
  rotulo,
  valor,
  erro,
  placeholder,
  className,
  aoMudar,
}: {
  id?: string;
  rotulo?: string;
  valor: string;
  erro?: string;
  placeholder?: string;
  className?: string;
  aoMudar?: (valor: string) => void;
}) {
  return (
    <div className={['ig-campo', erro ? 'ig-campo--erro' : '', className ?? ''].join(' ').trim()}>
      <div className="ig-campo-caixa">
        <div className="ig-campo-miolo">
          {rotulo ? <label htmlFor={id}>{rotulo}</label> : null}
          <input
            id={id}
            type="text"
            value={valor}
            placeholder={placeholder}
            autoComplete="off"
            autoCapitalize="off"
            onChange={(evento) => aoMudar?.(evento.target.value)}
          />
        </div>
      </div>
      {erro ? <p className="ig-campo-erro">{erro}</p> : null}
    </div>
  );
}
