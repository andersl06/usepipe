import { useState } from 'react';
import { BotaoDeIcone, Botao, Etiqueta } from '@pipe/ui';
import { useLeitura } from '../../lib/consulta';
import type { CanalWhatsapp, ModeloListado } from '../../lib/comunicacao';
import {
  ROTULO_CABECALHO,
  ROTULO_CATEGORIA_TEMPLATE,
  ROTULO_STATUS_META,
  cabecalhoTemMidia,
  deslocamentoDoCabecalho,
  type CabecalhoTemplate,
  type CategoriaTemplate,
} from '../../lib/comunicacao';
import { excluirModeloDoCanal, sincronizarModelosDoCanal } from '../../lib/canais-gravar';
import { ListaRegras, type SecaoDeRegras } from '../../componentes/lista-regras';
import { ModalConfirmacao } from './_modal';
import { FormularioModelo } from './comunicacao-modelos-formulario';

/**
 * Opções do filtro "Status" — `FICHA-message-template.md` §3 documenta
 * "Habilitado"/"Desabilitado" na origem, mas isso é o liga-desliga LOCAL
 * deles; o nosso `statusMeta` é outra coisa (o status de aprovação do
 * template na Meta, `ROTULO_STATUS_META`) — não existe "habilitado" aqui
 * para traduzir. O filtro usa as opções que a tela já mostra em cada
 * cartão (§4 "Status na Meta"), na mesma POSIÇÃO documentada ("Filtrar
 * por:", antes da busca).
 */
const OPCOES_STATUS = Object.keys(ROTULO_STATUS_META);

/**
 * Posições reais de disparo, para leitura direta no cartão: sem cabeçalho de
 * mídia é `{{1}}, {{2}}…`; com mídia, cada uma desliza +1 e o cartão já mostra
 * o número deslocado — é a regra do §"modelos" da tarefa, visível na tela de
 * quem cadastra, não só no código de envio (`apps/workers/src/whatsapp/template.ts`).
 */
function posicoesDeDisparo(cabecalho: string, quantidade: number): string {
  if (quantidade === 0) return 'nenhuma';
  const deslocamento = deslocamentoDoCabecalho(cabecalho);
  const posicoes = Array.from({ length: quantidade }, (_, i) => i + 1 + deslocamento);
  return posicoes.map((p) => `{{${p}}}`).join(', ');
}

/** "Sincronizar com a Meta" — um botão por canal, `POST .../modelos/sincronizar`. */
function BarraDeSincronizacao({ canais }: { canais: CanalWhatsapp[] }) {
  const [sincronizando, setSincronizando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ canal: string; texto: string; erro?: boolean } | null>(null);

  async function sincronizar(canal: CanalWhatsapp) {
    setSincronizando(canal.id);
    setResultado(null);
    const saida = await sincronizarModelosDoCanal(canal.id);
    setSincronizando(null);
    if (!saida.ok) {
      setResultado({ canal: canal.nome, texto: saida.erro, erro: true });
      return;
    }
    const { criados, atualizados, removidos, ignorados } = saida.valor;
    setResultado({
      canal: canal.nome,
      texto: `${criados} criado(s), ${atualizados} atualizado(s), ${removidos} removido(s)${ignorados ? `, ${ignorados} ignorado(s)` : ''}.`,
    });
  }

  if (canais.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--p-e-2)' }}>
      <div style={{ display: 'flex', gap: 'var(--p-e-2)', flexWrap: 'wrap' }}>
        {canais.map((c) => (
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
        <Etiqueta tom={resultado.erro ? 'erro' : 'sucesso'}>
          {resultado.canal}: {resultado.texto}
        </Etiqueta>
      ) : null}
    </div>
  );
}

export function PaginaModelos() {
  const leitura = useLeitura<{ modelos: ModeloListado[]; canais: CanalWhatsapp[] }>(
    '/v1/gestao/comunicacao/modelos',
  );
  const [status, setStatus] = useState('');
  const [paraExcluir, setParaExcluir] = useState<ModeloListado | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);
  if (!leitura.data) return null;
  const { modelos: todosOsModelos, canais } = leitura.data;
  const modelos = status ? todosOsModelos.filter((m) => m.statusMeta === status) : todosOsModelos;

  async function excluir() {
    if (!paraExcluir) return;
    setExcluindo(true);
    setErroExclusao(null);
    const resultado = await excluirModeloDoCanal(paraExcluir.canalId, paraExcluir.nome);
    setExcluindo(false);
    if (!resultado.ok) {
      setErroExclusao(resultado.erro);
      return;
    }
    setParaExcluir(null);
  }

  const secoes: SecaoDeRegras[] = [
    {
      titulo: 'Modelos de mensagem',
      /* O texto literal do vazio deles (`FICHA-message-template.md` §6),
         apontando para onde o modelo se cadastra — aqui, o formulário logo
         abaixo da lista. */
      vazio: 'Ainda não foram cadastrados modelos de mensagem válidos para este chatbot!',
      vazioDescricao: 'Crie novos modelos no formulário abaixo, ou sincronize com a Meta.',
      cartoes: modelos.map((m) => ({
        id: m.id,
        campos: [
          { rotulo: 'Nome', valor: m.nome },
          { rotulo: 'Idioma', valor: m.idioma },
          {
            rotulo: 'Categoria',
            valor: ROTULO_CATEGORIA_TEMPLATE[m.categoria as CategoriaTemplate] ?? m.categoria,
          },
          { rotulo: 'Canal', valor: m.canalNome },
          {
            rotulo: 'Cabeçalho',
            valor: ROTULO_CABECALHO[m.cabecalhoTipo as CabecalhoTemplate] ?? m.cabecalhoTipo,
          },
          {
            rotulo: cabecalhoTemMidia(m.cabecalhoTipo)
              ? 'Variáveis (cabeçalho desloca +1)'
              : 'Variáveis',
            valor: posicoesDeDisparo(m.cabecalhoTipo, m.variaveis.length),
          },
          { rotulo: 'Status na Meta', valor: ROTULO_STATUS_META[m.statusMeta] ?? m.statusMeta },
        ],
        situacao: ROTULO_STATUS_META[m.statusMeta] ?? m.statusMeta,
        ativa: m.statusMeta === 'aprovado',
        procura: `${m.nome} ${m.idioma} ${m.categoria} ${m.canalNome}`.toLowerCase(),
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

      <BarraDeSincronizacao canais={canais} />

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
          secoes={secoes}
          placeholder="Pesquise pelo nome do modelo de mensagem"
          ocultarCabecalhoDeSecao
          filtros={
            <>
              <span className="filtrar-rotulo">Filtrar por:</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                <option value="">Status</option>
                {OPCOES_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_STATUS_META[s]}
                  </option>
                ))}
              </select>
            </>
          }
        />
      </div>

      <FormularioModelo canais={canais} />

      <ModalConfirmacao
        aberto={paraExcluir !== null}
        titulo="Excluir modelo"
        mensagem={`Excluir "${paraExcluir?.nome}"? A Meta apaga o modelo em todos os idiomas cadastrados com este nome.`}
        erro={erroExclusao}
        confirmando={excluindo}
        rotuloConfirmar="Excluir"
        onConfirmar={() => void excluir()}
        onCancelar={() => setParaExcluir(null)}
      />
    </>
  );
}
