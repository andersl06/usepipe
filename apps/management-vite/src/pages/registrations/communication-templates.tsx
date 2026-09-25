import { useState } from 'react';
import { BotaoDeIcone, Botao, Etiqueta } from '@pipe/ui';
import { useRead } from '../../lib/query';
import type { ChannelWhatsapp, TemplateListed } from '../../lib/communication';
import {
  ROTULO_CABECALHO,
  ROTULO_CATEGORIA_TEMPLATE,
  ROTULO_STATUS_META,
  headerTemMedia,
  headerOffset,
  type CabecalhoTemplate,
  type CategoriaTemplate,
} from '../../lib/communication';
import { channelExcluirTemplate, channelSincronizarTemplates } from '../../lib/channels-gravar';
import { ListaRegras, type RulesSection } from '../../components/lista-regras';
import { Selection } from '../../components/selection';
import { ModalConfirmation } from './_modal';
import { FormularioTemplate } from './communication-templates-formulario';

/**
 * Opções do filtro "Status" — `FICHA-message-template.md` §3 documenta
 * "Habilitado"/"Desabilitado" na origem, mas isso é o liga-desliga LOCAL
 * deles; o nosso `statusMeta` é outra coisa (o status de aprovação do
 * template na Meta, `ROTULO_STATUS_META`) — não existe "habilitado" aqui
 * para traduzir. O filtro usa as opções que a tela já mostra em cada
 * cartão (§4 "Status na Meta"), na mesma POSIÇÃO documentada ("Filtrar
 * por:", antes da busca).
 */
const OPTIONS_STATUS = Object.keys(ROTULO_STATUS_META);

/**
 * Posições reais de disparo, para leitura direta no cartão: sem cabeçalho de
 * mídia é `{{1}}, {{2}}…`; com mídia, cada uma desliza +1 e o cartão já mostra
 * o número deslocado — é a regra do §"modelos" da tarefa, visível na tela de
 * quem cadastra, não só no código de envio (`apps/workers/src/whatsapp/template.ts`).
 */
function disparoPositions(cabecalho: string, quantity: number): string {
  if (quantity === 0) return 'nenhuma';
  const offset = headerOffset(cabecalho);
  const positions = Array.from({ length: quantity }, (_, i) => i + 1 + offset);
  return positions.map((p) => `{{${p}}}`).join(', ');
}

/** "Sincronizar com a Meta" — um botão por canal, `POST .../modelos/sincronizar`. */
function SyncBarra({ channels }: { channels: ChannelWhatsapp[] }) {
  const [sincronizando, setSincronizando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ channel: string; texto: string; error?: boolean } | null>(null);

  async function sincronizar(channel: ChannelWhatsapp) {
    setSincronizando(channel.id);
    setResultado(null);
    const saida = await channelSincronizarTemplates(channel.id);
    setSincronizando(null);
    if (!saida.ok) {
      setResultado({ channel: channel.nome, texto: saida.error, error: true });
      return;
    }
    const { criados, atualizados, removidos, ignorados } = saida.value;
    setResultado({
      channel: channel.nome,
      texto: `${criados} criado(s), ${atualizados} atualizado(s), ${removidos} removido(s)${ignorados ? `, ${ignorados} ignorado(s)` : ''}.`,
    });
  }

  if (channels.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--p-e-2)' }}>
      <div style={{ display: 'flex', gap: 'var(--p-e-2)', flexWrap: 'wrap' }}>
        {channels.map((c) => (
          <Botao
            key={c.id}
            type="button"
            disabled={sincronizando === c.id}
            onClick={() => void sincronizar(c)}
          >
            {sincronizando === c.id ? 'Sincronizando…' : `Sincronizar "${c.nome}" com a Meta`}
          </Botao>
        ))}
      </div>
      {resultado ? (
        <Etiqueta tom={resultado.error ? 'erro' : 'sucesso'}>
          {resultado.channel}: {resultado.texto}
        </Etiqueta>
      ) : null}
    </div>
  );
}

export function PageTemplates() {
  const read = useRead<{ modelos: TemplateListed[]; channels: ChannelWhatsapp[] }>(
    '/v1/management/communication/templates',
  );
  const [status, setStatus] = useState('');
  const [paraExcluir, setParaExcluir] = useState<TemplateListed | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [errorExclusao, setErrorExclusao] = useState<string | null>(null);
  if (!read.data) return null;
  const { modelos: todosOsModelos, channels } = read.data;
  const modelos = status ? todosOsModelos.filter((m) => m.statusMeta === status) : todosOsModelos;

  async function excluir() {
    if (!paraExcluir) return;
    setExcluindo(true);
    setErrorExclusao(null);
    const resultado = await channelExcluirTemplate(paraExcluir.channelId, paraExcluir.nome);
    setExcluindo(false);
    if (!resultado.ok) {
      setErrorExclusao(resultado.error);
      return;
    }
    setParaExcluir(null);
  }

  const sections: RulesSection[] = [
    {
      titulo: 'Modelos de mensagem',
      /* O texto literal do vazio deles (`FICHA-message-template.md` §6),
         apontando para onde o modelo se cadastra — aqui, o formulário logo
         abaixo da lista. */
      empty: 'Ainda não foram cadastrados modelos de mensagem válidos para este chatbot!',
      emptyDescription: 'Crie novos modelos no formulário abaixo, ou sincronize com a Meta.',
      cards: modelos.map((m) => ({
        id: m.id,
        campos: [
          { rotulo: 'Nome', value: m.nome },
          { rotulo: 'Idioma', value: m.idioma },
          {
            rotulo: 'Categoria',
            value: ROTULO_CATEGORIA_TEMPLATE[m.categoria as CategoriaTemplate] ?? m.categoria,
          },
          { rotulo: 'Canal', value: m.channelName },
          {
            rotulo: 'Cabeçalho',
            value: ROTULO_CABECALHO[m.cabecalhoTipo as CabecalhoTemplate] ?? m.cabecalhoTipo,
          },
          {
            rotulo: headerTemMedia(m.cabecalhoTipo)
              ? 'Variáveis (cabeçalho desloca +1)'
              : 'Variáveis',
            value: disparoPositions(m.cabecalhoTipo, m.variables.length),
          },
          { rotulo: 'Status na Meta', value: ROTULO_STATUS_META[m.statusMeta] ?? m.statusMeta },
        ],
        situation: ROTULO_STATUS_META[m.statusMeta] ?? m.statusMeta,
        active: m.statusMeta === 'aprovado',
        procura: `${m.nome} ${m.idioma} ${m.categoria} ${m.channelName}`.toLowerCase(),
        acao: (
          <BotaoDeIcone nome="x" rotulo={`Excluir o modelo ${m.nome}`} onClick={() => setParaExcluir(m)} />
        ),
      })),
    },
  ];

  return (
    <>
      {/* `FICHA-message-template.md` §2.1: cabeçalho SEM botão — a área à
          direita do título fica vazia na Blip, porque lá o modelo se cadastra
          em "Conteúdos > Modelo de mensagem" (§5), uma tela que não existe no
          Pipe hoje. Como não há para onde mandar essa criação, o formulário
          continua aqui — só desceu para depois da lista, para o topo da
          página bater com o deles antes de chegar na parte que é só nossa. */}
      <div className="board-head">
        <h2>Modelos de mensagens</h2>
      </div>

      <SyncBarra channels={channels} />

      {/* §2.2/§2.3: dentro do painel de conteúdo, o título repete e vem a
          linha "Filtrar por:" ANTES da busca. "Fluxo de retorno" (§3) fica de
          fora — a origem capturou esse filtro com `options="[]"` (nem eles
          tinham dado ali), e o Pipe não tem esse conceito. "Status" também
          não é o mesmo campo (deles é habilitado/desabilitado local; o nosso
          é o status de aprovação na Meta), mas ocupa a mesma posição com o
          dado real que a tela já mostra em cada cartão. */}
      <div className="painel-modelos">
        <h3>Modelos de mensagens</h3>

        {/* A linha deles: "Filtrar por:", os seletores, e a busca à direita
            ocupando 69% — com o placeholder literal "Pesquise pelo nome do
            modelo de mensagem" (§3). */}
        <ListaRegras
          sections={sections}
          placeholder="Pesquise pelo nome do modelo de mensagem"
          sectionOcultarHeader
          filters={
            <>
              <span className="filtrar-rotulo">Filtrar por:</span>
              <Selection value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                <option value="">Status</option>
                {OPTIONS_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_STATUS_META[s]}
                  </option>
                ))}
              </Selection>
            </>
          }
        />
      </div>

      <FormularioTemplate channels={channels} />

      <ModalConfirmation
        aberto={paraExcluir !== null}
        titulo="Excluir modelo"
        message={`Excluir "${paraExcluir?.nome}"? A Meta apaga o modelo em todos os idiomas cadastrados com este nome.`}
        error={errorExclusao}
        confirmando={excluindo}
        rotuloConfirmar="Excluir"
        onConfirmar={() => void excluir()}
        onCancelar={() => setParaExcluir(null)}
      />
    </>
  );
}
