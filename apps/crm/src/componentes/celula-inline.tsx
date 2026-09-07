'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { salvarCampoDoLead } from '../app/leads/acoes';
import { CAMPOS_EDITAVEIS, normalizar, recusar, type ChaveCampo } from '../lib/campos-editaveis';
import type { Proprietario } from '../lib/leads-visao';
import { IconeCrm } from './icones-crm';

/**
 * O campo que se edita no lugar. É o `record-inline-cell` do Twenty, escrito do
 * zero — `twenty-front` é AGPL e não entra aqui. O que se copiou é medida e
 * comportamento, lidos em
 * `object-record/record-inline-cell/components/RecordInlineCell*.tsx`:
 *
 * - **Nada de formulário.** Clicar no valor troca o texto por um campo no mesmo
 *   lugar, e o resto da tela não se mexe. A folga de 4px que o valor já tem em
 *   volta (a deles, `spacing[1]`) é compensada por margem negativa: sem isso o
 *   texto anda 4px ao virar editável, e campo que pula ao ser tocado é o que
 *   faz alguém desconfiar de que gravou errado.
 * - **O lápis só existe no hover**, e some quando o campo está vazio — porque
 *   campo vazio já é convite a clicar, e o ícone só ocuparia largura.
 * - **Enter e sair do campo gravam; Esc desiste.** É o contrato deles, e é o que
 *   qualquer planilha faz.
 *
 * O que **não** copiamos: eles abrem o editor num portal flutuante ancorado com
 * `floating-ui`, para caber o seletor de data e o de relação por cima da lateral
 * estreita. Aqui os campos são texto e uma seleção nativa, que cabem na largura
 * da própria linha. Um portal para um `<input>` de 24px seria 200 linhas para
 * resolver um problema que não temos — e o `<select>` nativo já abre por cima
 * de tudo sozinho.
 *
 * **O valor mostrado é sempre o que o servidor confirmou.** Enquanto grava, a
 * célula mostra o novo (senão parece travada); se falhar, ela **volta ao valor
 * anterior** e diz por quê. É a regra do produto: nunca afirmar sucesso sobre
 * uma linha que não mudou.
 */

interface Props {
  leadId: string;
  campo: ChaveCampo;
  /** O valor gravado. Para seleção é o id; o rótulo sai de `opcoes`. */
  valor: string | null;
  /** Só para `tipo: 'selecao'`. Vazio na lista significa "sem proprietário". */
  opcoes?: Proprietario[];
  /** O que aparece quando não há valor. Padrão: o rótulo do campo. */
  vazio?: string;
  /**
   * Como desenhar o valor em repouso.
   *
   * Existe por causa da listagem: lá `origem` é uma etiqueta, e trocá-la por
   * texto cru ao tornar a célula editável seria perder informação de forma para
   * ganhar edição. É o que o `record-table-cell` do Twenty faz — o display da
   * célula continua sendo o do campo, e só a edição é comum.
   */
  pintar?: (texto: string) => ReactNode;
}

export function CelulaInline({ leadId, campo, valor, opcoes = [], vazio, pintar }: Props) {
  const { rotulo, tipo, maximo } = CAMPOS_EDITAVEIS[campo];
  const [gravado, setGravado] = useState<string | null>(valor);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [emCurso, iniciar] = useTransition();
  const campoRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  /** Trava o `blur` quando é o Esc que está fechando: senão ele grava o que a
   *  pessoa acabou de mandar descartar. */
  const desistindo = useRef(false);

  // A ficha é servidor: depois do `revalidatePath` ela volta com o valor novo, e
  // é ele que vale. Sem isto, editar, sair e voltar mostraria o estado local
  // velho até um recarregamento completo.
  useEffect(() => setGravado(valor), [valor]);

  useEffect(() => {
    if (!editando) return;
    const el = campoRef.current;
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  }, [editando]);

  const rotuloDe = (id: string | null) =>
    id === null ? null : (opcoes.find((o) => o.id === id)?.nome ?? id);

  const texto = tipo === 'selecao' ? rotuloDe(gravado) : gravado;
  const placeholder = vazio ?? rotulo;

  function abrir() {
    setErro(null);
    setRascunho(gravado ?? '');
    setEditando(true);
  }

  function fechar() {
    desistindo.current = true;
    setEditando(false);
    setErro(null);
  }

  function gravar(bruto: string) {
    setEditando(false);
    const novo = normalizar(bruto);
    if (novo === gravado) {
      setErro(null);
      return;
    }

    // A mesma recusa do servidor, antes da viagem: e-mail sem arroba não
    // precisa de ida e volta para ser recusado.
    const queixa = recusar(campo, novo);
    if (queixa) {
      setErro(queixa);
      return;
    }

    const anterior = gravado;
    setGravado(novo); // otimista: a célula mostra o novo enquanto grava.
    setErro(null);
    iniciar(async () => {
      const r = await salvarCampoDoLead(leadId, campo, bruto, anterior);
      setGravado(r.valor);
      setErro(r.ok ? null : (r.erro ?? 'Não deu para gravar.'));
    });
  }

  if (editando) {
    const comuns = {
      className: 'editar',
      'aria-label': rotulo,
      onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (desistindo.current) {
          desistindo.current = false;
          return;
        }
        gravar(e.currentTarget.value);
      },
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          fechar();
        }
        // Num `<select>` o Enter já fecha a lista; deixar o `blur` gravar evita
        // gravar duas vezes o mesmo valor.
        if (e.key === 'Enter' && e.currentTarget instanceof HTMLInputElement) {
          e.preventDefault();
          gravar(e.currentTarget.value);
        }
      },
    };

    return (
      <span className="inline">
        {tipo === 'selecao' ? (
          <select
            {...comuns}
            ref={(el) => {
              campoRef.current = el;
            }}
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
          >
            <option value="">sem {rotulo.toLowerCase()}</option>
            {opcoes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
        ) : (
          <input
            {...comuns}
            ref={(el) => {
              campoRef.current = el;
            }}
            type="text"
            maxLength={maximo}
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
          />
        )}
      </span>
    );
  }

  return (
    <span className={`inline${emCurso ? ' gravando' : ''}`}>
      <button
        type="button"
        className={texto ? 'ver' : 'ver sem'}
        onClick={abrir}
        title={`Editar ${rotulo.toLowerCase()}`}
      >
        {texto === null ? placeholder : (pintar?.(texto) ?? texto)}
      </button>
      {texto ? (
        <span className="lapis" aria-hidden="true">
          <IconeCrm nome="lapis" tamanho={16} />
        </span>
      ) : null}
      {erro ? (
        <span className="queixa" role="alert">
          {erro}
        </span>
      ) : null}
    </span>
  );
}
