import { useActionState, useEffect, useRef, useState } from 'react';
import { Botao, BotaoDeIcone, Campo, Etiqueta, Seletor } from '@pipe/ui';
import { salvarModelo } from '../../lib/acoes';
import { envioQuePreserva } from '../../componentes/envio-de-formulario';

/**
 * Duplica, de propósito, os três catálogos e a conta de deslocamento de
 * `lib/comunicacao.ts` em vez de importar de lá: aquele arquivo puxa
 * `./banco`, que abre pool de Postgres — e isso não pode ir para o bundle do
 * cliente. São seis linhas; a alternativa era um terceiro arquivo só de
 * constante, e para três catálogos isto ainda é mais simples.
 */
const CATEGORIAS = ['utilidade', 'marketing', 'autenticacao'] as const;
const ROTULO_CATEGORIA: Record<(typeof CATEGORIAS)[number], string> = {
  utilidade: 'Utilidade',
  marketing: 'Marketing',
  autenticacao: 'Autenticação',
};

const CABECALHOS = ['nenhum', 'texto', 'imagem', 'video', 'documento'] as const;
type Cabecalho = (typeof CABECALHOS)[number];
const ROTULO_CABECALHO: Record<Cabecalho, string> = {
  nenhum: 'Sem cabeçalho',
  texto: 'Texto',
  imagem: 'Imagem',
  video: 'Vídeo',
  documento: 'Documento',
};

/** Só cabeçalho de mídia consome a posição 1 do disparo — mesma conta de `apps/workers/src/whatsapp/template.ts`. */
function temMidia(cabecalho: Cabecalho): boolean {
  return cabecalho === 'imagem' || cabecalho === 'video' || cabecalho === 'documento';
}

const rotulo = { display: 'flex', flexDirection: 'column' as const, gap: '4px' };
const coluna = { display: 'flex', flexDirection: 'column' as const, gap: 'var(--p-e-3)' };

export function FormularioModelo({ canais }: { canais: { id: string; nome: string }[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [resultado, enviar, enviando] = useActionState(salvarModelo, { ok: true });
  const [cabecalhoTipo, setCabecalhoTipo] = useState<Cabecalho>('nenhum');
  const [variaveis, setVariaveis] = useState<string[]>([]);

  useEffect(() => {
    if (resultado.ok) {
      formRef.current?.reset();
      setCabecalhoTipo('nenhum');
      setVariaveis([]);
    }
  }, [resultado]);

  const midia = temMidia(cabecalhoTipo);
  const deslocamento = midia ? 1 : 0;

  return (
    <section className="card">
      <h3>Novo modelo de mensagem</h3>
      <p className="sub">
        O texto do modelo vive na Meta, não aqui. O que este cadastro guarda é nome, idioma,
        categoria e o mapeamento de posição das variáveis — o corpo abaixo é cópia para consulta de
        quem for usar o modelo, não é o que decide o que sai no disparo.
      </p>

      {canais.length === 0 ? (
        <Etiqueta tom="alerta">
          Nenhum canal WhatsApp ativo neste tenant. Cadastre o canal antes de cadastrar o modelo.
        </Etiqueta>
      ) : (
        <form ref={formRef} onSubmit={envioQuePreserva(enviar)} style={coluna}>
          <input type="hidden" name="variaveis" value={JSON.stringify(variaveis)} />

          <label style={rotulo}>
            <span className="sub">Canal</span>
            <Seletor name="canalId" required disabled={enviando} defaultValue="">
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
            <span className="sub">Nome (o mesmo nome aprovado na Meta)</span>
            <Campo name="nome" placeholder="confirmacao_pedido" required disabled={enviando} />
          </label>

          <label style={rotulo}>
            <span className="sub">Idioma</span>
            <Campo name="idioma" defaultValue="pt_BR" required disabled={enviando} />
          </label>

          <label style={rotulo}>
            <span className="sub">Categoria (é da Meta, muda o custo — não é campo livre)</span>
            <Seletor name="categoria" required disabled={enviando} defaultValue="">
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
              name="cabecalhoTipo"
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

          {midia ? (
            <Etiqueta tom="alerta">
              Cabeçalho de {ROTULO_CABECALHO[cabecalhoTipo].toLowerCase()}: a mídia ocupa a posição
              1 do disparo, e TODA variável do corpo desliza +1 — é o erro que só aparece na hora do
              disparo em produção. A posição real de cada variável está anotada abaixo.
            </Etiqueta>
          ) : null}

          <label style={rotulo}>
            <span className="sub">
              Corpo (cópia para consulta — o texto que vale é o aprovado na Meta)
            </span>
            <textarea
              name="corpo"
              className="campo"
              rows={4}
              required
              disabled={enviando}
              placeholder={'Olá {{1}}, seu pedido {{2}} foi confirmado.'}
            />
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--p-e-2)' }}>
            <span className="sub">
              Variáveis do corpo, na ordem de <code>{'{{1}}'}</code>, <code>{'{{2}}'}</code>…
            </span>

            {variaveis.map((v, indice) => (
              <div
                key={indice}
                style={{ display: 'flex', gap: 'var(--p-e-2)', alignItems: 'center' }}
              >
                <Campo
                  value={v}
                  onChange={(e) =>
                    setVariaveis((atual) =>
                      atual.map((x, i) => (i === indice ? e.target.value : x)),
                    )
                  }
                  placeholder="contato.nome"
                  disabled={enviando}
                  style={{ flex: 1 }}
                />
                <Etiqueta titulo="Posição declarada no corpo do modelo">
                  {`corpo {{${indice + 1}}}`}
                </Etiqueta>
                <Etiqueta
                  tom={midia ? 'alerta' : 'neutro'}
                  titulo="Posição real de disparo, com o deslocamento do cabeçalho de mídia já somado"
                >
                  {`disparo ${indice + 1 + deslocamento}`}
                </Etiqueta>
                <BotaoDeIcone
                  nome="x"
                  rotulo="Remover variável"
                  disabled={enviando}
                  onClick={() => setVariaveis((atual) => atual.filter((_, i) => i !== indice))}
                />
              </div>
            ))}

            <Botao
              type="button"
              icone="mais"
              disabled={enviando}
              onClick={() => setVariaveis((atual) => [...atual, ''])}
            >
              Adicionar variável
            </Botao>
          </div>

          {resultado.erro ? <Etiqueta tom="erro">{resultado.erro}</Etiqueta> : null}

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
