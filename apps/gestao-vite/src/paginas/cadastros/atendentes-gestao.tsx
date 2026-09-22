import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Botao, BotaoDeIcone, Icone } from '@pipe/ui';
import { useLeitura } from '../../lib/consulta';
import type { AtendenteCadastrado } from '../../lib/cadastros';
import { tirarDeTodasAsFilas } from '../../lib/atendentes-gravar';
import { filasDosAtendentes, filasNoCartao, filtrarAtendentes } from '../../lib/atendentes';
import { numero } from '../../lib/formato';
import { ListaRegras, type SecaoDeRegras } from '../../componentes/lista-regras';
import { useContato } from '../fluxo/contato';
import { baseDoAtendimento } from '../operacao/casca';
import { ModalConfirmacao } from './_modal';

/**
 * Gestão de atendentes — a lista.
 *
 * Esqueleto e textos medidos em `FICHA-atendentes-filas-pausas.md` §b.2/§a.4:
 * cabeçalho "Gestão de atendentes" com "Adicionar atendentes" à direita,
 * busca "Buscar por nome ou e-mail" + "Filtrar por: Filas", barra
 * "Selecionar todos", cartão com caixa de seleção + avatar + quatro campos
 * (Atendente/E-mail/Filas/Tickets simultâneos) e, à direita, Editar/
 * Permissões/Excluir.
 *
 * **"Selecionar todos" e o que ele seleciona.** A origem pagina no
 * SERVIDOR (§e.6 da ficha); a nossa lista já vem inteira e pagina no
 * cliente, dentro de `ListaRegras`, que não expõe a fatia visível de fora.
 * `alternarTodos` marca/desmarca o conjunto FILTRADO inteiro (busca de fila +
 * texto), não só a página à vista — é a simplificação honesta enquanto a
 * paginação continuar sendo só de exibição.
 * ponytail: seleciona o filtrado inteiro, não a página; ajustar se
 * `ListaRegras` passar a expor a fatia visível.
 *
 * **"Excluir" tira de todas as filas** — não apaga o usuário
 * (`tirarDeTodasAsFilas`, `lib/atendentes-gravar.ts`: no Pipe não existe
 * "equipe de atendimento" como cadastro à parte; quem recebe conversa é quem
 * está em fila).
 */
export function PaginaGestaoDeAtendentes() {
  const navegar = useNavigate();
  const { contato } = useContato();
  const base = baseDoAtendimento(contato.tipo, contato.id);

  const [filasAplicadas, setFilasAplicadas] = useState<string[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [paraExcluir, setParaExcluir] = useState<AtendenteCadastrado | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);

  const leitura = useLeitura<AtendenteCadastrado[]>('/v1/gestao/atendentes/gestao');
  if (!leitura.data) return null;
  const atendentes = leitura.data;

  const filasDisponiveis = filasDosAtendentes(atendentes);
  const filtrados = filtrarAtendentes(atendentes, { busca: '', filas: filasAplicadas });
  const todosMarcados = filtrados.length > 0 && filtrados.every((a) => selecionados.has(a.id));

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarTodos() {
    setSelecionados((atual) => {
      if (todosMarcados) return new Set([...atual].filter((id) => !filtrados.some((a) => a.id === id)));
      const novo = new Set(atual);
      for (const a of filtrados) novo.add(a.id);
      return novo;
    });
  }

  function irParaEdicao(ids: readonly string[]) {
    navegar(`${base}/atendentes/gestao/editar?atendentes=${ids.join(',')}`);
  }

  function irParaPermissoes(ids: readonly string[]) {
    navegar(`${base}/atendentes/gestao/permissoes?atendentes=${ids.join(',')}`);
  }

  async function excluir() {
    if (!paraExcluir) return;
    setExcluindo(true);
    setErroExclusao(null);
    const resultado = await tirarDeTodasAsFilas(paraExcluir.id, paraExcluir.filas);
    setExcluindo(false);
    if (resultado.ok) setParaExcluir(null);
    else setErroExclusao(resultado.erro);
  }

  const secoes: SecaoDeRegras[] = [
    {
      titulo: 'Gestão de atendentes',
      vazio: 'Nenhum atendente cadastrado.',
      cartoes: filtrados.map((a) => ({
        id: a.id,
        esquerda: (
          <span className="cl-selecao">
            <input
              type="checkbox"
              checked={selecionados.has(a.id)}
              onChange={() => alternarSelecao(a.id)}
              aria-label={`Selecionar ${a.nome}`}
            />
            <Avatar nome={a.nome} />
          </span>
        ),
        campos: [
          { rotulo: 'Atendente', valor: a.nome },
          { rotulo: 'E-mail', valor: a.email },
          { rotulo: 'Filas', valor: filasNoCartao(a.filas) },
          {
            rotulo: 'Tickets simultâneos',
            valor: a.limiteSimultaneo === null ? '—' : numero(a.limiteSimultaneo),
            classe: 'num',
          },
        ],
        situacao: a.ativo ? 'Ativo' : 'Desativado',
        /* A origem não tem coluna de status (§d.2 da ficha: "voltar para 4
           colunas") — `ativa` só decidiria o selo de `Cartao`, e como as três
           ações sempre existem aqui, ele nunca aparece de qualquer forma. */
        ativa: a.ativo,
        acao: (
          <>
            <BotaoDeIcone nome="lapis" rotulo={`Editar ${a.nome}`} onClick={() => irParaEdicao([a.id])} />
            <BotaoDeIcone
              nome="chave"
              rotulo={`Permissões de ${a.nome}`}
              onClick={() => irParaPermissoes([a.id])}
            />
            <BotaoDeIcone nome="x" rotulo={`Excluir ${a.nome}`} onClick={() => setParaExcluir(a)} />
          </>
        ),
        procura: `${a.nome} ${a.email}`.toLowerCase(),
      })),
    },
  ];

  return (
    <>
      <div className="board-head">
        <h2>Gestão de atendentes</h2>
        <Botao
          variante="primario"
          icone="mais"
          className="board-acao"
          onClick={() => navegar(`${base}/atendentes/gestao/adicionar`)}
        >
          Adicionar atendentes
        </Botao>
      </div>

      <div className="selecionar-todos-barra">
        <label className="selecionar-todos">
          <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} disabled={filtrados.length === 0} />
          Selecionar todos
        </label>
        {selecionados.size > 0 ? (
          <div className="acoes-em-lote">
            <span className="sub">
              {numero(selecionados.size)} selecionado{selecionados.size === 1 ? '' : 's'}
            </span>
            <Botao onClick={() => irParaEdicao([...selecionados])}>Editar</Botao>
            <Botao onClick={() => irParaPermissoes([...selecionados])}>Permissões</Botao>
          </div>
        ) : null}
      </div>

      {erroExclusao ? (
        <p className="sub" style={{ color: 'var(--p-erro-conteudo)' }}>
          {erroExclusao}
        </p>
      ) : null}

      <ListaRegras
        secoes={secoes}
        placeholder="Buscar por nome ou e-mail"
        ocultarCabecalhoDeSecao
        paginar
        tamanhoDePaginaInicial={5}
        filtros={<FiltroDeFilas opcoes={filasDisponiveis} aplicado={filasAplicadas} onAplicar={setFilasAplicadas} />}
      />

      <ModalConfirmacao
        aberto={paraExcluir !== null}
        titulo="Excluir atendente"
        mensagem={
          <>
            Tirar "{paraExcluir?.nome}" de todas as filas? A pessoa deixa de receber conversa e continua com a
            conta.
          </>
        }
        erro={erroExclusao}
        confirmando={excluindo}
        onConfirmar={() => void excluir()}
        onCancelar={() => {
          setParaExcluir(null);
          setErroExclusao(null);
        }}
      />
    </>
  );
}

/**
 * "Filtrar por: Filas" — painel suspenso ancorado no controle
 * (`FICHA-atendentes-filas-pausas.md` §a.4: seletor "Selecione a(s) fila(s)",
 * "Limpar seleção", "Cancelar", "Aplicar"). A escolha só vale para a lista
 * depois de "Aplicar" — cancelar ou fechar sem aplicar não muda nada.
 */
function FiltroDeFilas({
  opcoes,
  aplicado,
  onAplicar,
}: {
  opcoes: readonly string[];
  aplicado: readonly string[];
  onAplicar: (filas: string[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [staged, setStaged] = useState<string[]>([...aplicado]);

  function abrir() {
    setStaged([...aplicado]);
    setAberto(true);
  }

  return (
    <div className="filtro-filas">
      <span className="filtrar-rotulo">Filtrar por:</span>
      <button type="button" className="filtro-filas-ativador" onClick={() => (aberto ? setAberto(false) : abrir())}>
        Filas{aplicado.length > 0 ? ` (${aplicado.length})` : ''}
        <Icone nome="baixo" tamanho={16} />
      </button>

      {aberto ? (
        <div className="filtro-filas-painel" role="dialog" aria-label="Filtrar por filas">
          <div className="filtro-filas-cabecalho">
            <span className="sub">Selecione a(s) fila(s)</span>
            <button type="button" className="link-carregar-mais" onClick={() => setStaged([])}>
              Limpar seleção
            </button>
          </div>

          {opcoes.length === 0 ? (
            <p className="sub">Nenhuma fila cadastrada.</p>
          ) : (
            opcoes.map((nome) => (
              <label key={nome} className="filtro-filas-item">
                <input
                  type="checkbox"
                  checked={staged.includes(nome)}
                  onChange={() =>
                    setStaged((s) => (s.includes(nome) ? s.filter((n) => n !== nome) : [...s, nome]))
                  }
                />
                {nome}
              </label>
            ))
          )}

          <div className="cl-acoes">
            <Botao type="button" onClick={() => setAberto(false)}>
              Cancelar
            </Botao>
            <Botao
              type="button"
              variante="primario"
              onClick={() => {
                onAplicar(staged);
                setAberto(false);
              }}
            >
              Aplicar
            </Botao>
          </div>
        </div>
      ) : null}
    </div>
  );
}
