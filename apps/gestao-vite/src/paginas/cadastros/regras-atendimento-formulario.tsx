import { useActionState, useEffect, useRef, useState } from 'react';
import { Botao, Campo, Etiqueta, Seletor } from '@pipe/ui';
import { salvarRegraFila, type Resultado } from '../../lib/acoes';
import { editarRegraFila } from '../../lib/cadastros-gravar';
import {
  CAMPOS_DE_REGRA,
  OPERADORES_DE_REGRA,
  PREFIXO_ATRIBUTO,
  ROTULO_CAMPO,
  ROTULO_OPERADOR,
  type OperadorDeRegra,
} from '../../lib/regra-fila';
import type { FilaParaEscolher, RegraDeFilaCadastrada } from '../../lib/cadastros';
import { envioQuePreserva } from '../../componentes/envio-de-formulario';

/**
 * Cadastro da regra de entrada.
 *
 * As condições são linhas repetidas de `campo` / `operador` / `valor`: o
 * `FormData` devolve campos de mesmo nome como lista, e a ação lê as três em
 * paralelo. Linha em branco é ignorada — o formulário nasce com uma e a pessoa
 * acrescenta as que quiser.
 *
 * O envio passa por `envioQuePreserva` porque este é o formulário mais caro de
 * redigitar da Gestão: erro de validação com o `action` nativo do React 19
 * apagaria o nome, a fila, o combinador e todas as condições de uma vez.
 */

/** Campo extra do contato: a chave é livre, e o prefixo é o que o motor entende. */
const EXTRA = '__extra__';

interface CondicaoInicial {
  campo: string;
  operador: OperadorDeRegra;
  valor: string;
}

function LinhaDeCondicao({
  desabilitado,
  inicial,
}: {
  desabilitado: boolean;
  /** Preenche a linha ao editar uma regra existente — ausente é "linha em branco" (criação). */
  inicial?: CondicaoInicial;
}) {
  const campoInicialEhFixo = !inicial || (CAMPOS_DE_REGRA as readonly string[]).includes(inicial.campo);
  const [campo, setCampo] = useState<string>(
    inicial ? (campoInicialEhFixo ? inicial.campo : EXTRA) : CAMPOS_DE_REGRA[0],
  );
  const chaveExtraInicial =
    inicial && !campoInicialEhFixo ? inicial.campo.slice(PREFIXO_ATRIBUTO.length) : '';

  return (
    <div className="form-linha">
      <label className="form-campo" style={{ flexBasis: '220px' }}>
        <span className="sub">Campo</span>
        <Seletor value={campo} onChange={(e) => setCampo(e.target.value)} disabled={desabilitado}>
          {CAMPOS_DE_REGRA.map((c) => (
            <option key={c} value={c}>
              {ROTULO_CAMPO[c]}
            </option>
          ))}
          <option value={EXTRA}>Campo extra do contato…</option>
        </Seletor>
      </label>

      {campo === EXTRA ? (
        <label className="form-campo" style={{ flexBasis: '200px' }}>
          <span className="sub">Chave do campo extra</span>
          {/* O `name` é o mesmo `campo` da lista: o que muda é só como o valor
              é montado. A ação recebe `contato.atributos.plano` dos dois jeitos. */}
          <Campo
            name="campo"
            defaultValue={chaveExtraInicial}
            placeholder="plano"
            pattern="[A-Za-z0-9_]+"
            title="Letras, números e sublinhado."
            required
            disabled={desabilitado}
          />
        </label>
      ) : (
        <input type="hidden" name="campo" value={campo} />
      )}

      <label className="form-campo" style={{ flexBasis: '180px' }}>
        <span className="sub">Operador</span>
        <Seletor name="operador" defaultValue={inicial?.operador ?? 'contem'} disabled={desabilitado}>
          {OPERADORES_DE_REGRA.map((o) => (
            <option key={o} value={o}>
              {ROTULO_OPERADOR[o]}
            </option>
          ))}
        </Seletor>
      </label>

      <label className="form-campo" style={{ flexBasis: '240px' }}>
        <span className="sub">Valor</span>
        <Campo name="valor" defaultValue={inicial?.valor ?? ''} placeholder="boleto" disabled={desabilitado} />
      </label>
    </div>
  );
}

/** `(prev, dados) => Resultado` no mesmo formato de `acaoRemota`, mas chamando o `PATCH` REST em vez de `acoes/:acao`. */
function acaoDeEdicao(id: string) {
  return async (_anterior: Resultado, dados: FormData): Promise<Resultado> => {
    const campos = dados.getAll('campo').map((v) => String(v));
    const operadores = dados.getAll('operador').map((v) => String(v));
    const valores = dados.getAll('valor').map((v) => String(v));
    const condicoes = campos
      .map((campo, i) => ({
        campo,
        operador: (operadores[i] ?? 'contem') as OperadorDeRegra,
        valor: valores[i] ?? '',
      }))
      // Linha em branco não entra — mesmo filtro de `salvarRegraFila` (ação de criação).
      .filter((c) => c.campo || c.valor);

    const resultado = await editarRegraFila(id, {
      nome: String(dados.get('nome') ?? '').trim(),
      filaDestinoId: String(dados.get('filaDestinoId') ?? '').trim(),
      combinador: (String(dados.get('combinador') ?? 'e') as 'e' | 'ou'),
      ordem: Number(dados.get('ordem') ?? '0'),
      condicoes,
    });
    return resultado.ok ? { ok: true } : { ok: false, erro: resultado.erro };
  };
}

export function FormularioRegraFila({
  filas,
  regraExistente,
  aoSalvar,
}: {
  filas: readonly FilaParaEscolher[];
  /** Presente = editar esta regra (`PATCH`); ausente = criar (mesmo de sempre). */
  regraExistente?: RegraDeFilaCadastrada;
  /** Fecha o modal quando o salvamento dá certo — sem isso a pessoa fica
      olhando para o próprio formulário limpo, sem saber se funcionou. */
  aoSalvar?: () => void;
}) {
  const editando = regraExistente !== undefined;
  const formRef = useRef<HTMLFormElement>(null);
  const [linhas, setLinhas] = useState(regraExistente?.condicoes.length ?? 1);
  /* O `reset()` do formulário não desfaz o estado do seletor de campo, que é
     controlado. Trocar a geração remonta as linhas zeradas — é o mesmo efeito,
     com uma linha em vez de um `useImperativeHandle` por linha. */
  const [geracao, setGeracao] = useState(0);
  const [resultado, enviar, enviando] = useActionState(
    regraExistente ? acaoDeEdicao(regraExistente.id) : salvarRegraFila,
    { ok: true },
  );
  /* `useActionState` nasce com `{ ok: true }` — o valor inicial, não uma
     confirmação de envio. Sem esta guarda, o efeito abaixo achava que acabou
     de salvar assim que o formulário monta (dentro do modal, por exemplo) e
     fechava tudo na hora, antes de a pessoa digitar qualquer coisa. Compara
     por identidade, e não por uma `ref` de "já montou": o `useEffect` do
     StrictMode roda invoke→cleanup→invoke uma vez a mais em desenvolvimento,
     e uma `ref` de booleano vira verdadeira cedo demais nesse replay. */
  const estadoInicial = useRef(resultado);

  useEffect(() => {
    if (resultado === estadoInicial.current) return;
    if (resultado.ok) {
      formRef.current?.reset();
      setLinhas(regraExistente?.condicoes.length ?? 1);
      setGeracao((g) => g + 1);
      aoSalvar?.();
    }
  }, [resultado]);

  return (
    <>
      <p className="sub">
        A regra manda a conversa para uma fila. A <b>ordem</b> decide quem é avaliada antes: a
        primeira que casar vence, e as de baixo não chegam a ser testadas.
      </p>

      <form
        ref={formRef}
        onSubmit={envioQuePreserva((dados) => {
          // O campo extra vai para o servidor com o prefixo que o motor lê.
          // Montar aqui evita um `name` diferente por tipo de linha, que faria
          // as três listas paralelas ficarem com tamanhos diferentes.
          const campos = dados.getAll('campo').map((v) => String(v));
          dados.delete('campo');
          for (const c of campos) {
            const fixo = (CAMPOS_DE_REGRA as readonly string[]).includes(c);
            dados.append('campo', fixo || c === '' ? c : `${PREFIXO_ATRIBUTO}${c}`);
          }
          enviar(dados);
        })}
        className="form-cadastro"
      >
        <div className="form-linha">
          <label className="form-campo" style={{ flexBasis: '240px' }}>
            <span className="sub">Nome da regra</span>
            <Campo
              name="nome"
              defaultValue={regraExistente?.nome}
              placeholder="Cobrança por palavra-chave"
              required
              disabled={enviando}
            />
          </label>

          <label className="form-campo" style={{ flexBasis: '220px' }}>
            <span className="sub">Fila de destino</span>
            <Seletor
              name="filaDestinoId"
              defaultValue={regraExistente?.filaDestinoId ?? ''}
              required
              disabled={enviando}
            >
              <option value="">Escolha a fila</option>
              {filas.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.ativa ? f.nome : `${f.nome} (desativada)`}
                </option>
              ))}
            </Seletor>
          </label>

          <label className="form-campo">
            <span className="sub">Ordem</span>
            <Campo
              name="ordem"
              type="number"
              min={0}
              max={999}
              defaultValue={regraExistente?.ordem ?? 0}
              disabled={enviando}
            />
          </label>

          <label className="form-campo" style={{ flexBasis: '200px' }}>
            <span className="sub">Combinar condições com</span>
            <Seletor name="combinador" defaultValue={regraExistente?.combinador ?? 'e'} disabled={enviando}>
              <option value="e">E — todas precisam casar</option>
              <option value="ou">OU — basta uma casar</option>
            </Seletor>
          </label>
        </div>

        <p className="note">
          <b>Condições.</b> Comparação sem acento e sem caixa. “Contém” também procura dentro de
          lista de valores. Linha em branco é ignorada — uma regra sem nenhuma condição preenchida é
          recusada, porque regra sem condição nunca casa e some da operação em silêncio.
        </p>

        {Array.from({ length: linhas }, (_, i) => (
          <LinhaDeCondicao key={`${geracao}-${i}`} desabilitado={enviando} inicial={regraExistente?.condicoes[i]} />
        ))}

        <div className="cl-acoes" style={{ justifyContent: 'flex-start' }}>
          <Botao type="button" onClick={() => setLinhas((n) => n + 1)} disabled={enviando}>
            Mais uma condição
          </Botao>
        </div>

        {resultado.erro ? <Etiqueta tom="erro">{resultado.erro}</Etiqueta> : null}

        <div className="cl-acoes">
          <Botao type="submit" variante="primario" disabled={enviando}>
            {enviando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Salvar regra'}
          </Botao>
        </div>
      </form>
    </>
  );
}
