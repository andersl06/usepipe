import { useId, useState, type FormEvent } from 'react';
import { Botao, Campo, Card, Etiqueta } from '@pipe/ui';
import { Select } from '@pipe/ui/select';
import { ChipsInput } from '@pipe/ui/chips-input';
import type { QueueRegistered } from '../../lib/registrations';
import { saveAutoClose, saveQueueTags } from '../../lib/registrations-gravar';
import {
  MENSAGEM_MAXIMA,
  configDoRascunho,
  erroDeTags,
  errosDoRascunho,
  rascunhoAlterado,
  rascunhoDe,
  tagsAlteradas,
  type AutoCloseRascunho,
  type UnidadeDeTempo,
} from '../../lib/queue-auto-close';
import { useContact } from '../flow/contact';

/** Mensagem de erro anunciada por leitores de tela assim que aparece. */
function Aviso({ children }: { children: string | null }) {
  return <div role="alert">{children ? <Etiqueta tom="erro">{children}</Etiqueta> : null}</div>;
}

/* ------------------------------------------------------------- tags da fila */

/** Campo de chips com o próprio "Salvar alterações", desabilitado enquanto nada mudou. */
export function SectionTags({ queue }: { queue: QueueRegistered }) {
  const { contact } = useContact();
  const [tags, setTags] = useState<string[]>(queue.tags);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const erroLocal = erroDeTags(tags);
  const alterado = tagsAlteradas(tags, queue.tags);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!alterado || erroLocal) return;
    setSalvando(true);
    setError(null);
    const resultado = await saveQueueTags(contact.id, queue.id, tags);
    setSalvando(false);
    if (!resultado.ok) setError(`Não foi possível salvar as tags: ${resultado.error}`);
  }

  return (
    <Card className="fila-cartao" titulo="Tags da fila">
      <p className="sub">Adicione ou edite as tags disponíveis para os atendentes desta fila.</p>
      <form className="fila-form" onSubmit={(e) => void salvar(e)}>
        <ChipsInput
          rotulo="Tags da fila"
          label="Tags da fila"
          placeholder="Insira as tags separando por vírgulas"
          values={tags}
          onChange={(proximas) => {
            setTags(proximas);
            setError(null);
          }}
        />
        <Aviso>{erroLocal ?? error}</Aviso>
        <div className="cl-actions">
          <Botao type="submit" variante="primario" disabled={!alterado || salvando || erroLocal !== null}>
            {salvando ? 'Salvando…' : 'Salvar alterações'}
          </Botao>
        </div>
      </form>
    </Card>
  );
}

/* ------------------------------------------------- encerramento automático */

const UNIDADES: { valor: UnidadeDeTempo; rotulo: string }[] = [
  { valor: 'minutos', rotulo: 'Minutos' },
  { valor: 'horas', rotulo: 'Horas' },
];

function Unidade({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: UnidadeDeTempo;
  onChange: (v: UnidadeDeTempo) => void;
  disabled: boolean;
}) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value as UnidadeDeTempo)} disabled={disabled}>
      {UNIDADES.map((u) => (
        <option key={u.valor} value={u.valor}>
          {u.rotulo}
        </option>
      ))}
    </Select>
  );
}

function Interruptor({
  ligado,
  rotulo,
  onAlternar,
  alto,
  disabled,
}: {
  ligado: boolean;
  rotulo: string;
  onAlternar: () => void;
  alto?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={alto ? 'interruptor interruptor-alto' : 'interruptor'}
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={disabled}
      onClick={onAlternar}
    >
      <span className="interruptor-bolinha" />
    </button>
  );
}

/**
 * O interruptor do cabeçalho grava na hora, com a configuração já gravada (ou os valores padrão na primeira vez); se falhar, volta ao estado anterior e mostra o motivo. O restante do formulário só grava no "Salvar".
 */
export function SectionAutoClose({ queue }: { queue: QueueRegistered }) {
  const { contact } = useContact();
  const base = useId();
  const titulo = 'Encerramento automático de tickets';
  const [rascunho, setRascunho] = useState<AutoCloseRascunho>(() => rascunhoDe(queue.autoClose));
  const [otimista, setOtimista] = useState<boolean | null>(null);
  const [alternando, setAlternando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [errorSwitch, setErrorSwitch] = useState<string | null>(null);
  const [errorSalvar, setErrorSalvar] = useState<string | null>(null);

  const ativo = otimista ?? queue.autoClose?.ativo ?? false;
  const erros = errosDoRascunho(rascunho);
  const valido = Object.keys(erros).length === 0;
  const alterado = rascunhoAlterado(rascunho, queue.autoClose);
  const ocupado = alternando || salvando;

  function mudar(parte: Partial<AutoCloseRascunho>) {
    setRascunho((r) => ({ ...r, ...parte }));
    setErrorSalvar(null);
  }

  async function alternar() {
    const proximo = !ativo;
    setAlternando(true);
    setOtimista(proximo);
    setErrorSwitch(null);
    const resultado = await saveAutoClose(
      contact.id,
      queue.id,
      configDoRascunho(rascunhoDe(queue.autoClose), proximo),
    );
    setAlternando(false);
    setOtimista(null);
    if (!resultado.ok) setErrorSwitch(`Ocorreu um erro ao alterar os dados. ${resultado.error}`);
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!valido || !alterado) return;
    setSalvando(true);
    setErrorSalvar(null);
    const resultado = await saveAutoClose(contact.id, queue.id, configDoRascunho(rascunho, true));
    setSalvando(false);
    if (!resultado.ok) setErrorSalvar(`Não foi possível salvar: ${resultado.error}`);
  }

  return (
    <Card
      className="fila-cartao"
      titulo={titulo}
      actions={<Interruptor alto ligado={ativo} rotulo={titulo} onAlternar={() => void alternar()} disabled={alternando} />}
    >
      <p className="sub">Encerre automaticamente os tickets por inatividade</p>
      <Aviso>{errorSwitch}</Aviso>
      {ativo ? (
        <form className="fila-form" onSubmit={(e) => void salvar(e)} noValidate>
          <h4>Regras de encerramento</h4>
          <p className="note">Defina as regras para encerrar automaticamente os tickets inativos.</p>
          <p className="sub">Encerrar ticket quando o tempo de inatividade do cliente for maior que:</p>
          <div className="fila-encerramento-tempo">
            <div className="form-campo">
              <label className="sub" htmlFor={`${base}-tempo`}>
                Tempo de inatividade
              </label>
              <Campo
                id={`${base}-tempo`}
                inputMode="numeric"
                value={rascunho.tempo}
                onChange={(e) => mudar({ tempo: e.target.value })}
                aria-invalid={erros.tempo ? true : undefined}
                aria-describedby={`${base}-tempo-ajuda`}
                disabled={ocupado}
              />
              <small id={`${base}-tempo-ajuda`} className={erros.tempo ? 'campo-erro' : 'note'}>
                {erros.tempo ?? 'O tempo deve ser um valor maior que 0.'}
              </small>
            </div>
            <div className="form-campo fila-encerramento-unidade">
              <label className="sub" htmlFor={`${base}-unidade`}>
                Unidade
              </label>
              <Unidade id={`${base}-unidade`} value={rascunho.unidade} onChange={(unidade) => mudar({ unidade })} disabled={ocupado} />
            </div>
          </div>

          <label className="form-caixa">
            <input
              type="checkbox"
              checked={rascunho.soSePrimeiroAtendimento}
              onChange={(e) => mudar({ soSePrimeiroAtendimento: e.target.checked })}
              disabled={ocupado}
            />
            <span>Encerrar ticket apenas se o primeiro atendimento já tiver ocorrido</span>
          </label>
          <label className="form-caixa">
            <input
              type="checkbox"
              checked={rascunho.naoSeAguardandoAtendente}
              onChange={(e) => mudar({ naoSeAguardandoAtendente: e.target.checked })}
              disabled={ocupado}
            />
            <span>Não encerrar se cliente estiver aguardando resposta do atendente</span>
          </label>
          <label className="form-caixa">
            <input
              type="checkbox"
              checked={rascunho.removerDaTela}
              onChange={(e) => mudar({ removerDaTela: e.target.checked })}
              disabled={ocupado}
            />
            <span>Remover automaticamente o ticket da tela quando ele for encerrado</span>
          </label>

          <section className="fila-subcartao">
            <div className="fila-subcartao-cab">
              <h4>Enviar alerta de inatividade para o cliente</h4>
              <Interruptor
                ligado={rascunho.alertaAtivo}
                rotulo="Enviar alerta de inatividade para o cliente"
                onAlternar={() => mudar({ alertaAtivo: !rascunho.alertaAtivo })}
                disabled={ocupado}
              />
            </div>
            {rascunho.alertaAtivo ? (
              <>
                <p className="note">Crie uma mensagem para alertar o cliente antes do encerramento automático do ticket</p>
                <div className="form-campo">
                  <label className="sub" htmlFor={`${base}-msg`}>
                    Mensagem
                  </label>
                  <Campo
                    id={`${base}-msg`}
                    value={rascunho.alertaMensagem}
                    maxLength={MENSAGEM_MAXIMA}
                    placeholder="Adicione sua mensagem aqui"
                    onChange={(e) => mudar({ alertaMensagem: e.target.value })}
                    aria-invalid={erros.alertaMensagem ? true : undefined}
                    aria-describedby={erros.alertaMensagem ? `${base}-msg-erro` : undefined}
                    disabled={ocupado}
                  />
                  {erros.alertaMensagem ? (
                    <small id={`${base}-msg-erro`} className="campo-erro">
                      {erros.alertaMensagem}
                    </small>
                  ) : null}
                </div>
                <p className="sub">Quanto tempo antes do encerramento o cliente deve receber a mensagem?</p>
                <div className="fila-encerramento-tempo">
                  <div className="form-campo">
                    <label className="sub" htmlFor={`${base}-ant`}>
                      Tempo antes do encerramento
                    </label>
                    <Campo
                      id={`${base}-ant`}
                      inputMode="numeric"
                      value={rascunho.alertaAntecedencia}
                      onChange={(e) => mudar({ alertaAntecedencia: e.target.value })}
                      aria-invalid={erros.alertaAntecedencia ? true : undefined}
                      aria-describedby={erros.alertaAntecedencia ? `${base}-ant-erro` : undefined}
                      disabled={ocupado}
                    />
                    {erros.alertaAntecedencia ? (
                      <small id={`${base}-ant-erro`} className="campo-erro">
                        {erros.alertaAntecedencia}
                      </small>
                    ) : null}
                  </div>
                  <div className="form-campo fila-encerramento-unidade">
                    <label className="sub" htmlFor={`${base}-ant-un`}>
                      Unidade
                    </label>
                    <Unidade
                      id={`${base}-ant-un`}
                      value={rascunho.alertaUnidade}
                      onChange={(alertaUnidade) => mudar({ alertaUnidade })}
                      disabled={ocupado}
                    />
                  </div>
                </div>
              </>
            ) : null}
          </section>

          <section className="fila-subcartao">
            <div className="fila-subcartao-cab">
              <h4>Incluir tags no encerramento do ticket</h4>
              <Interruptor
                ligado={rascunho.tagsAtivo}
                rotulo="Incluir tags no encerramento do ticket"
                onAlternar={() => mudar({ tagsAtivo: !rascunho.tagsAtivo })}
                disabled={ocupado}
              />
            </div>
            {rascunho.tagsAtivo ? (
              <>
                <p className="note">Defina as tags que serão usadas nos tickets encerrados</p>
                <ChipsInput
                  rotulo="Tags de encerramento"
                  label="Tags de encerramento"
                  placeholder="Insira as tags separando por vírgulas"
                  values={rascunho.tags}
                  onChange={(tags) => mudar({ tags })}
                  {...(erros.tags ? { erro: erros.tags } : {})}
                />
              </>
            ) : null}
          </section>

          <p className="note">
            Para personalizar a mensagem após o encerramento do ticket, confira as condições de saída no bloco de atendimento no builder.
          </p>
          <Aviso>{errorSalvar}</Aviso>
          <div className="cl-actions">
            <Botao type="submit" variante="primario" disabled={!valido || !alterado || ocupado}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Botao>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
