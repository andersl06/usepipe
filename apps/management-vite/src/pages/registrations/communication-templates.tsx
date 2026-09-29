import { useState } from 'react';
import { BotaoDeIcone, Botao, Etiqueta } from '@pipe/ui';
import { useRead } from '../../lib/query';
import type { ChannelWhatsapp, TemplateListed } from '../../lib/communication';
import {
  ROTULO_CABECALHO,
  ROTULO_CATEGORIA_TEMPLATE,
  ROTULO_STATUS_META,
  headerHasMedia,
  headerOffset,
  type CabecalhoTemplate,
  type CategoriaTemplate,
} from '../../lib/communication';
import { channelDeleteTemplate, channelSyncTemplates } from '../../lib/channels-gravar';
import { ListaRegras, type RulesSection } from '../../components/lista-regras';
import { Select } from '@pipe/ui/select';
import { ConfirmModal } from '@pipe/ui/modal';
import { TemplateForm } from './communication-templates-formulario';

/**
 * "Status" filter options — `FICHA-message-template.md` §3 documents "Habilitado"/"Desabilitado" at the source, but that's THEIR LOCAL on/off toggle; our `statusMeta` is something else (the template's Meta approval status, `ROTULO_STATUS_META`) — there's no "habilitado" here to translate. The filter uses the options the screen already shows on each card (§4 "Status na Meta"), in the same documented POSITION ("Filtrar por:", before the search).
 */
const OPTIONS_STATUS = Object.keys(ROTULO_STATUS_META);

/**
 * Real trigger positions, readable directly on the card: without a media header it's `{{1}}, {{2}}…`; with media, each one shifts by +1 and the card already shows the shifted number — it's the rule from the task's §"modelos" section, visible on the registration screen, not just in the sending code (`apps/workers/src/whatsapp/template.ts`).
 */
function triggerPositions(cabecalho: string, quantity: number): string {
  if (quantity === 0) return 'nenhuma';
  const offset = headerOffset(cabecalho);
  const positions = Array.from({ length: quantity }, (_, i) => i + 1 + offset);
  return positions.map((p) => `{{${p}}}`).join(', ');
}

/** "Sincronizar com a Meta" — one button per channel, `POST .../modelos/sincronizar`. */
function SyncBar({ channels }: { channels: ChannelWhatsapp[] }) {
  const [sincronizando, setSincronizando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ channel: string; texto: string; error?: boolean } | null>(null);

  async function sincronizar(channel: ChannelWhatsapp) {
    setSincronizando(channel.id);
    setResultado(null);
    const saida = await channelSyncTemplates(channel.id);
    setSincronizando(null);
    if (!saida.ok) {
      setResultado({ channel: channel.name, texto: saida.error, error: true });
      return;
    }
    const { criados, atualizados, removidos, ignorados } = saida.value;
    setResultado({
      channel: channel.name,
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
            {sincronizando === c.id ? 'Sincronizando…' : `Sincronizar "${c.name}" com a Meta`}
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
  const [errorDeletion, setErrorDeletion] = useState<string | null>(null);
  if (!read.data) return null;
  const { modelos: todosOsModelos, channels } = read.data;
  const modelos = status ? todosOsModelos.filter((m) => m.statusMeta === status) : todosOsModelos;

  async function excluir() {
    if (!paraExcluir) return;
    setExcluindo(true);
    setErrorDeletion(null);
    const resultado = await channelDeleteTemplate(paraExcluir.channelId, paraExcluir.name);
    setExcluindo(false);
    if (!resultado.ok) {
      setErrorDeletion(resultado.error);
      return;
    }
    setParaExcluir(null);
  }

  const sections: RulesSection[] = [
    {
      titulo: 'Modelos de mensagem',
      /*
       * Their empty-state literal text (`FICHA-message-template.md` §6), pointing to where the template gets registered — here, the form right below the list.
       */
      empty: 'Ainda não foram cadastrados modelos de mensagem válidos para este chatbot!',
      emptyDescription: 'Crie novos modelos no formulário abaixo, ou sincronize com a Meta.',
      cards: modelos.map((m) => ({
        id: m.id,
        campos: [
          { rotulo: 'Nome', value: m.name },
          { rotulo: 'Idioma', value: m.idioma },
          {
            rotulo: 'Categoria',
            value: ROTULO_CATEGORIA_TEMPLATE[m.category as CategoriaTemplate] ?? m.category,
          },
          { rotulo: 'Canal', value: m.channelName },
          {
            rotulo: 'Cabeçalho',
            value: ROTULO_CABECALHO[m.headerType as CabecalhoTemplate] ?? m.headerType,
          },
          {
            rotulo: headerHasMedia(m.headerType)
              ? 'Variáveis (cabeçalho desloca +1)'
              : 'Variáveis',
            value: triggerPositions(m.headerType, m.variables.length),
          },
          { rotulo: 'Status na Meta', value: ROTULO_STATUS_META[m.statusMeta] ?? m.statusMeta },
        ],
        situation: ROTULO_STATUS_META[m.statusMeta] ?? m.statusMeta,
        active: m.statusMeta === 'aprovado',
        procura: `${m.name} ${m.idioma} ${m.category} ${m.channelName}`.toLowerCase(),
        acao: (
          <BotaoDeIcone nome="x" rotulo={`Excluir o modelo ${m.name}`} onClick={() => setParaExcluir(m)} />
        ),
      })),
    },
  ];

  return (
    <>
      {/*
 * `FICHA-message-template.md` §2.1: header WITHOUT a button — the area to the right of the title stays empty in Blip, because there the template is registered under "Conteúdos > Modelo de mensagem" (§5), a screen that doesn't exist in Pipe today. Since there's nowhere to send that creation, the form stays here — it just moved below the list, so the top of the page matches theirs before reaching the part that's ours alone.
 */}
      <div className="board-head">
        <h2>Modelos de mensagens</h2>
      </div>

      <SyncBar channels={channels} />

      {/*
 * §2.2/§2.3: inside the content panel, the title repeats and the "Filtrar por:" line comes BEFORE the search. "Fluxo de retorno" (§3) is left out — the source captured that filter with `options="[]"` (even they had nothing there), and Pipe has no such concept. "Status" also isn't the same field (theirs is a local enabled/disabled toggle; ours is the Meta approval status), but it occupies the same position with the real data the screen already shows on each card.
 */}
      <div className="panel-templates">
        <h3>Modelos de mensagens</h3>

        {/*
 * Their row: "Filtrar por:", the selectors, and the search on the right taking up 69% — with the literal placeholder "Pesquise pelo nome do modelo de mensagem" (§3).
 */}
        <ListaRegras
          sections={sections}
          placeholder="Pesquise pelo nome do modelo de mensagem"
          sectionHideHeader
          filters={
            <>
              <span className="filtrar-rotulo">Filtrar por:</span>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                <option value="">Status</option>
                {OPTIONS_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_STATUS_META[s]}
                  </option>
                ))}
              </Select>
            </>
          }
        />
      </div>

      <TemplateForm channels={channels} />

      <ConfirmModal
        aberto={paraExcluir !== null}
        titulo="Excluir modelo"
        message={`Excluir "${paraExcluir?.name}"? A Meta apaga o modelo em todos os idiomas cadastrados com este nome.`}
        error={errorDeletion}
        confirmando={excluindo}
        rotuloConfirmar="Excluir"
        onConfirmar={() => void excluir()}
        onCancelar={() => setParaExcluir(null)}
      />
    </>
  );
}
