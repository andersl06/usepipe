import { useActionState, useEffect, useRef, useState } from 'react';
import { Botao, Campo, Etiqueta, Seletor } from '@pipe/ui';
import type { Resultado } from '../../lib/acoes';
import { criarRegraSla, editarRegraSla, type PedidoDeRegraSla } from '../../lib/configuracoes-gravar';
import { ROTULO_ALVO, type FilaConfigurada, type RegraSlaConfigurada } from '../../lib/configuracoes';
import { envioQuePreserva } from '../../componentes/envio-de-formulario';

/**
 * Cadastro de regra de SLA — item 2 da tarefa de cadastros do Atendimento.
 * Liga os botões da tela `regras-sla.tsx` (o `TODO(escrita)` de lá) na API
 * sem mudar o visual: mesmo `form-cadastro`/`Modal` de toda tela de cadastro.
 *
 * **Decisão Pipe — escopo só se escolhe ao CRIAR.** A leitura
 * (`carregarRegras`, `apps/api/.../configuracoes.ts`) devolve `escopoNome`
 * para exibição, não `escopoId` — não há como pré-selecionar a fila no
 * formulário de edição sem isso. Mudar escopo depois de criada é raro
 * (a regra nasce ligada a uma fila ou à operação inteira); quem precisar
 * troca de escopo exclui e recria, e a edição fica só com nome/alvo/
 * prazo/alerta — o que cobre o pedido da tarefa sem alargar a leitura.
 */

function pedidoDoFormulario(dados: FormData): PedidoDeRegraSla {
  const alertaBruto = String(dados.get('alertaSeg') ?? '').trim();
  const escopoTipo = String(dados.get('escopoTipo') ?? 'tenant');
  return {
    nome: String(dados.get('nome') ?? '').trim(),
    alvo: String(dados.get('alvo') ?? '').trim(),
    prazoSeg: Number(dados.get('prazoSeg') ?? 0),
    alertaSeg: alertaBruto ? Number(alertaBruto) : null,
    escopoTipo,
    escopoId: escopoTipo === 'fila' ? String(dados.get('escopoId') ?? '').trim() : null,
  };
}

function acaoDeCriacao(_anterior: Resultado, dados: FormData): Promise<Resultado> {
  return criarRegraSla(pedidoDoFormulario(dados)).then((r) =>
    r.ok ? { ok: true } : { ok: false, erro: r.erro },
  );
}

function acaoDeEdicao(id: string) {
  // Edição não manda escopo — ver "Decisão Pipe" no topo do arquivo.
  return async (_anterior: Resultado, dados: FormData): Promise<Resultado> => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- descarta escopo de propósito
    const { escopoTipo, escopoId, ...pedido } = pedidoDoFormulario(dados);
    const resultado = await editarRegraSla(id, pedido);
    return resultado.ok ? { ok: true } : { ok: false, erro: resultado.erro };
  };
}

export function FormularioRegraSla({
  filas,
  regraExistente,
  aoSalvar,
}: {
  filas: readonly FilaConfigurada[];
  regraExistente?: RegraSlaConfigurada;
  aoSalvar?: () => void;
}) {
  const editando = regraExistente !== undefined;
  const formRef = useRef<HTMLFormElement>(null);
  const [escopo, setEscopo] = useState(regraExistente?.escopoTipo ?? 'tenant');
  const [resultado, enviar, enviando] = useActionState(
    regraExistente ? acaoDeEdicao(regraExistente.id) : acaoDeCriacao,
    { ok: true },
  );
  const estadoInicial = useRef(resultado);

  useEffect(() => {
    if (resultado === estadoInicial.current) return;
    if (resultado.ok) {
      formRef.current?.reset();
      aoSalvar?.();
    }
  }, [resultado]);

  return (
    <form
      ref={formRef}
      onSubmit={envioQuePreserva((dados) => enviar(dados))}
      className="form-cadastro"
    >
      <div className="form-linha">
        <label className="form-campo" style={{ flexBasis: '240px' }}>
          <span className="sub">Nome</span>
          <Campo
            name="nome"
            defaultValue={regraExistente?.nome}
            placeholder="Primeira resposta padrão"
            required
            disabled={enviando}
          />
        </label>

        <label className="form-campo" style={{ flexBasis: '200px' }}>
          <span className="sub">Alvo</span>
          <Seletor name="alvo" defaultValue={regraExistente?.alvo ?? 'primeira_resposta'} disabled={enviando}>
            {Object.entries(ROTULO_ALVO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </Seletor>
        </label>

        <label className="form-campo">
          <span className="sub">Prazo (segundos)</span>
          <Campo
            name="prazoSeg"
            type="number"
            min={1}
            max={604_800}
            defaultValue={regraExistente?.prazoSeg ?? 3600}
            required
            disabled={enviando}
          />
        </label>

        <label className="form-campo">
          <span className="sub">Alerta (segundos, opcional)</span>
          <Campo
            name="alertaSeg"
            type="number"
            min={1}
            defaultValue={regraExistente?.alertaSeg ?? undefined}
            disabled={enviando}
          />
        </label>
      </div>

      {editando ? null : (
        <div className="form-linha">
          <label className="form-campo" style={{ flexBasis: '200px' }}>
            <span className="sub">Escopo</span>
            <Seletor
              name="escopoTipo"
              value={escopo}
              onChange={(e) => setEscopo(e.target.value)}
              disabled={enviando}
            >
              <option value="tenant">Toda a operação</option>
              <option value="fila">Uma fila</option>
            </Seletor>
          </label>

          {escopo === 'fila' ? (
            <label className="form-campo" style={{ flexBasis: '220px' }}>
              <span className="sub">Fila</span>
              <Seletor name="escopoId" defaultValue="" required disabled={enviando}>
                <option value="">Escolha a fila</option>
                {filas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </Seletor>
            </label>
          ) : null}
        </div>
      )}

      {resultado.erro ? <Etiqueta tom="erro">{resultado.erro}</Etiqueta> : null}

      <div className="cl-acoes">
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Salvar regra'}
        </Botao>
      </div>
    </form>
  );
}
