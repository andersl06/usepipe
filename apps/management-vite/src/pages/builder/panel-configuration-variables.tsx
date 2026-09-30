import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { Campo, Etiqueta, Icone } from '@pipe/ui';
import { IconePortal } from '@pipe/ui/icones-portal';
import { Interruptor } from '../flow/integrations/interruptor';
import {
  CONFIGURATION_SECTIONS,
  secondsToTimeSpan,
  timeSpanToSeconds,
} from './configuration-sections';
import type { ConfigurationSection } from './configuration-sections';
import { validConfigKey } from './state';
import { SecretVarsControl } from './secret-vars-control';

/**
 * The "Variáveis" tab of Configuração (default tab, `ref/CAPTURAS-F1-F6.md` §F-2): 8 collapsible
 * sections, all collapsed at first. "Variáveis de configuração" edits `flow.configuration`
 * ({{config.X}}); "Expiração da sessão" and "Tempo limite de ações" edit the
 * `builder:stateExpiration`/`builder:actionExecutionTimeout` keys the engine reads. The
 * other 5 show the Blip control disabled, with the recorded value if the flow has one (an imported
 * Blip flow may still carry a `builder:*` key even though the Pipe engine never reads it), marked
 * "Não disponível no Pipe" (D-56 item 3).
 */
export function ConfigurationVariablesTab({
  configuration,
  flowId,
  onChange,
}: {
  configuration: Record<string, string>;
  flowId: string;
  onChange: (chave: string, valor: string | null) => void;
}) {
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(new Set());

  function alternar(id: string): void {
    setAbertas((atual) => {
      const proxima = new Set(atual);
      if (proxima.has(id)) proxima.delete(id);
      else proxima.add(id);
      return proxima;
    });
  }

  return (
    <form className="bl-config-variaveis">
      {CONFIGURATION_SECTIONS.map((secao, indice) => (
        <div key={secao.id}>
          <ConfigurationSectionView
            secao={secao}
            aberta={abertas.has(secao.id)}
            onAlternar={() => alternar(secao.id)}
            configuration={configuration}
            flowId={flowId}
            onChange={onChange}
          />
          {indice < CONFIGURATION_SECTIONS.length - 1 ? (
            <hr className="bl-config-divisor" />
          ) : null}
        </div>
      ))}
    </form>
  );
}

function ConfigurationSectionView({
  secao,
  aberta,
  onAlternar,
  configuration,
  flowId,
  onChange,
}: {
  secao: ConfigurationSection;
  aberta: boolean;
  onAlternar: () => void;
  configuration: Record<string, string>;
  flowId: string;
  onChange: (chave: string, valor: string | null) => void;
}) {
  return (
    <section className="bl-config-secao">
      <header className="bl-config-secao-cabecalho">
        <button
          type="button"
          className="bl-config-secao-toggle"
          aria-expanded={aberta}
          onClick={onAlternar}
        >
          <Icone
            nome="baixo"
            tamanho={16}
            className={aberta ? 'bl-config-chevron bl-config-chevron--aberta' : 'bl-config-chevron'}
          />
          <span>{secao.titulo}</span>
        </button>
        <div className="bl-config-secao-controles">
          {secao.controle === 'switch' ? (
            <Interruptor
              id={`bl-config-switch-${secao.id}`}
              ligado={configuration[secao.chave ?? '']?.trim() === 'true'}
              desabilitado={!secao.disponivel}
              rotulo={secao.titulo}
              aoMudar={() => undefined}
            />
          ) : null}
          {!secao.disponivel ? <Etiqueta tom="neutro">Não disponível no Pipe</Etiqueta> : null}
        </div>
      </header>
      {aberta ? (
        <div className="bl-config-secao-corpo">
          <p className="sub">{secao.descricao}</p>
          {secao.descricaoExtra ? <p className="sub">{secao.descricaoExtra}</p> : null}
          <ConfigurationControl
            secao={secao}
            configuration={configuration}
            flowId={flowId}
            onChange={onChange}
          />
        </div>
      ) : null}
    </section>
  );
}

function ConfigurationControl({
  secao,
  configuration,
  flowId,
  onChange,
}: {
  secao: ConfigurationSection;
  configuration: Record<string, string>;
  flowId: string;
  onChange: (chave: string, valor: string | null) => void;
}) {
  if (secao.controle === 'slider') {
    const valor = Number(configuration[secao.chave ?? ''] ?? 0);
    return (
      <div className="bl-config-slider">
        <input
          type="range"
          min={0}
          max={100}
          value={Number.isFinite(valor) ? valor : 0}
          disabled
          aria-label={secao.titulo}
          readOnly
        />
        <span className="bl-config-slider-valor">{Number.isFinite(valor) ? valor : 0}%</span>
      </div>
    );
  }

  if (secao.controle === 'seconds') {
    const gravado = configuration[secao.chave ?? ''];
    const segundos = gravado ? timeSpanToSeconds(gravado) : null;
    return (
      <label className="bl-campo--interno">
        <span className="sub">{secao.rotuloCampo}</span>
        <Campo
          type="number"
          min={0}
          value={segundos ?? ''}
          disabled={!secao.disponivel}
          readOnly={!secao.disponivel}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const texto = e.target.value.trim();
            onChange(secao.chave ?? '', texto === '' ? null : secondsToTimeSpan(Number(texto)));
          }}
          aria-label={secao.rotuloCampo}
        />
      </label>
    );
  }

  if (secao.controle === 'identifier') {
    return (
      <>
        <label className="bl-campo--interno">
          <span className="sub">{secao.rotuloCampo}</span>
          <Campo value={flowId} disabled readOnly aria-label={secao.rotuloCampo} />
        </label>
        <button
          type="button"
          className="bl-config-link-desabilitado"
          disabled
          title="Não disponível no Pipe"
        >
          Redefinir identificador do fluxo
        </button>
      </>
    );
  }

  if (secao.controle === 'config-vars') {
    return <ConfigVarsControl configuration={configuration} onChange={onChange} />;
  }

  if (secao.controle === 'secret-vars') {
    return <SecretVarsControl flowId={flowId} />;
  }

  return null;
}

interface LinhaNova {
  id: string;
  chave: string;
  valor: string;
}

/** The only functional section: user keys of `flow.configuration`, read live by `{{config.X}}`. */
function ConfigVarsControl({
  configuration,
  onChange,
}: {
  configuration: Record<string, string>;
  onChange: (chave: string, valor: string | null) => void;
}) {
  const persistidas = Object.keys(configuration)
    .filter(validConfigKey)
    .sort((a, b) => a.localeCompare(b));
  const [novas, setNovas] = useState<LinhaNova[]>([]);
  const linhasNovas = novas.filter((l) => !persistidas.includes(l.chave));

  function adicionar(): void {
    setNovas((atual) => [
      ...atual,
      { id: `nova-${atual.length}-${Date.now()}`, chave: '', valor: '' },
    ]);
  }

  function mudarNova(id: string, campo: 'chave' | 'valor', texto: string): void {
    setNovas((atual) => atual.map((l) => (l.id === id ? { ...l, [campo]: texto } : l)));
    const linha = novas.find((l) => l.id === id);
    if (!linha) return;
    const proxima = { ...linha, [campo]: texto };
    if (proxima.chave && validConfigKey(proxima.chave)) onChange(proxima.chave, proxima.valor);
  }

  return (
    <div className="bl-config-vars">
      {persistidas.map((chave) => (
        <LinhaConfigVar
          key={chave}
          chave={chave}
          valor={configuration[chave] ?? ''}
          onMudarValor={(valor) => onChange(chave, valor)}
          onRenomear={(novaChave) => {
            if (!novaChave || novaChave === chave || !validConfigKey(novaChave)) return;
            onChange(chave, null);
            onChange(novaChave, configuration[chave] ?? '');
          }}
          onRemover={() => onChange(chave, null)}
        />
      ))}
      {linhasNovas.map((linha) => (
        <LinhaConfigVarNova
          key={linha.id}
          chave={linha.chave}
          valor={linha.valor}
          onMudarChave={(texto) => mudarNova(linha.id, 'chave', texto)}
          onMudarValor={(texto) => mudarNova(linha.id, 'valor', texto)}
          onRemover={() => setNovas((atual) => atual.filter((l) => l.id !== linha.id))}
        />
      ))}
      <button type="button" className="bl-config-adicionar" onClick={adicionar}>
        + Adicionar informações extras
      </button>
    </div>
  );
}

function LinhaConfigVar({
  chave,
  valor,
  onMudarValor,
  onRenomear,
  onRemover,
}: {
  chave: string;
  valor: string;
  onMudarValor: (valor: string) => void;
  onRenomear: (novaChave: string) => void;
  onRemover: () => void;
}) {
  const [chaveDraft, setChaveDraft] = useState(chave);
  const invalida = chaveDraft !== '' && !validConfigKey(chaveDraft);
  return (
    <div className="bl-config-var-linha">
      <Campo
        value={chaveDraft}
        placeholder="Variável"
        aria-label="Variável"
        className={invalida ? 'bl-campo--erro' : undefined}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setChaveDraft(e.target.value)}
        onBlur={() => {
          if (chaveDraft !== chave) onRenomear(chaveDraft);
        }}
      />
      <Campo
        value={valor}
        placeholder="Valor"
        aria-label="Valor"
        onChange={(e: ChangeEvent<HTMLInputElement>) => onMudarValor(e.target.value)}
      />
      <button
        type="button"
        className="iconbtn"
        title="Remover"
        aria-label={`Remover ${chave}`}
        onClick={onRemover}
      >
        <IconePortal nome="lixeira" tamanho={16} />
      </button>
    </div>
  );
}

function LinhaConfigVarNova({
  chave,
  valor,
  onMudarChave,
  onMudarValor,
  onRemover,
}: {
  chave: string;
  valor: string;
  onMudarChave: (texto: string) => void;
  onMudarValor: (texto: string) => void;
  onRemover: () => void;
}) {
  const invalida = chave !== '' && !validConfigKey(chave);
  return (
    <div className="bl-config-var-linha">
      <Campo
        value={chave}
        placeholder="Variável"
        aria-label="Variável"
        className={invalida ? 'bl-campo--erro' : undefined}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onMudarChave(e.target.value)}
      />
      <Campo
        value={valor}
        placeholder="Valor"
        aria-label="Valor"
        onChange={(e: ChangeEvent<HTMLInputElement>) => onMudarValor(e.target.value)}
      />
      <button
        type="button"
        className="iconbtn"
        title="Remover"
        aria-label="Remover linha"
        onClick={onRemover}
      >
        <IconePortal nome="lixeira" tamanho={16} />
      </button>
    </div>
  );
}
