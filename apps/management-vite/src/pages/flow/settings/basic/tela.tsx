import { useEffect, useRef, useState } from 'react';
import { IconePortal } from '../../../../components/icones-portal';
import { irPara } from '../../../../lib/navigation';
import { BotaoBds, PageHeader } from '../pecas';
import { deleteFlow, salvarBasicas } from './gravar';
import './basicas.css';

/**
 * `/configurations/basic` ("Editar Fluxo"), measured in the runnable copy (`docs/capturas/regua.md`, `/application/detail/pipeprincipal/configurations/basic`, DOM read with Playwright — `referencias-blip/portal/configurations-basic` only has the SPA shell, with no rendered content, so it wasn't a usable source):
 *
 *   h1 "Editar Fluxo" (no subtitle — the source doesn't have one here either)
 *   ── divider (CabecalhoDaPagina already draws it) ──
 *   h2 "Informações básicas"
 *   "Nome do fluxo" field — required, 2-30 characters, counter (what's MISSING: `30 - valor.length`, not what's already typed)
 *   "Descrição" field — optional, 2-160 when filled, same counter
 *   "Imagem do avatar (Opcional)" field — drag/click area with preview and remove button
 *   "Salvar" (top right) — `ng-disabled="$ctrl.applicationForm.$invalid || $ctrl.channelForm.$pristine"`: disabled while nothing changed or while the form is invalid
 *   "Clique aqui para acessar as configurações avançadas" + "Excluir fluxo" (same line, opposite ends) — the button is `ng-disabled="!$ctrl.canDeleteBot"`
 *
 * "Nome do fluxo" and "Descrição" do NOT use `<CampoBds>` (the bordered box from `pecas.tsx`): in the real DOM this screen is the only one in Settings that still uses `<material-input>` (AngularJS), not `<bds-input>` — `apikey`, `keys`, `boasvindas` and `menu-persistente` are all `bds-input` (checked in each one's DOM). `material-input` is a LINE field: label that rises above when filled (otherwise it's a placeholder), underline across the full width and the `<span counter-for>` at the right edge of the same line — hence `CampoDeLinha`, only here.
 *
 * The writes: "Salvar" is `PATCH /v1/gestao/fluxos/:id` and "Excluir fluxo" is `DELETE /v1/gestao/fluxos/:id`, after the confirmation modal (`openDeleteApplicationModal()` → `deleteChatBotModal*` from the pt-BR package: title "Quer mesmo excluir <shortName>?", the body, the "Estou ciente…" box that unlocks the button, "Voltar" and the delete button). The phrasing is the package's; "chatbot" becomes "fluxo", as the screen's own button already does (`deleteChatbot: "Excluir fluxo"`). Their body says "de forma permanente" (permanently); here deletion archives (see `ciclo-de-vida-do-fluxo.ts` in the `api`), and the phrase doesn't promise what it doesn't do.
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

/** The name's `ng-minlength="2"` / `ng-maxlength="30"`; `2` / `160` for the description. */
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

export function SettingsBasicScreen({
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
  /** Their `canDeleteBot`: only whoever has `automacao.fluxo.excluir`. */
  podeExcluir: boolean;
}) {
  const [nomeEditado, setNomeEditado] = useState(nome);
  const [description, setDescription] = useState(descriptionInitial);
  /*
   * What the preview shows (the saved URL or the chosen file's) and the file itself — `undefined` means "the photo hasn't been touched".
   */
  const [image, setImage] = useState(imageUrl);
  const [file, setFile] = useState<File | null | undefined>(undefined);
  const [aviso, setAviso] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [ciente, setCiente] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* The preview's object URL is released when it changes or when the screen unmounts. */
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
    /*
     * What came back is what got saved: the name sanitized by the `api`, the photo as `data:`. From here on, this is the new "no change" baseline.
     */
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
    const resultado = await deleteFlow(id);
    setRemovendo(false);
    if (!resultado.ok) {
      setAviso(resultado.error);
      return;
    }
    /* There, after deleting, `$state.go` goes to the chatbot list. Here, the portal. */
    irPara('/portal', { substituir: true });
  }

  return (
    <>
      <PageHeader titulo={<h1>Editar Fluxo</h1>} />
      <div className="cf-container cf-basicas">
        <h2 className="cf-basic-section">Informações básicas</h2>
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

          <div className="cf-mt4 cf-basic-image">
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
                      /*
                       * Removing the saved photo is `imagem: null`; undoing the choice of a new file is just going back to what it was.
                       */
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
          {/* Their `deleteChatbotPermissionDenied` in the disabled button's title. */}
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
          className="cf-overlay"
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
            <footer className="cf-modal-actions">
              <BotaoBds variante="secondary" onClick={() => setExcluindo(false)}>
                Voltar
              </BotaoBds>
              {/* Their `deleteChatBotModalToolTip` while the checkbox isn't checked. */}
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
