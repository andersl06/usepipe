import { useEffect, useState, type ComponentProps } from 'react';
import { BotaoDeIcone, Botao, Campo, Carregando, Etiqueta } from '@pipe/ui';
import { useRead } from '../../lib/query';
import type { ChannelWhatsapp, TemplateListed } from '../../lib/communication';
import { ROTULO_STATUS_META, trechosDoModelo } from '../../lib/communication';
import { channelDeleteTemplate, channelSyncTemplates } from '../../lib/channels-gravar';
import { Select } from '@pipe/ui/select';
import { Modal, ConfirmModal } from '@pipe/ui/modal';
import { Pagination, type PaginationState } from '@pipe/ui/pagination';
import { Tabela } from '@pipe/ui';
import { TemplateForm } from './communication-templates-formulario';
import { AVISO_EM_BREVE } from './communication-respostas-formulario';
import { CelulaFluxoDeRetorno, InterruptorDoModelo } from './communication-templates-retorno';

interface RespostaDaLista {
  modelos: TemplateListed[];
  channels: ChannelWhatsapp[];
  total: number;
  pagina: number;
  porPagina: number;
}

const OPTIONS_STATUS = Object.keys(ROTULO_STATUS_META);

/** "Sincronizar com a Meta": um botão por canal, `POST .../modelos/sincronizar`. */
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
          <Botao key={c.id} type="button" disabled={sincronizando === c.id} onClick={() => void sincronizar(c)}>
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

/** O texto do modelo como texto React; `{{n}}` ganha destaque, nunca vira HTML. */
function TextoDoModelo({ texto, className }: { texto: string; className: string }) {
  return (
    <span className={className}>
      {trechosDoModelo(texto).map((t, i) =>
        t.variavel ? (
          <span key={i} className="modelo-variavel">
            {t.texto}
          </span>
        ) : (
          t.texto
        ),
      )}
    </span>
  );
}

/**
 * Modelos de mensagens. A lista vem paginada do servidor (um bot chega a ~1.490 modelos), com busca
 * por nome e filtro de status no banco. O fluxo de retorno aponta para um bloco do Builder e o interruptor
 * liga ou desliga o uso do modelo no envio; o filtro por fluxo de retorno segue desabilitado.
 */
export function PageTemplates() {
  const [busca, setBusca] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [pg, setPg] = useState({ page: 1, byPage: 25 });
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(busca.trim());
      setPg((p) => ({ ...p, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  const consulta = new URLSearchParams({ pagina: String(pg.page), porPagina: String(pg.byPage) });
  if (q) consulta.set('q', q);
  if (status) consulta.set('status', status);
  const read = useRead<RespostaDaLista>(`/v1/management/communication/templates?${consulta}`, {
    placeholderData: (anterior) => anterior,
  });
  const [aberto, setAberto] = useState<TemplateListed | null>(null);
  const [paraExcluir, setParaExcluir] = useState<TemplateListed | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [errorDeletion, setErrorDeletion] = useState<string | null>(null);
  if (read.isError) return <Etiqueta tom="erro">Não foi possível carregar os modelos de mensagem.</Etiqueta>;
  if (!read.data) return <Carregando />;
  const { modelos, channels, total } = read.data;

  const estado: PaginationState = {
    page: pg.page,
    byPage: pg.byPage,
    total,
    setPage: (page) => setPg((p) => ({ ...p, page })),
    setByPage: (byPage) => setPg({ page: 1, byPage }),
  };

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

  const colunas: ComponentProps<typeof Tabela<TemplateListed>>['colunas'] = [
    { key: 'nome', rotulo: 'Nome', celula: (m) => m.name },
    { key: 'idioma', rotulo: 'Idioma', celula: (m) => m.idioma },
    {
      key: 'mensagem',
      rotulo: 'Mensagem',
      celula: (m) => (
        <>
          <TextoDoModelo texto={m.body} className="modelo-previa" />{' '}
          <button type="button" className="modelo-abrir" onClick={() => setAberto(m)}>
            abrir
          </button>
        </>
      ),
    },
    {
      key: 'fluxo',
      rotulo: 'Fluxo de retorno',
      celula: (m) => <CelulaFluxoDeRetorno modelo={m} />,
    },
    { key: 'status', rotulo: 'Status', celula: (m) => ROTULO_STATUS_META[m.statusMeta] ?? m.statusMeta },
    { key: 'ativo', rotulo: 'Ativo', celula: (m) => <InterruptorDoModelo modelo={m} /> },
    {
      key: 'acoes',
      rotulo: '',
      celula: (m) => <BotaoDeIcone nome="lixeira" rotulo="Excluir" onClick={() => setParaExcluir(m)} />,
    },
  ];

  const filtrando = Boolean(q || status);

  return (
    <>
      <div className="board-head">
        <h2>Modelos de mensagens</h2>
      </div>

      <SyncBar channels={channels} />

      <div className="panel-templates">
        <h3>Modelos de mensagens</h3>
        <div className="filtros-modelos" style={{ display: 'flex', gap: 'var(--p-e-2)', alignItems: 'center' }}>
          <span className="filtrar-rotulo">Filtrar por:</span>
          <Select value="" disabled aria-label="Fluxo de retorno" title={AVISO_EM_BREVE} onChange={() => {}}>
            <option value="">Fluxo de retorno</option>
          </Select>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPg((p) => ({ ...p, page: 1 }));
            }}
            aria-label="Status"
          >
            <option value="">Status</option>
            {OPTIONS_STATUS.map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS_META[s]}
              </option>
            ))}
          </Select>
          <Campo
            type="search"
            aria-label="Pesquise pelo nome do modelo de mensagem"
            placeholder="Pesquise pelo nome do modelo de mensagem"
            value={busca}
            maxLength={100}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <Tabela
          colunas={colunas}
          linhas={modelos}
          rowKey={(m) => m.id}
          empty={
            filtrando
              ? 'Nenhum modelo de mensagem encontrado para esse filtro.'
              : 'Ainda não foram cadastrados modelos de mensagem válidos para este chatbot! Crie novos modelos no formulário abaixo, ou sincronize com a Meta.'
          }
        />
        <Pagination layout="grade" state={estado} afastado />
      </div>

      <TemplateForm channels={channels} />

      <Modal aberto={aberto !== null} titulo={`Modelo "${aberto?.name ?? ''}"`} onFechar={() => setAberto(null)}>
        {aberto ? <TextoDoModelo texto={aberto.body} className="modelo-texto" /> : null}
      </Modal>

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
