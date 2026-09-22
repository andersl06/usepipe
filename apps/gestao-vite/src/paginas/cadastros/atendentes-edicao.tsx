import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, Botao, Campo, Etiqueta } from '@pipe/ui';
import { useLeitura } from '../../lib/consulta';
import type { AtendenteCadastrado, FilaCadastrada } from '../../lib/cadastros';
import { aplicarNaSelecao } from '../../lib/atendentes-gravar';
import { tituloDaEdicao } from '../../lib/atendentes';
import { Selecao } from '../../componentes/selecao';
import { useContato } from '../fluxo/contato';
import { baseDoAtendimento } from '../operacao/casca';

/**
 * `/team/create` e `/team/edit` da origem — as DUAS páginas próprias que
 * `modal.addAgent`/`modal.editAgent` nomeiam (`FICHA-atendentes-filas-
 * pausas.md` §a.1/§a.4). Sem `:id` na URL: a seleção viaja em `?atendentes=`,
 * porque a edição é EM LOTE — as três variantes de `editDropdown.title`
 * ("Editar 1 atendente" / "Editar N atendentes") só existem para isso.
 *
 * **"Adicionar atendente" não tem formulário aqui, e isso é dito, não
 * escondido.** No Pipe não existe criação solta de conta: quem entra recebe
 * convite (`/convite/:token`). Inventar um formulário que não grava nada
 * seria pior do que admitir a lacuna.
 *
 * **Os campos do lote são os que o Pipe tem.** A origem pede "Equipe" e
 * "Fila" como dois conceitos separados (`team`/`queue` no `i18n.js`); no
 * Pipe só existe FILA — o teto de conversas simultâneas nasce da
 * participação nela (`aplicarNaSelecao`, `lib/atendentes-gravar.ts`), não de
 * um cadastro de atendente à parte. "Equipe"/`teamsPlaceholder` ficou fora.
 */
export function PaginaEdicaoDeAtendente({ modo }: { modo: 'editar' | 'adicionar' }) {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const { contato } = useContato();
  const base = baseDoAtendimento(contato.tipo, contato.id);
  const ids = (params.get('atendentes') ?? '').split(',').filter(Boolean);

  if (modo === 'adicionar') {
    return (
      <>
        <div className="board-head">
          <h2>Adicionar atendente</h2>
        </div>
        <div className="vazio">
          <b>Ainda não dá para criar conta por aqui</b>
          <p>
            No Pipe, quem entra na equipe recebe um convite — não há cadastro solto de conta nesta tela. Para
            colocar alguém já cadastrado numa fila, volte e use o ícone <b>Editar</b> na lista.
          </p>
          <button type="button" className="btn" onClick={() => navegar(`${base}/atendentes/gestao`)}>
            Voltar para Gestão de atendentes
          </button>
        </div>
      </>
    );
  }

  return <EdicaoEmLote ids={ids} base={base} />;
}

function EdicaoEmLote({ ids, base }: { ids: readonly string[]; base: string }) {
  const navegar = useNavigate();
  const leituraAtendentes = useLeitura<AtendenteCadastrado[]>('/v1/gestao/atendentes/gestao');
  const leituraFilas = useLeitura<{ filas: FilaCadastrada[] }>('/v1/gestao/atendentes/filas');

  const [filaId, setFilaId] = useState('');
  const [capacidade, setCapacidade] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!leituraAtendentes.data || !leituraFilas.data) return null;
  const selecionados = leituraAtendentes.data.filter((a) => ids.includes(a.id));

  if (selecionados.length === 0) {
    return (
      <div className="vazio">
        <b>Nenhum atendente selecionado</b>
        <p>
          <button type="button" className="btn" onClick={() => navegar(`${base}/atendentes/gestao`)}>
            Voltar para Gestão de atendentes
          </button>
        </p>
      </div>
    );
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!filaId) return;
    setEnviando(true);
    setErro(null);
    const resultado = await aplicarNaSelecao(ids, filaId, capacidade.trim() ? Number(capacidade) : null);
    setEnviando(false);
    if (resultado.ok) navegar(`${base}/atendentes/gestao`);
    else setErro(resultado.erro);
  }

  return (
    <>
      <div className="board-head">
        <h2>{tituloDaEdicao(selecionados.length)}</h2>
      </div>

      <p className="sub">
        Para editar o(s) atendente(s) selecionado(s), preencha pelo menos um dos campos abaixo.
      </p>

      <div className="lista-selecionados">
        {selecionados.map((a) => (
          <span key={a.id} className="selecionado-chip">
            <Avatar nome={a.nome} /> {a.nome}
          </span>
        ))}
      </div>

      <form className="form-cadastro" onSubmit={(e) => void salvar(e)}>
        <div className="form-linha">
          <label className="form-campo" style={{ flexBasis: '260px' }}>
            <span className="sub">Fila</span>
            <Selecao value={filaId} onChange={(e) => setFilaId(e.target.value)} aria-label="Fila" required>
              <option value="">Escolha uma fila</option>
              {leituraFilas.data.filas.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Selecao>
          </label>

          <label className="form-campo" style={{ flexBasis: '220px' }}>
            <span className="sub">Nº de tickets simultâneos</span>
            <Campo
              type="number"
              min={1}
              max={200}
              placeholder="Padrão da fila"
              value={capacidade}
              onChange={(e) => setCapacidade(e.target.value)}
              disabled={enviando}
            />
          </label>
        </div>

        {erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}

        <div className="cl-acoes">
          <Botao type="button" onClick={() => navegar(`${base}/atendentes/gestao`)} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao type="submit" variante="primario" disabled={enviando || !filaId}>
            {enviando ? 'Salvando…' : 'Salvar'}
          </Botao>
        </div>
      </form>
    </>
  );
}
