import Link from 'next/link';
import { Avatar } from '@pipe/ui';
import {
  IconePortal,
  LogoPortal,
  type NomeDeIconePortal,
} from '../../../componentes/icones-portal';
import { numeroDaHome, pilhaDaEquipe, type Extensao, type Membro, type Metricas } from './itens';

/**
 * Os cartões da home do contato — as áreas de `.chatbot-home-content`
 * (template `application.home`, módulo 77021 de `portal.js`).
 *
 * Cada cartão recebe o dado por prop e aplica a MESMA condição do template de
 * origem para decidir o que aparece. A página passa o que o Pipe tem hoje;
 * quando não tem, passa vazio, e é a regra da origem que esconde ou troca o
 * estado — não uma decisão nossa.
 */

/**
 * `<bds-button size="short" variant="tertiary">`, ou o bloco apagado com o selo
 * "em breve" quando o destino ainda não existe aqui. `alto` é o
 * `size="standard"` (40px) do botão da loja, e `seta` é o `arrow` do
 * `bds-button`: um `arrow-right` outline depois do rótulo.
 */
function Botao({
  href,
  alto,
  seta,
  children,
}: {
  href: string | null;
  alto?: boolean;
  seta?: boolean;
  children: React.ReactNode;
}) {
  const classe = alto ? 'fx-botao fx-botao-alto' : 'fx-botao';
  const miolo = (
    <>
      {children}
      {seta ? <IconePortal nome="direita" tamanho={24} /> : null}
    </>
  );
  if (href) {
    return (
      <Link className={classe} href={href}>
        {miolo}
      </Link>
    );
  }
  return (
    <span className={`${classe} pt-links-obra`}>
      {miolo}
      <span className="pt-obra-selo">em breve</span>
    </span>
  );
}

/* --------------------------------------------------------------- extensões */

/**
 * `ng-if="isBlipStoreHomeBotPluginsRecommendationServicePageEnabled &&
 * extensions.length > 0 && !showAiCard"`. Na captura a flag está ligada e a loja
 * devolveu duas extensões — a origem desenha esta coluna para o roteador. Aqui
 * não há loja: a lista chega vazia e a coluna some, como lá sem recomendação.
 */
export function CartaoExtensoes({ extensoes }: { extensoes: readonly Extensao[] }) {
  if (extensoes.length === 0) return null;
  return (
    <div className="fx-area-extensoes">
      <section className="fx-papel fx-extensoes-papel">
        <div className="fx-extensoes-cabeca">
          <div className="fx-extensoes-titulo">
            <div className="fx-extensoes-titulo-caixa">
              <h2 className="fx-h4">Extensões para você</h2>
            </div>
          </div>
          <div className="fx-extensoes-botao">
            {/* "Ir para Blip Store" com o nome da nossa loja, que na barra do
                topo também está em obra. */}
            <Botao href={null} alto seta>
              Ir para Pipe Store
            </Botao>
          </div>
        </div>
        <div className="fx-extensoes-lista">
          {extensoes.map((x) => (
            <div key={x.id} className="fx-extensao-item">
              <div className="fx-extensao">
                <div className="fx-extensao-topo">
                  <div className="fx-extensao-imagem-caixa">
                    <img className="fx-extensao-imagem" src={x.iconeUrl} alt="" />
                  </div>
                  <div className="fx-extensao-textos">
                    <b className="fx-extensao-nome">{x.nome}</b>
                    <div className="fx-extensao-sub">
                      <p className="fx-extensao-resumo">{x.resumo}</p>
                      <b className="fx-extensao-preco">
                        {x.paga ? 'Teste grátis' : 'Instalação grátis'}
                      </b>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ canais */

/**
 * A fileira de logos, na ordem do template. `blip-chat` e `email` NÃO têm
 * `ng-if` — aparecem sempre; os outros dependem de
 * `ChannelsService.activationStatuses`. Messenger, Telegram, Workplace, Apple e
 * Google ficam de fora porque o Pipe não tem esses tipos: nunca estariam ativos.
 *
 * `logo: null` é a vaga do `blip-chat`, que é a marca da Blip e não entra: no
 * lugar vai o símbolo do Pipe, que é a marca do nosso widget de site.
 */
const LOGOS_DE_CANAL = [
  { tipo: 'widget', nome: 'Site', logo: null, sempre: true },
  { tipo: 'whatsapp_cloud', nome: 'WhatsApp', logo: 'whatsapp', sempre: false }, // `activationStatuses['wa']`
  { tipo: 'instagram', nome: 'Instagram', logo: 'instagram', sempre: false },
  { tipo: 'email', nome: 'E-mail', logo: 'email', sempre: true }, // `mailgun`
] as const;

/** `ng-if="!showAiCard"` — sem o cartão de IA (flag desligada), é este. */
export function CartaoCanais({ ativos, id }: { ativos: readonly string[]; id: string }) {
  const logos = LOGOS_DE_CANAL.filter((l) => l.sempre || ativos.includes(l.tipo));
  return (
    <div className="fx-area-canais">
      <section className="fx-papel fx-faixa">
        <div className="fx-faixa-titulo">
          <h2 className="fx-h4">Canais</h2>
        </div>
        <div className="fx-faixa-sub">
          {/* Cada vaga é um `bds-icon type="logo" size="large"` (28px). */}
          <div className="fx-canais-logos">
            {logos.map((l) => (
              <span
                key={l.tipo}
                className="fx-canal-logo"
                role="img"
                aria-label={l.nome}
                title={l.nome}
              >
                {l.logo ? (
                  <LogoPortal nome={l.logo} tamanho={28} />
                ) : (
                  <img src="/pipe/simbolo.svg" alt="" width={28} height={28} />
                )}
              </span>
            ))}
          </div>
          <div className="fx-faixa-botao">
            <Botao href={`/fluxo/${id}/canais`}>Ver canais</Botao>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ equipe */

/**
 * Dois estados, pelo `teamMembers.length`: mais de um vira a `avatar-array
 * limit="8"`; um ou nenhum vira a frase de convite.
 *
 * "Adicionar equipe" leva a `auth.application.detail.team`, a equipe DO
 * CONTATO. O RBAC daqui é por conta — falta a tabela que liga pessoa a contato,
 * e até lá a página passa a lista vazia e o botão fica em obra.
 */
export function CartaoEquipe({ membros }: { membros: readonly Membro[] }) {
  return (
    <div className="fx-area-equipe">
      <section className="fx-papel fx-faixa">
        <div className="fx-faixa-titulo">
          <h2 className="fx-h4 fx-mb1">Equipe</h2>
        </div>
        <div className="fx-faixa-sub">
          {membros.length > 1 ? (
            <div className="fx-pilha-caixa">
              <div className="fx-pilha">
                {pilhaDaEquipe(membros).map((m, i) => (
                  /* `left: 41px × i` e `z-index: 100 − i` saem do controlador
                     `avatarArray`, que os escreve direto no estilo. */
                  <span
                    key={i}
                    className="fx-pilha-item"
                    style={{ left: 41 * i, zIndex: 100 - i }}
                    title={m.nome}
                  >
                    {m.fotoUrl ? <img src={m.fotoUrl} alt={m.nome} /> : <Avatar nome={m.nome} />}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="fx-faixa-descricao">
              <p className="fx-descricao">Convide seu time para o seu contato inteligente</p>
            </div>
          )}
          <div className="fx-faixa-botao">
            <Botao href={null}>Adicionar equipe</Botao>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------- preferências */

/**
 * Cultura e Fuso horário são `bds-autocomplete` com `ng-disabled="!hasEditPermission"`,
 * e Plano é `bds-input disabled="true"` com o valor no `placeholder`. Aqui não há
 * permissão de edição — cultura e fuso são da conta e se editam em Minha conta —,
 * então os três chegam desabilitados e o "Aplicar alterações" (que só existe com
 * `hasEditPermission`) não entra.
 */
export function CartaoPreferencias({ fuso, plano }: { fuso: string; plano: string }) {
  return (
    <div className="fx-area-preferencias">
      <section className="fx-papel fx-preferencias">
        <h2 className="fx-h4">Preferências</h2>
        <div className="fx-campos">
          <Campo rotulo="Cultura" valor="Português (Brasil)" />
          <Campo rotulo="Fuso horário" valor={fuso} />
          <Campo rotulo="Plano" valor={plano} dica />
        </div>
      </section>
    </div>
  );
}

function Campo({ rotulo, valor, dica }: { rotulo: string; valor: string; dica?: boolean }) {
  return (
    <div className="fx-campo" aria-disabled="true">
      <span className="fx-campo-rotulo">{rotulo}</span>
      <span className={dica ? 'fx-campo-valor fx-campo-dica' : 'fx-campo-valor'}>{valor}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- métricas */

/**
 * `ng-if="nUsers != 0 && !isHidingHomeMetrics"`. `null` é o nosso
 * `isHidingHomeMetrics`: não há fonte de contagem por contato — e na captura a
 * flag `is-hiding-home-metrics` está LIGADA, então a origem também não desenha
 * este cartão para o roteador.
 */
export function CartaoMetricas({ metricas }: { metricas: Metricas | null }) {
  if (!metricas || metricas.usuarios === 0) return null;
  return (
    <div className="fx-area-metricas">
      <section className="fx-papel fx-metricas">
        {/* `team` é o mesmo desenho que o portal já usa como `comunidade`. */}
        <Metrica
          icone="comunidade"
          rotulo="Usuários"
          dica="Número de usuários desde a criação do contato"
          valor={metricas.usuarios}
          href={null}
        />
        <Metrica
          icone="mensagem-recebida"
          rotulo="Mensagens recebidas"
          dica="Número de mensagens recebidas pelo contato desde a criação"
          valor={metricas.recebidas}
          href="/relatorios/atendimento"
        />
        <Metrica
          icone="mensagem-enviada"
          rotulo="Mensagens enviadas"
          dica="Número de mensagens enviadas pelo contato desde a criação"
          valor={metricas.enviadas}
          href="/relatorios/atendimento"
        />
      </section>
    </div>
  );
}

/**
 * Uma coluna: ícone `size="brand"`, rótulo com a dica `info` (tema solid), o
 * número em `fs-32` e o "Ver mais", que só aparece no hover. O de Usuários vai à
 * tela de contatos, que não existe aqui; os de mensagens vão à análise.
 */
function Metrica({
  icone,
  rotulo,
  dica,
  valor,
  href,
}: {
  icone: NomeDeIconePortal;
  rotulo: string;
  dica: string;
  valor: number;
  href: string | null;
}) {
  return (
    <div className="fx-metrica">
      <IconePortal className="fx-metrica-icone" nome={icone} tamanho={64} />
      <div className="fx-metrica-texto">
        <div className="fx-metrica-rotulo">
          <span>{rotulo}</span>
          <span className="fx-metrica-dica" title={dica}>
            <IconePortal nome="informacao-cheia" tamanho={16} />
          </span>
        </div>
        <b className="fx-metrica-valor">{numeroDaHome(valor)}</b>
        {href ? (
          <Link className="fx-metrica-link" href={href}>
            Ver mais
          </Link>
        ) : (
          <span className="fx-metrica-link pt-links-obra">
            Ver mais
            <span className="pt-obra-selo">em breve</span>
          </span>
        )}
      </div>
    </div>
  );
}
