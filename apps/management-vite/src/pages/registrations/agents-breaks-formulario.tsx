import { useState, type FormEvent } from 'react';
import { Botao, Campo, Etiqueta } from '@pipe/ui';
import { criarMotivoPausa } from '../../lib/registrations-gravar';
import { DURACAO_DA_PAUSA_MAX, NOME_DA_PAUSA_MAX, duracaoDaPausa } from '../../lib/pausas';

/**
 * Conteúdo do modal "Criar nova pausa personalizada" (`FICHA-personalizedbreaks.md` §3 e `ref/verificacao/personalizedbreaks-blip.md`): "Nome da pausa" (até 30 caracteres), "Duração em minutos" (número, inicial 0, até 999), "Cancelar" e "Criar". "Criar" só habilita com nome preenchido e duração de 1 a 999 minutos, que é o que o servidor aceita. "Conta como produtivo" é um campo só do Pipe: decide se o tempo da pausa entra no relatório de esforço como trabalho (treinamento, reunião) ou como tempo fora (almoço, café).
 */

export function FormularioMotivoPausa({ aoSalvar }: { aoSalvar?: () => void }) {
  const [nome, setNome] = useState('');
  const [duracao, setDuracao] = useState('0');
  const [produtivo, setProdutivo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minutos = duracaoDaPausa(duracao);
  const valido = nome.trim() !== '' && minutos !== null;

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    if (!valido || minutos === null) return;
    setEnviando(true);
    setError(null);
    const resultado = await criarMotivoPausa({
      name: nome.trim(),
      durationSuggestedMin: minutos,
      countsAsProductive: produtivo,
    });
    setEnviando(false);
    if (resultado.ok) aoSalvar?.();
    else setError(resultado.error);
  }

  return (
    <form onSubmit={(e) => void criar(e)} className="form-registration">
      <label className="form-campo">
        <span className="sub">Nome da pausa</span>
        <Campo
          value={nome}
          maxLength={NOME_DA_PAUSA_MAX}
          disabled={enviando}
          onChange={(e) => setNome(e.target.value)}
        />
      </label>

      <label className="form-campo">
        <span className="sub">Duração em minutos</span>
        <Campo
          type="number"
          min={0}
          max={DURACAO_DA_PAUSA_MAX}
          value={duracao}
          disabled={enviando}
          onChange={(e) => setDuracao(e.target.value.slice(0, 3))}
        />
      </label>

      <label className="form-caixa">
        <input
          type="checkbox"
          checked={produtivo}
          disabled={enviando}
          onChange={(e) => setProdutivo(e.target.checked)}
        />
        <span className="sub">
          <b>Conta como produtivo</b> — o tempo desta pausa é tempo de trabalho, não tempo fora.
        </span>
      </label>

      {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}

      <div className="cl-actions">
        <Botao type="button" onClick={aoSalvar} disabled={enviando}>
          Cancelar
        </Botao>
        <Botao type="submit" variante="primario" disabled={enviando || !valido}>
          {enviando ? 'Criando…' : 'Criar'}
        </Botao>
      </div>
    </form>
  );
}
