import { useEffect, useMemo, useState } from 'react';
import { Botao, Campo, Etiqueta, Seletor } from '@pipe/ui';
import { createTemplateInChannel } from '../../lib/channels-gravar';

/**
 * Deliberately duplicates the catalogs from `lib/comunicacao.ts` instead of importing them — a historical note for this file. Still holds: it's a few lines, and the client screen doesn't need to drag in the server module even though it's pure today. The CATEGORY here only has Utilidade/Marketing — `montarModelo` (`apps/api/src/dominio/whatsapp/modelos.ts`) refuses Autenticação at creation time ("has its own components, isn't free text"); it only appears after being SYNCED from Meta, in the list above this form.
 */
const CATEGORIAS = ['utilidade', 'marketing'] as const;
const ROTULO_CATEGORIA: Record<(typeof CATEGORIAS)[number], string> = {
  utilidade: 'Utilidade',
  marketing: 'Marketing',
};

/**
 * Header at CREATION only has text or none — media requires a sample file (Resumable Upload API) that this form doesn't collect yet (ponytail already logged in `modelos.ts`: "create with text header only or no header"). Media header still appears in the LIST of synced templates — it just isn't an option here.
 */
const CABECALHOS = ['nenhum', 'texto'] as const;
type Cabecalho = (typeof CABECALHOS)[number];
const ROTULO_CABECALHO: Record<Cabecalho, string> = { nenhum: 'Sem cabeçalho', texto: 'Texto' };

const CABECALHO_TEXTO_MAX = 60;
const CORPO_MAX = 1024;

/** The body variables, in the order they appear — same rule as `variaveisDoTexto` in the `api`. */
function textVariables(texto: string): string[] {
  const vistas: string[] = [];
  for (const achado of texto.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
    if (!vistas.includes(achado[1]!)) vistas.push(achado[1]!);
  }
  return vistas;
}

const rotulo = { display: 'flex', flexDirection: 'column' as const, gap: '4px' };
const column = { display: 'flex', flexDirection: 'column' as const, gap: 'var(--p-e-3)' };

export function FormularioTemplate({ channels }: { channels: { id: string; nome: string }[] }) {
  const [channelId, setChannelId] = useState('');
  const [nome, setNome] = useState('');
  const [idioma, setIdioma] = useState('pt_BR');
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS)[number] | ''>('');
  const [cabecalhoTipo, setCabecalhoTipo] = useState<Cabecalho>('nenhum');
  const [cabecalho, setCabecalho] = useState('');
  const [exemploDoCabecalho, setExemploDoCabecalho] = useState('');
  const [corpo, setCorpo] = useState('');
  const [rodape, setRodape] = useState('');
  const [exemplos, setExemplos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const variables = useMemo(() => textVariables(corpo), [corpo]);
  const headerVariables = useMemo(() => textVariables(cabecalho), [cabecalho]);

  function limpar() {
    setNome('');
    setIdioma('pt_BR');
    setCategoria('');
    setCabecalhoTipo('nenhum');
    setCabecalho('');
    setExemploDoCabecalho('');
    setCorpo('');
    setRodape('');
    setExemplos({});
  }

  async function enviar() {
    setError(null);
    if (!channelId) return setError('Escolha o canal.');
    if (!categoria) return setError('Escolha a categoria.');
    if (headerVariables.length > 1) return setError('O cabeçalho aceita no máximo uma variável.');
    const listaDeExemplos = variables.map((v) => (exemplos[v] ?? '').trim());
    if (listaDeExemplos.some((e) => !e)) {
      return setError('Dê um exemplo para cada variável do texto.');
    }
    setEnviando(true);
    const resultado = await createTemplateInChannel(channelId, {
      nome,
      idioma,
      categoria,
      corpo,
      ...(cabecalhoTipo === 'texto' && cabecalho ? { cabecalho } : {}),
      ...(cabecalhoTipo === 'texto' && headerVariables.length === 1 ? { exemploDoCabecalho } : {}),
      ...(rodape ? { rodape } : {}),
      exemplos: listaDeExemplos,
    });
    setEnviando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    limpar();
  }

  // Body changed: variable examples that disappeared no longer serve any purpose once stored.
  useEffect(() => {
    setExemplos((atual) => {
      const novo: Record<string, string> = {};
      for (const v of variables) if (atual[v] !== undefined) novo[v] = atual[v];
      return novo;
    });
  }, [variables]);

  return (
    <section className="card">
      <h3>Novo modelo de mensagem</h3>
      <p className="sub">
        Cria o modelo NA META (`POST .../modelos`) e manda para análise — diferente da lista acima,
        que só reflete o que já está lá. O texto que vale para o disparo é o aprovado por ela.
      </p>

      {channels.length === 0 ? (
        <Etiqueta tom="alerta">
          Nenhum canal WhatsApp ativo neste tenant. Cadastre o canal antes de cadastrar o modelo.
        </Etiqueta>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void enviar(); }} style={column}>
          <label style={rotulo}>
            <span className="sub">Canal</span>
            <Seletor value={channelId} onChange={(e) => setChannelId(e.target.value)} required disabled={enviando}>
              <option value="" disabled>
                Escolha o canal
              </option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Seletor>
          </label>

          <label style={rotulo}>
            <span className="sub">Nome (letras minúsculas, números e _; sem espaço nem acento)</span>
            <Campo
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="confirmacao_pedido"
              required
              disabled={enviando}
            />
          </label>

          <label style={rotulo}>
            <span className="sub">Idioma</span>
            <Campo value={idioma} onChange={(e) => setIdioma(e.target.value)} required disabled={enviando} />
          </label>

          <label style={rotulo}>
            <span className="sub">Categoria (é da Meta, muda o custo — não é campo livre)</span>
            <Seletor
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as (typeof CATEGORIAS)[number])}
              required
              disabled={enviando}
            >
              <option value="" disabled>
                Escolha a categoria
              </option>
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>
                  {ROTULO_CATEGORIA[c]}
                </option>
              ))}
            </Seletor>
          </label>

          <label style={rotulo}>
            <span className="sub">Cabeçalho</span>
            <Seletor
              value={cabecalhoTipo}
              onChange={(e) => setCabecalhoTipo(e.target.value as Cabecalho)}
              disabled={enviando}
            >
              {CABECALHOS.map((c) => (
                <option key={c} value={c}>
                  {ROTULO_CABECALHO[c]}
                </option>
              ))}
            </Seletor>
          </label>

          {cabecalhoTipo === 'texto' ? (
            <>
              <label style={rotulo}>
                <span className="sub">Texto do cabeçalho (até 1 variável)</span>
                <Campo
                  value={cabecalho}
                  onChange={(e) => setCabecalho(e.target.value)}
                  maxLength={CABECALHO_TEXTO_MAX}
                  disabled={enviando}
                />
                <span className="cw-contador">
                  {cabecalho.length}/{CABECALHO_TEXTO_MAX}
                </span>
              </label>
              {headerVariables.length === 1 ? (
                <label style={rotulo}>
                  <span className="sub">Exemplo da variável do cabeçalho</span>
                  <Campo
                    value={exemploDoCabecalho}
                    onChange={(e) => setExemploDoCabecalho(e.target.value)}
                    required
                    disabled={enviando}
                  />
                </label>
              ) : null}
            </>
          ) : null}

          <label style={rotulo}>
            <span className="sub">Corpo</span>
            <textarea
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              className="campo"
              rows={4}
              maxLength={CORPO_MAX}
              required
              disabled={enviando}
              placeholder={'Olá {{1}}, seu pedido {{2}} foi confirmado.'}
            />
            <span className="cw-contador">
              {corpo.length}/{CORPO_MAX}
            </span>
          </label>

          {variables.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--p-e-2)' }}>
              <span className="sub">Um exemplo por variável do corpo — a Meta exige para aprovar.</span>
              {variables.map((v) => (
                <label key={v} style={rotulo}>
                  <span className="sub">
                    Exemplo de <code>{`{{${v}}}`}</code>
                  </span>
                  <Campo
                    value={exemplos[v] ?? ''}
                    onChange={(e) => setExemplos((atual) => ({ ...atual, [v]: e.target.value }))}
                    required
                    disabled={enviando}
                  />
                </label>
              ))}
            </div>
          ) : null}

          <label style={rotulo}>
            <span className="sub">Rodapé (opcional)</span>
            <Campo
              value={rodape}
              onChange={(e) => setRodape(e.target.value)}
              maxLength={CABECALHO_TEXTO_MAX}
              disabled={enviando}
            />
          </label>

          {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}

          <div className="cl-actions">
            <Botao type="submit" variante="primario" disabled={enviando}>
              {enviando ? 'Salvando…' : 'Salvar modelo'}
            </Botao>
          </div>
        </form>
      )}
    </section>
  );
}
