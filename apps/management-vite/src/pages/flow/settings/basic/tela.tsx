import { useEffect, useRef, useState } from 'react';
import { IconePortal } from '../../../../components/icones-portal';
import { irPara } from '../../../../lib/navigation';
import { BotaoBds, PageHeader } from '../pecas';
import { excluirFlow, salvarBasicas } from './gravar';
import './basicas.css';

/**
 * `/configurations/basic` ("Editar Fluxo"), medida na cópia rodável
 * (`docs/capturas/regua.md`, `/application/detail/pipeprincipal/configurations/basic`,
 * DOM lido com Playwright — `referencias-blip/portal/configurations-basic` só
 * tem a casca do SPA, sem conteúdo renderizado, então não serviu de fonte):
 *
 *   h1 "Editar Fluxo" (sem subtítulo — a origem também não tem um aqui)
 *   ── divisória (CabecalhoDaPagina já desenha) ──
 *   h2 "Informações básicas"
 *   campo "Nome do fluxo" — obrigatório, 2-30 caracteres, contador (o que
 *     FALTA: `30 - valor.length`, não o que já foi digitado)
 *   campo "Descrição" — opcional, 2-160 quando preenchida, mesmo contador
 *   campo "Imagem do avatar (Opcional)" — área de arraste/clique com prévia
 *     e botão de remover
 *   "Salvar" (canto direito) — `ng-disabled="$ctrl.applicationForm.$invalid
 *     || $ctrl.channelForm.$pristine"`: desligado enquanto nada mudou ou
 *     enquanto o formulário está inválido
 *   "Clique aqui para acessar as configurações avançadas" + "Excluir fluxo"
 *     (mesma linha, extremos opostos) — o botão é `ng-disabled="!$ctrl.canDeleteBot"`
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
 * As escritas: "Salvar" é `PATCH /v1/gestao/fluxos/:id` e "Excluir fluxo" é
 * `DELETE /v1/gestao/fluxos/:id`, depois do modal de confirmação
 * (`openDeleteApplicationModal()` → `deleteChatBotModal*` do pacote pt-BR:
 * título "Quer mesmo excluir <shortName>?", o corpo, a caixa "Estou ciente…"
 * que destrava o botão, "Voltar" e o botão de excluir). As frases são as do
 * pacote; "chatbot" vira "fluxo", como o próprio botão da tela já faz
 * (`deleteChatbot: "Excluir fluxo"`). O corpo deles diz "de forma
 * permanente"; aqui a exclusão arquiva (ver `ciclo-de-vida-do-fluxo.ts` na
 * `api`), e a frase não promete o que não faz.
 */
function CampoDeLinha({
  id,
  rotulo,
  value,
  aoMudar,
  maxLength,
  minLength,
  obrigatorio,
  linhas,
}: {
  id: string;
  rotulo: string;
  value: string;
  aoMudar: (value: string) => void;
  maxLength: number;
  minLength?: number;
  obrigatorio?: boolean;
  linhas?: number;
}) {
  const preenchido = value.length > 0;
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
            value={value}
            onChange={(evento) => aoMudar(evento.target.value)}
            placeholder={preenchido ? undefined : rotulo}
            required={obrigatorio}
            minLength={minLength}
            maxLength={maxLength}
            rows={linhas}
          />
        ) : (
          <input
            id={id}
            type="text"
            value={value}
            onChange={(evento) => aoMudar(evento.target.value)}
            placeholder={preenchido ? undefined : rotulo}
            required={obrigatorio}
            minLength={minLength}
            maxLength={maxLength}
            autoComplete="off"
          />
        )}
        <span className="cf-basicas-linha-contador">{maxLength - value.length}</span>
      </div>
    </div>
  );
}

/** `ng-minlength="2"` / `ng-maxlength="30"` do nome; `2` / `160` da descrição. */
const NOME = { min: 2, max: 30 } as const;
const DESCRIPTION = { min: 2, max: 160 } as const;

/** O `$ctrl.applicationForm.$invalid` deles, com os mesmos atributos. */
function formularioInvalido(nome: string, description: string): boolean {
  const n = nome.trim().length;
  const d = description.trim().length;
  if (n < NOME.min || n > NOME.max) return true;
  if (d > 0 && (d < DESCRIPTION.min || d > DESCRIPTION.max)) return true;
  return false;
}

export function SettingsBasicTela({
  id,
  nome,
  description: descriptionInitial,
  imageUrl,
  shortName,
  podeExcluir,
}: {
  id: string;
  nome: string;
  description: string;
  imageUrl: string | null;
  shortName: string | null;
  /** `canDeleteBot` deles: só quem tem `automacao.fluxo.excluir`. */
  podeExcluir: boolean;
}) {
  const [nomeEditado, setNomeEditado] = useState(nome);
  const [description, setDescription] = useState(descriptionInitial);
  /* O que a prévia mostra (a URL gravada ou a do arquivo escolhido) e o
     arquivo em si — `undefined` é "a foto não foi mexida". */
  const [image, setImage] = useState(imageUrl);
  const [file, setFile] = useState<File | null | undefined>(undefined);
  const [aviso, setAviso] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [ciente, setCiente] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* A URL de objeto da prévia é liberada quando troca ou quando a tela sai. */
  useEffect(() => {
    if (!image?.startsWith('blob:')) return;
    return () => URL.revokeObjectURL(image);
  }, [image]);

  const mudou =
    nomeEditado !== nome || description !== descriptionInitial || file !== undefined;
  const invalido = formularioInvalido(nomeEditado, description);

  function indisponivel(message: string) {
    setSucesso('');
    setAviso(message);
  }

  async function salvar() {
    setAviso('');
    setSucesso('');
    setSalvando(true);
    const resultado = await salvarBasicas(id, {
      nome: nomeEditado,
      description,
      image: file,
    });
    setSalvando(false);
    if (!resultado.ok) {
      setAviso(resultado.error);
      return;
    }
    /* O que voltou é o que ficou gravado: o nome saneado pela `api`, a foto
       como `data:`. A partir daqui é o novo "sem mudança". */
    setNomeEditado(resultado.value.nome);
    setDescription(resultado.value.description ?? '');
    setImage(resultado.value.imageUrl);
    setFile(undefined);
    /* `saveSuccessText` deles. */
    setSucesso('Configuração salva com sucesso.');
  }

  async function excluir() {
    setAviso('');
    setRemovendo(true);
    const resultado = await excluirFlow(id);
    setRemovendo(false);
    if (!resultado.ok) {
      setAviso(resultado.error);
      return;
    }
    /* Lá, depois de excluir, `$state.go` para a lista de chatbots. Aqui, o portal. */
    irPara('/portal', { substituir: true });
  }

  return (
    <>
      <PageHeader titulo={<h1>Editar Fluxo</h1>} />
      <div className="cf-container cf-basicas">
        <h2 className="cf-basicas-secao">Informações básicas</h2>
        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            if (salvando || invalido || !mudou) return;
            void salvar();
          }}
        >
          <CampoDeLinha
            id="nomeDoFluxo"
            rotulo="Nome do fluxo"
            value={nomeEditado}
            aoMudar={setNomeEditado}
            minLength={NOME.min}
            maxLength={NOME.max}
            obrigatorio
          />
          <CampoDeLinha
            id="descricaoDoFluxo"
            rotulo="Descrição"
            value={description}
            aoMudar={setDescription}
            minLength={DESCRIPTION.min}
            maxLength={DESCRIPTION.max}
            linhas={1}
          />

          <div className="cf-mt4 cf-basicas-imagem">
            <span className="cf-campo-rotulo">
              Imagem do avatar <small className="cf-basicas-opcional">(Opcional)</small>
            </span>
            <div className="cf-basicas-solta">
              {image ? (
                <>
                  <img src={image} alt="" className="cf-basicas-previa" />
                  <button
                    type="button"
                    className="cf-basicas-remover"
                    aria-label="Remover imagem"
                    onClick={() => {
                      setImage(null);
                      /* Tirar a foto gravada é `imagem: null`; desfazer a
                         escolha de um arquivo novo é só voltar ao que estava. */
                      setFile(imageUrl ? null : undefined);
                      if (fileRef.current) fileRef.current.value = '';
                    }}
                  >
                    <IconePortal nome="fechar" tamanho={16} />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="cf-basicas-anexar"
                  onClick={() => fileRef.current?.click()}
                >
                  <IconePortal nome="anexo" tamanho={24} />
                  <span>Clique para escolher uma imagem</span>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".gif,.png,.jpeg,.jpg"
                hidden
                onChange={(evento) => {
                  const escolhido = evento.target.files?.[0];
                  if (!escolhido) return;
                  setFile(escolhido);
                  setImage(URL.createObjectURL(escolhido));
                }}
              />
            </div>
          </div>

          {aviso ? (
            <p className="cf-aviso" role="alert">
              {aviso}
            </p>
          ) : null}
          {sucesso ? (
            <p className="cf-basicas-sucesso" role="status">
              {sucesso}
            </p>
          ) : null}

          <div className="cf-form-http-rodape">
            <BotaoBds variante="bot" type="submit" disabled={salvando || invalido || !mudou}>
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
          {/* `deleteChatbotPermissionDenied` no título do botão desligado. */}
          <BotaoBds
            variante="perigo"
            disabled={!podeExcluir}
            title={podeExcluir ? undefined : 'Somente um admin pode deletar o fluxo'}
            onClick={() => {
              setCiente(false);
              setExcluindo(true);
            }}
          >
            Excluir fluxo
          </BotaoBds>
        </div>
      </div>

      {excluindo ? (
        <div
          className="cf-sobreposicao"
          role="presentation"
          onMouseDown={(evento) => evento.target === evento.currentTarget && setExcluindo(false)}
        >
          <section
            className="cf-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cf-excluir-fluxo-titulo"
          >
            <h2 id="cf-excluir-fluxo-titulo">Quer mesmo excluir {shortName ?? nome}?</h2>
            <p>
              O fluxo será removido do Pipe e não estará mais disponível para clientes em nenhum
              canal. Essa ação não poderá ser desfeita.
            </p>
            <label className="cf-basicas-ciente">
              <input
                type="checkbox"
                checked={ciente}
                onChange={(evento) => setCiente(evento.target.checked)}
              />
              <span>
                Estou ciente de que sou responsável pela exclusão do fluxo e posso responder em
                casos de auditoria.
              </span>
            </label>
            {aviso ? (
              <p role="alert" className="cf-aviso">
                {aviso}
              </p>
            ) : null}
            <footer className="cf-modal-acoes">
              <BotaoBds variante="secondary" onClick={() => setExcluindo(false)}>
                Voltar
              </BotaoBds>
              {/* `deleteChatBotModalToolTip` enquanto a caixa não está marcada. */}
              <BotaoBds
                variante="perigo"
                disabled={!ciente || removendo}
                title={ciente ? undefined : 'Confirme o campo acima para continuar'}
                onClick={() => void excluir()}
              >
                Excluir fluxo
              </BotaoBds>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
