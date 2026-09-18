import { useRef, useState } from 'react';
import { IconePortal } from '../../../../componentes/icones-portal';
import { BotaoBds, CabecalhoDaPagina } from '../pecas';
import './basicas.css';

/**
 * `/configurations/basic` ("Editar Fluxo"), medida na cópia rodável
 * (`docs/capturas/regua.md`, `/application/detail/pipeprincipal/configurations/basic`,
 * DOM lido com Playwright — `docs/capturas/blip/telas/configurations-basic` só
 * tem a casca do SPA, sem conteúdo renderizado, então não serviu de fonte):
 *
 *   h1 "Editar Fluxo" (sem subtítulo — a origem também não tem um aqui)
 *   ── divisória (CabecalhoDaPagina já desenha) ──
 *   h2 "Informações básicas"
 *   campo "Nome do fluxo" — obrigatório, 2-30 caracteres, contador (o que
 *     FALTA: `30 - valor.length`, não o que já foi digitado)
 *   campo "Descrição" — opcional, até 160, mesmo contador
 *   campo "Imagem do avatar (Opcional)" — área de arraste/clique com prévia
 *     e botão de remover
 *   "Salvar" (canto direito)
 *   "Clique aqui para acessar as configurações avançadas" + "Excluir fluxo"
 *     (mesma linha, extremos opostos)
 *
 * "Nome do fluxo" e "Descrição" NÃO usam `<CampoBds>` (a caixa com borda de
 * `pecas.tsx`): no DOM real esta tela é a única de Configurações que ainda
 * usa `<material-input>` (AngularJS), não `<bds-input>` — `apikey`, `keys`,
 * `boasvindas` e `menu-persistente` são todas `bds-input` (conferido nos
 * DOMs de cada uma). O `material-input` é um campo de LINHA: rótulo que sobe
 * para cima quando preenchido (senão fica como placeholder), sublinhado sob
 * toda a largura e o `<span counter-for>` na ponta direita da mesma linha —
 * daí `CampoDeLinha`, só aqui.
 *
 * ponytail: NADA disto grava. `fluxo` (schema) não tem coluna `descricao` —
 * não dá pra inventar contrato pra um campo que o banco não tem — e não há
 * endpoint de escrita pra nome/imagem (`GET /v1/gestao/fluxos/:id` é
 * leitura). "Salvar" e "Excluir fluxo" devolvem o aviso controlado, como em
 * `api/tela.tsx` e `keys/tela.tsx`. Quando existir:
 *   - `PATCH /v1/gestao/fluxos/:id` (nome, imagemUrl)
 *   - migração acrescentando `fluxo.descricao`
 *   - `DELETE /v1/gestao/fluxos/:id` (ou equivalente de arquivar)
 */
function CampoDeLinha({
  id,
  rotulo,
  valor,
  aoMudar,
  maxLength,
  obrigatorio,
  linhas,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  maxLength: number;
  obrigatorio?: boolean;
  linhas?: number;
}) {
  const preenchido = valor.length > 0;
  return (
    <div className="cf-basicas-linha">
      {preenchido ? (
        <label htmlFor={id} className="cf-basicas-linha-rotulo">
          {rotulo}
        </label>
      ) : null}
      <div className="cf-basicas-linha-corpo">
        {linhas ? (
          <textarea
            id={id}
            value={valor}
            onChange={(evento) => aoMudar(evento.target.value)}
            placeholder={preenchido ? undefined : rotulo}
            required={obrigatorio}
            maxLength={maxLength}
            rows={linhas}
          />
        ) : (
          <input
            id={id}
            type="text"
            value={valor}
            onChange={(evento) => aoMudar(evento.target.value)}
            placeholder={preenchido ? undefined : rotulo}
            required={obrigatorio}
            maxLength={maxLength}
            autoComplete="off"
          />
        )}
        <span className="cf-basicas-linha-contador">{maxLength - valor.length}</span>
      </div>
    </div>
  );
}
export function TelaDeConfiguracoesBasicas({
  nome,
  imagemUrl,
}: {
  nome: string;
  imagemUrl: string | null;
}) {
  const [nomeEditado, setNomeEditado] = useState(nome);
  const [descricao, setDescricao] = useState('');
  const [imagem, setImagem] = useState(imagemUrl);
  const [aviso, setAviso] = useState('');
  const arquivoRef = useRef<HTMLInputElement>(null);

  function indisponivel(mensagem: string) {
    setAviso(mensagem);
  }

  return (
    <>
      <CabecalhoDaPagina titulo={<h1>Editar Fluxo</h1>} />
      <div className="cf-container cf-basicas">
        <h2 className="cf-basicas-secao">Informações básicas</h2>
        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            indisponivel('Salvar as configurações básicas ainda não está disponível.');
          }}
        >
          <CampoDeLinha
            id="nomeDoFluxo"
            rotulo="Nome do fluxo"
            valor={nomeEditado}
            aoMudar={setNomeEditado}
            maxLength={30}
            obrigatorio
          />
          <CampoDeLinha
            id="descricaoDoFluxo"
            rotulo="Descrição"
            valor={descricao}
            aoMudar={setDescricao}
            maxLength={160}
            linhas={1}
          />

          <div className="cf-mt4 cf-basicas-imagem">
            <span className="cf-campo-rotulo">
              Imagem do avatar <small className="cf-basicas-opcional">(Opcional)</small>
            </span>
            <div className="cf-basicas-solta">
              {imagem ? (
                <>
                  <img src={imagem} alt="" className="cf-basicas-previa" />
                  <button
                    type="button"
                    className="cf-basicas-remover"
                    aria-label="Remover imagem"
                    onClick={() => setImagem(null)}
                  >
                    <IconePortal nome="fechar" tamanho={16} />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="cf-basicas-anexar"
                  onClick={() => arquivoRef.current?.click()}
                >
                  <IconePortal nome="anexo" tamanho={24} />
                  <span>Clique para escolher uma imagem</span>
                </button>
              )}
              <input
                ref={arquivoRef}
                type="file"
                accept=".gif,.png,.jpeg,.jpg"
                hidden
                onChange={(evento) => {
                  const arquivo = evento.target.files?.[0];
                  if (!arquivo) return;
                  setImagem(URL.createObjectURL(arquivo));
                }}
              />
            </div>
          </div>

          {aviso ? (
            <p className="cf-aviso" role="alert">
              {aviso}
            </p>
          ) : null}

          <div className="cf-form-http-rodape">
            <BotaoBds variante="bot" type="submit">
              Salvar
            </BotaoBds>
          </div>
        </form>

        <div className="cf-basicas-rodape">
          <p>
            Clique{' '}
            <button
              type="button"
              className="cf-basicas-link"
              onClick={() =>
                indisponivel('As configurações avançadas ainda não estão disponíveis.')
              }
            >
              aqui
            </button>{' '}
            para acessar as configurações avançadas
          </p>
          <BotaoBds
            variante="perigo"
            onClick={() => indisponivel('A exclusão de fluxo ainda não está disponível.')}
          >
            Excluir fluxo
          </BotaoBds>
        </div>
      </div>
    </>
  );
}
