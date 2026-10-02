import { useState } from 'react';
import { Botao, Etiqueta } from '@pipe/ui';
import { Select } from '@pipe/ui/select';
import { useRead } from '../../lib/query';
import type { BlocoDeRetorno, TemplateListed } from '../../lib/communication';
import { editarModelo } from '../../lib/communication-gravar';

/**
 * Seletor do bloco do Builder onde a conversa continua quando o cliente responde ao modelo. Os blocos
 * vêm do fluxo do canal do modelo (publicado, senão rascunho) e só são buscados quando a pessoa abre o
 * seletor, para a tabela de centenas de modelos não disparar uma leitura por linha.
 */
function Seletor({ modelo, aoFechar }: { modelo: TemplateListed; aoFechar: () => void }) {
  const leitura = useRead<{ blocks: BlocoDeRetorno[] }>(
    `/v1/management/communication/templates/${modelo.id}/blocks`,
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function escolher(blocoId: string) {
    setSalvando(true);
    setErro(null);
    const saida = await editarModelo(modelo.id, { fluxoRetornoBlocoId: blocoId || null });
    setSalvando(false);
    if (!saida.ok) {
      setErro(saida.error);
      return;
    }
    aoFechar();
  }

  if (leitura.isError) return <Etiqueta tom="erro">Não foi possível carregar os blocos do fluxo.</Etiqueta>;
  if (!leitura.data) return <span className="sub">Carregando blocos…</span>;
  const { blocks } = leitura.data;
  if (blocks.length === 0) {
    return (
      <span className="sub">
        O canal deste modelo não tem fluxo com blocos.{' '}
        <button type="button" className="modelo-abrir" onClick={aoFechar}>
          fechar
        </button>
      </span>
    );
  }
  return (
    <>
      <Select
        value={modelo.fluxoRetorno.blockId ?? ''}
        disabled={salvando}
        aria-label={`Fluxo de retorno do modelo ${modelo.name}`}
        onChange={(e) => void escolher(e.target.value)}
      >
        <option value="">Nenhum</option>
        {blocks.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label === b.code ? b.code : `${b.label} (${b.code})`}
          </option>
        ))}
      </Select>{' '}
      <button type="button" className="modelo-abrir" onClick={aoFechar}>
        cancelar
      </button>
      {erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}
    </>
  );
}

/** Célula "Fluxo de retorno": bloco atual (ou "bloco removido") e o botão que abre o seletor. */
export function CelulaFluxoDeRetorno({ modelo }: { modelo: TemplateListed }) {
  const [editando, setEditando] = useState(false);
  if (editando) return <Seletor modelo={modelo} aoFechar={() => setEditando(false)} />;
  const { state, label, code } = modelo.fluxoRetorno;
  return (
    <>
      {state === 'ok' ? (
        <span>{label === code ? code : `${label} (${code})`}</span>
      ) : state === 'removido' ? (
        <Etiqueta tom="erro">{`Bloco removido (${code})`}</Etiqueta>
      ) : (
        <span className="sub">—</span>
      )}{' '}
      <Botao type="button" onClick={() => setEditando(true)}>
        {state === 'nenhum' ? 'Escolher' : 'Alterar'}
      </Botao>
    </>
  );
}

/** Interruptor "ativo": liga e desliga o uso do modelo no envio, sem abrir formulário. */
export function InterruptorDoModelo({ modelo }: { modelo: TemplateListed }) {
  const [erro, setErro] = useState<string | null>(null);
  async function alternar() {
    setErro(null);
    const saida = await editarModelo(modelo.id, { ativo: !modelo.ativo });
    if (!saida.ok) setErro(saida.error);
  }
  return (
    <>
      <button
        type="button"
        className="interruptor"
        role="switch"
        aria-checked={modelo.ativo}
        aria-label={modelo.ativo ? `Desativar o modelo ${modelo.name}` : `Ativar o modelo ${modelo.name}`}
        title={modelo.ativo ? 'Desativar: o modelo deixa de aparecer para envio' : 'Ativar: o modelo volta a poder ser enviado'}
        onClick={() => void alternar()}
      >
        <span className="interruptor-bolinha" />
      </button>
      {erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}
    </>
  );
}
