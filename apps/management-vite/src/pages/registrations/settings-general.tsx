import { Fragment, useState } from 'react';
import { Campo } from '@pipe/ui';
import { Select } from '@pipe/ui/select';
import { ChipsInput } from '@pipe/ui/chips-input';
import { useRead } from '../../lib/query';
import type { SettingsGeneral } from '../../lib/settings';
import { numero } from '../../lib/format';
import {
  DISPAROS_DE_PESQUISA,
  SCALE_BY_TYPE,
  ROTULO_DISPARO,
  ROTULO_TIPO_PESQUISA,
  TIPOS_DE_PESQUISA,
  tipoDePesquisaValido,
  type TipoDePesquisa,
} from '../../lib/pesquisa';
import { CardConfig } from '../../components/card-config';
import { CAMINHO_CONFIG_ATENDIMENTO, type ConfigAtendimento } from '../../lib/atendimento-config';
import { cartoesDeAtendimento } from './settings-general-atendimento';
import { closureSaveTags, saveGlobalTags, saveIdentity, salvarPesquisa } from '../../lib/actions';

const AVISO_EM_BREVE = 'Este recurso será liberado em breve para este fluxo.';

type SecaoEmBreve = { titulo: string; texto: string; opcoes?: readonly string[] };

/**
 * Seções que a Blip mostra e que ainda não têm onde gravar nem quem as leia no Pipe (a operação não guarda essas preferências). Aparecem na ordem da Blip, com o interruptor desabilitado e o aviso do UI-SPEC, em vez de um controle que não faz nada. A lista em `ref/DEPENDENCIAS-03.1.md` diz o que cada uma precisa.
 */
const SECOES_EM_BREVE: readonly SecaoEmBreve[] = [
  {
    titulo: 'Habilitar consulta a histórico de atendimentos no Pipe Desk',
    texto:
      'Permita consultas a informações de atendimentos anteriores no Pipe Desk. Lembre-se de conceder as permissões na página de Atendentes.',
  },
  {
    titulo: 'Pipe Calls',
    texto: 'Permitir que atendentes façam e recebam ligações',
    opcoes: [
      'Receber ligações de voz: permitir que atendentes recebam ligações do cliente via WhatsApp no Pipe Desk',
      'Realizar ligações de voz: permite que atendentes façam ligações ativas pelo Pipe Desk',
    ],
  },
  { titulo: 'Disponibilidade de atendente por fila', texto: 'Considerar a disponibilidade do atendente em cada fila.' },
  {
    titulo: 'Distribuição de tickets',
    texto: 'Defina o número máximo de atendimentos distribuídos automaticamente por atendente.',
    opcoes: [
      'Priorizar atendentes com menos tickets ativos (Padrão)',
      'Priorizar atendentes que estão há mais tempo sem receber novos tickets',
      'Não permitir que atendentes solicitem tickets manualmente',
      'Permitir atendimentos sem primeira resposta',
    ],
  },
  {
    titulo: 'Envio de mensagens ativas',
    texto: 'Habilitar o envio de mensagens ativas pelo Pipe Desk',
    opcoes: [
      'Selecionar roteadores',
      'Estabelecer prioridade máxima para tickets de Mensagens Ativas',
      'Limitar o total de mensagens ativas por cliente',
      'Limitar contatos por disparo de mensagem ativa',
      'Enviar mensagem ativa para contato em atendimento',
    ],
  },
  {
    titulo: 'Transferir tickets pelo Pipe Desk',
    texto: 'Habilita a transferência de tickets durante o atendimento',
    opcoes: [
      'Permitir transferência para atendentes específicos',
      'Permitir transferência para filas e atendentes offline',
    ],
  },
  { titulo: 'Envio de áudios', texto: 'Permitir que atendentes enviem áudios.' },
  { titulo: 'Emojis', texto: 'Permitir que atendentes usem emojis.' },
  {
    titulo: 'Envio de arquivos',
    texto: 'Permitir que atendentes enviem arquivos.',
    opcoes: ['Bloquear arquivos externos ao Pipe'],
  },
  { titulo: 'Esconder número de clientes aguardando', texto: 'Esconder dos atendentes o número de clientes aguardando.' },
  {
    titulo: 'Atendente inativo',
    texto: 'Atendente receberá um alerta visual quando estiver demorando para responder um cliente.',
    opcoes: ['Quantidade de alertas (1, 2 ou 3)', 'Alertar a cada (tempo e unidade)'],
  },
  {
    titulo: 'Tempo máximo de resposta do cliente',
    texto: 'O atendente é avisado quando o cliente demora a responder.',
    opcoes: ['Tempo máximo de resposta', 'Tempo do segundo alerta'],
  },
  {
    titulo: 'Categoria Modo de Espera',
    texto:
      'Ative o Modo de Espera para que seus atendentes possam pausar tickets enquanto realizam procedimentos internos. Enquanto o ticket estiver no Modo de Espera, o encerramento automático por inatividade será pausado.',
  },
  {
    titulo: 'Encerramento automático de tickets',
    texto:
      'Encerre automaticamente os tickets por inatividade. Hoje a regra é configurada por fila, na edição de cada fila; esta opção é a regra global.',
  },
];

/** Cartão de uma preferência que ainda não existe: interruptor desabilitado e o aviso padrão, sem botão Salvar. */
function CartaoEmBreve({ secao }: { secao: SecaoEmBreve }) {
  const id = `cfg-${secao.titulo.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section className="card-config" aria-labelledby={id} data-ligado="false">
      <header>
        <div>
          <h3 id={id}>{secao.titulo}</h3>
          <p>{secao.texto}</p>
        </div>
        <button
          type="button"
          className="interruptor"
          role="switch"
          aria-checked={false}
          aria-label={secao.titulo}
          title={AVISO_EM_BREVE}
          disabled
        >
          <span className="interruptor-bolinha" />
        </button>
      </header>
      {secao.opcoes ? (
        <div className="card-config-body">
          <div className="form-registration">
            {secao.opcoes.map((o) => (
              <label key={o} className="form-caixa">
                <input type="checkbox" disabled />
                <span className="sub">{o}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <footer>
        <span className="sub">{AVISO_EM_BREVE}</span>
      </footer>
    </section>
  );
}

/** Chips do catálogo global de tags; a lista inteira é enviada e o servidor decide o que criar e o que remover. */
function CampoDeTags({ iniciais, sujar }: { iniciais: string[]; sujar: () => void }) {
  const [tags, setTags] = useState(iniciais);
  return (
    <>
      <ChipsInput
        rotulo="Tags"
        label="Tags"
        placeholder="Insira as tags separando por vírgulas"
        name="tag"
        values={tags}
        onChange={(proximas) => {
          setTags(proximas);
          sujar();
        }}
      />
    </>
  );
}

/**
 * Configurações gerais (`attendance/general-settings`): uma página só, um cartão por seção, cada cartão salva sozinho, na ordem da Blip. As tags são globais, para todas as filas. O que o Pipe tem e a Blip não (identidade da operação e pesquisa de satisfação) fica no fim, sem remoção.
 */
export function PageSettingsGeneral() {
  const read = useRead<SettingsGeneral>('/v1/management/settings/general');
  const atendimento = useRead<ConfigAtendimento>(CAMINHO_CONFIG_ATENDIMENTO);
  if (!read.data || !atendimento.data) return null;
  const vivos = cartoesDeAtendimento(atendimento.data);
  const { identity, pesquisa, outrasPesquisas, etiquetas } = read.data;

  const tipoGravado = pesquisa?.type ?? '';
  const tipoAtual: TipoDePesquisa = tipoDePesquisaValido(tipoGravado) ? tipoGravado : 'csat';
  const daConversa = etiquetas.filter((e) => e.escopo !== 'contato');
  const obrigatorias = daConversa.filter((e) => e.obrigatoria);
  const emUso = daConversa.filter((e) => e.usos > 0);

  return (
    <>
      <div className="board-head">
        <h2>Configurações gerais</h2>
      </div>

      <CardConfig
        titulo="Gerenciar tags"
        explanation="Crie e edite as tags disponíveis para os atendentes que operam em todas as filas do Pipe Desk."
        acao={saveGlobalTags}
        rodape={
          emUso.length > 0
            ? `${numero(emUso.length)} tag(s) já etiquetaram conversas e não podem ser removidas.`
            : undefined
        }
      >
        {(sujar) => <CampoDeTags iniciais={daConversa.map((e) => e.name)} sujar={sujar} />}
      </CardConfig>

      <CardConfig
        titulo="Tornar obrigatória a inclusão de tags em atendimentos finalizados manualmente"
        explanation="Marque as tags que o atendente precisa incluir ao finalizar um atendimento. O encerramento automático por inatividade não pede tags."
        acao={closureSaveTags}
        interruptor={{
          name: 'exigir',
          rotulo: 'Tornar obrigatória a inclusão de tags em atendimentos finalizados manualmente',
          ligado: obrigatorias.length > 0,
        }}
        rodape={
          obrigatorias.length > 0
            ? `${numero(obrigatorias.length)} de ${numero(daConversa.length)} tags são obrigatórias.`
            : 'Nenhuma tag é obrigatória no momento.'
        }
      >
        {daConversa.length === 0 ? (
          <div className="empty">
            <b>Nenhuma tag cadastrada.</b>
            <p>Crie tags no cartão Gerenciar tags para poder exigi-las.</p>
          </div>
        ) : (
          <div className="form-registration">
            {daConversa.map((e) => (
              <label key={e.id} className="form-caixa">
                <input type="checkbox" name="etiqueta" value={e.id} defaultChecked={e.obrigatoria} />
                <span className="sub">
                  <b>{e.name}</b> · {numero(e.usos)} conversa(s) já etiquetada(s)
                </span>
              </label>
            ))}
          </div>
        )}
      </CardConfig>

      {SECOES_EM_BREVE.map((s) => (
        <Fragment key={s.titulo}>{vivos[s.titulo] ?? <CartaoEmBreve secao={s} />}</Fragment>
      ))}

      <CardConfig
        titulo="Identidade da operação"
        explanation="Defina o nome exibido no atendimento, o idioma e o fuso horário da operação."
        acao={saveIdentity}
        rodape={`Plano atual: ${identity.plan}.`}
      >
        <div className="form-linha">
          <label className="form-campo" style={{ flexBasis: '260px' }}>
            <span className="sub">Nome da operação</span>
            <Campo name="nome" defaultValue={identity.name} required />
          </label>

          <label className="form-campo" style={{ flexBasis: '240px' }}>
            <span className="sub">Fuso (IANA)</span>
            <Campo name="fuso" defaultValue={identity.fuso} placeholder="America/Sao_Paulo" required />
          </label>

          <label className="form-campo" style={{ flexBasis: '160px' }}>
            <span className="sub">Idioma</span>
            <Campo name="idioma" defaultValue={identity.idioma} placeholder="pt-BR" required />
          </label>
        </div>
      </CardConfig>

      <CardConfig
        titulo="Pesquisa de satisfação"
        explanation="Envie uma pesquisa após o atendimento para acompanhar a experiência do cliente."
        acao={salvarPesquisa}
        interruptor={{
          name: 'ativa',
          rotulo: 'Disparar a pesquisa de satisfação',
          ligado: pesquisa?.active ?? false,
        }}
        rodape={
          outrasPesquisas > 0
            ? `${numero(outrasPesquisas)} pesquisa(s) anterior(es) permanecem disponíveis nos relatórios.`
            : `Hoje: ${SCALE_BY_TYPE[tipoAtual].faixas}`
        }
      >
        {(sujar) => (
          <>
            {pesquisa ? <input type="hidden" name="id" value={pesquisa.id} /> : null}

            <div className="form-linha">
              <label className="form-campo" style={{ flexBasis: '240px' }}>
                <span className="sub">Modelo</span>
                <Select name="tipo" defaultValue={tipoAtual} onChange={sujar}>
                  {TIPOS_DE_PESQUISA.map((t) => (
                    <option key={t} value={t}>
                      {ROTULO_TIPO_PESQUISA[t]}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="form-campo" style={{ flexBasis: '240px' }}>
                <span className="sub">Quando disparar</span>
                <Select name="disparo" defaultValue={pesquisa?.trigger ?? 'encerramento'} onChange={sujar}>
                  {DISPAROS_DE_PESQUISA.map((d) => (
                    <option key={d} value={d}>
                      {ROTULO_DISPARO[d]}
                    </option>
                  ))}
                </Select>
              </label>
            </div>

            <label className="form-campo">
              <span className="sub">Pergunta que o cliente lê</span>
              <Campo
                name="pergunta"
                defaultValue={pesquisa?.pergunta ?? ''}
                placeholder="De 1 a 5, como você avalia este atendimento?"
                required
              />
            </label>

            <p className="note">Os relatórios mostram a nota média e a taxa de resposta.</p>
          </>
        )}
      </CardConfig>
    </>
  );
}
