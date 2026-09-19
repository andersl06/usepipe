import { useEffect, useMemo, useState } from 'react';
import { Botao, Campo, Etiqueta, Seletor } from '@pipe/ui';
import { criarModeloNoCanal } from '../../lib/canais-gravar';

/**
 * Duplica, de propósito, os catálogos de `lib/comunicacao.ts` em vez de
 * importar de lá — comentário histórico deste arquivo. Continua valendo: são
 * poucas linhas, e a tela de cliente não precisa arrastar o módulo do servidor
 * mesmo que ele hoje esteja puro.
 *
 * A CATEGORIA aqui só tem Utilidade/Marketing — `montarModelo`
 * (`apps/api/src/dominio/whatsapp/modelos.ts`) recusa Autenticação na
 * criação ("tem componentes próprios, não é texto livre"); ela só aparece
 * depois de SINCRONIZADA da Meta, na lista acima deste formulário.
 */
const CATEGORIAS = ['utilidade', 'marketing'] as const;
const ROTULO_CATEGORIA: Record<(typeof CATEGORIAS)[number], string> = {
  utilidade: 'Utilidade',
  marketing: 'Marketing',
};

/**
 * Cabeçalho na CRIAÇÃO só tem texto ou nenhum — mídia pede um arquivo de
 * exemplo (Resumable Upload API) que este formulário não coleta ainda
 * (ponytail já registrado em `modelos.ts`: "criar só com cabeçalho de texto
 * ou sem cabeçalho"). Cabeçalho de mídia continua aparecendo na LISTA de
 * modelos sincronizados — só não é uma opção aqui.
 */
const CABECALHOS = ['nenhum', 'texto'] as const;
type Cabecalho = (typeof CABECALHOS)[number];
const ROTULO_CABECALHO: Record<Cabecalho, string> = { nenhum: 'Sem cabeçalho', texto: 'Texto' };

const CABECALHO_TEXTO_MAX = 60;
const CORPO_MAX = 1024;

/** As variáveis do corpo, na ordem em que aparecem — mesma regra de `variaveisDoTexto` na `api`. */
function variaveisDoTexto(texto: string): string[] {
  const vistas: string[] = [];
  for (const achado of texto.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
    if (!vistas.includes(achado[1]!)) vistas.push(achado[1]!);
  }
  return vistas;
}

const rotulo = { display: 'flex', flexDirection: 'column' as const, gap: '4px' };
const coluna = { display: 'flex', flexDirection: 'column' as const, gap: 'var(--p-e-3)' };

export function FormularioModelo({ canais }: { canais: { id: string; nome: string }[] }) {
  const [canalId, setCanalId] = useState('');
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
  const [erro, setErro] = useState<string | null>(null);

  const variaveis = useMemo(() => variaveisDoTexto(corpo), [corpo]);
  const variaveisDoCabecalho = useMemo(() => variaveisDoTexto(cabecalho), [cabecalho]);

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
    setErro(null);
    if (!canalId) return setErro('Escolha o canal.');
    if (!categoria) return setErro('Escolha a categoria.');
    if (variaveisDoCabecalho.length > 1) return setErro('O cabeçalho aceita no máximo uma variável.');
    const listaDeExemplos = variaveis.map((v) => (exemplos[v] ?? '').trim());
    if (listaDeExemplos.some((e) => !e)) {
      return setErro('Dê um exemplo para cada variável do texto.');
    }
    setEnviando(true);
    const resultado = await criarModeloNoCanal(canalId, {
      nome,
      idioma,
      categoria,
      corpo,
      ...(cabecalhoTipo === 'texto' && cabecalho ? { cabecalho } : {}),
      ...(cabecalhoTipo === 'texto' && variaveisDoCabecalho.length === 1 ? { exemploDoCabecalho } : {}),
      ...(rodape ? { rodape } : {}),
      exemplos: listaDeExemplos,
    });
    setEnviando(false);
    if (!resultado.ok) {
      setErro(resultado.erro);
      return;
    }
    limpar();
  }

  // Corpo mudou: exemplos de variável que sumiram não servem mais de nada guardados.
  useEffect(() => {
    setExemplos((atual) => {
      const novo: Record<string, string> = {};
      for (const v of variaveis) if (atual[v] !== undefined) novo[v] = atual[v];
      return novo;
    });
  }, [variaveis]);

  return (
    <section className="card">
      <h3>Novo modelo de mensagem</h3>
      <p className="sub">
        Cria o modelo NA META (`POST .../modelos`) e manda para análise — diferente da lista acima,
        que só reflete o que já está lá. O texto que vale para o disparo é o aprovado por ela.
      </p>

      {canais.length === 0 ? (
        <Etiqueta tom="alerta">
          Nenhum canal WhatsApp ativo neste tenant. Cadastre o canal antes de cadastrar o modelo.
        </Etiqueta>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void enviar(); }} style={coluna}>
          <label style={rotulo}>
            <span className="sub">Canal</span>
            <Seletor value={canalId} onChange={(e) => setCanalId(e.target.value)} required disabled={enviando}>
              <option value="" disabled>
                Escolha o canal
              </option>
              {canais.map((c) => (
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
              {variaveisDoCabecalho.length === 1 ? (
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

          {variaveis.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--p-e-2)' }}>
              <span className="sub">Um exemplo por variável do corpo — a Meta exige para aprovar.</span>
              {variaveis.map((v) => (
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

          {erro ? <Etiqueta tom="erro">{erro}</Etiqueta> : null}

          <div className="cl-acoes">
            <Botao type="submit" variante="primario" disabled={enviando}>
              {enviando ? 'Salvando…' : 'Salvar modelo'}
            </Botao>
          </div>
        </form>
      )}
    </section>
  );
}
