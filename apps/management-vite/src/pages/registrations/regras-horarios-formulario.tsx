import { useState, type FormEvent } from 'react';
import { Botao, BotaoDeIcone, Campo, Etiqueta } from '@pipe/ui';
import { Select } from '@pipe/ui/select';
import { ChipsInput } from '@pipe/ui/chips-input';
import type { HorarioCadastrado } from '../../lib/registrations';
import { gravarHorario } from '../../lib/registrations-gravar';
import {
  DIAS_NA_TELA,
  FAIXA_PADRAO,
  NOME_DO_HORARIO_MAX,
  PERIODO_DIAS_MAX,
  TITULO_DO_PERIODO_MAX,
  erroDoPeriodo,
  erroDoRascunho,
  hojeNoFuso,
  novaChave,
  pedidoDeHorario,
  rascunhoDe,
  type FaixaRascunho,
  type PeriodoRascunho,
  type RascunhoDeHorario,
} from '../../lib/horarios';
import { Interruptor } from './regras-sla-formulario';

/**
 * Formulário "Criar horário" / "Editar horário", no lugar da lista e na mesma URL: um cartão com nome, filas, programação de Segunda a Domingo (várias faixas por dia) e períodos sem atendimento (`ref/verificacao/attendance-hours-blip.md`). O servidor recebe o horário inteiro de uma vez e valida de novo. O horário regular, a descrição e o período com horas parciais ainda não têm onde ser gravados e ficam desabilitados.
 */

export const EM_BREVE = 'Este recurso será liberado em breve para este fluxo.';

const HORAS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTOS = Array.from({ length: 60 }, (_, m) => String(m).padStart(2, '0'));

/** Hora e minuto em dois `Select` do produto: o valor é `HH:MM`. */
function CampoHora({
  valor,
  rotulo,
  onChange,
  desabilitado,
}: {
  valor: string;
  rotulo: string;
  onChange?: (valor: string) => void;
  desabilitado?: boolean;
}) {
  const [h = '00', m = '00'] = valor.split(':');
  return (
    <div className="panel-time">
      <Select
        value={h}
        aria-label={`Hora ${rotulo}`}
        disabled={desabilitado}
        onChange={(e) => onChange?.(`${e.target.value}:${m}`)}
      >
        {HORAS.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </Select>
      <Select
        value={m}
        aria-label={`Minuto ${rotulo}`}
        disabled={desabilitado}
        onChange={(e) => onChange?.(`${h}:${e.target.value}`)}
      >
        {MINUTOS.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </Select>
    </div>
  );
}

function LinhaDoDia({
  rotulo,
  faixas,
  desabilitado,
  onChange,
}: {
  rotulo: string;
  faixas: readonly FaixaRascunho[];
  desabilitado: boolean;
  onChange: (faixas: FaixaRascunho[]) => void;
}) {
  const mudar = (i: number, parcial: Partial<FaixaRascunho>) =>
    onChange(faixas.map((f, j) => (j === i ? { ...f, ...parcial } : f)));
  const acrescentar = () => onChange([...faixas, { ...FAIXA_PADRAO }]);
  return (
    <div className="horario-dia">
      <span className="horario-dia-nome">{rotulo}</span>
      {faixas.length === 0 ? (
        <>
          <span className="sub">Sem atendentes disponíveis</span>
          <BotaoDeIcone
            nome="mais"
            rotulo={`Adicionar faixa de atendimento em ${rotulo}`}
            disabled={desabilitado}
            onClick={acrescentar}
          />
        </>
      ) : (
        <div className="horario-faixas">
          {faixas.map((f, i) => (
            <div key={i} className="horario-faixa">
              <span className="sub">De</span>
              <CampoHora
                valor={f.start}
                rotulo={`de início, ${rotulo}`}
                desabilitado={desabilitado}
                onChange={(start) => mudar(i, { start })}
              />
              <span className="sub">Até</span>
              <CampoHora
                valor={f.end}
                rotulo={`de fim, ${rotulo}`}
                desabilitado={desabilitado}
                onChange={(end) => mudar(i, { end })}
              />
              <BotaoDeIcone
                nome="lixeira"
                rotulo={`Remover faixa de ${rotulo}`}
                disabled={desabilitado}
                onClick={() => onChange(faixas.filter((_, j) => j !== i))}
              />
              {i === faixas.length - 1 ? (
                <BotaoDeIcone
                  nome="mais"
                  rotulo={`Adicionar outra faixa em ${rotulo}`}
                  disabled={desabilitado}
                  onClick={acrescentar}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CartaoDoPeriodo({
  periodo,
  desabilitado,
  onChange,
  onRemover,
}: {
  periodo: PeriodoRascunho;
  desabilitado: boolean;
  onChange: (parcial: Partial<PeriodoRascunho>) => void;
  onRemover: () => void;
}) {
  const erro = periodo.from && periodo.to ? erroDoPeriodo(periodo) : null;
  return (
    <div className="horario-periodo">
      <div className="horario-periodo-cabecalho">
        <Campo
          value={periodo.title}
          placeholder="Insira um título"
          aria-label="Título do período sem atendimento"
          maxLength={TITULO_DO_PERIODO_MAX}
          disabled={desabilitado}
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <label className="horario-periodo-completo">
          <span className="sub">Dia completo</span>
          <Interruptor
            ligado
            rotulo="Dia completo"
            titulo={EM_BREVE}
            desabilitado
            onChange={() => undefined}
          />
        </label>
        <BotaoDeIcone
          nome="lixeira"
          rotulo="Remover período sem atendimento"
          disabled={desabilitado}
          onClick={onRemover}
        />
      </div>
      <div className="horario-periodo-datas">
        {(
          [
            ['De', 'from', '00', '00'],
            ['Até', 'to', '23', '59'],
          ] as const
        ).map(([rotulo, campo, hora, minuto]) => (
          <div key={campo} className="horario-periodo-data">
            <span className="sub">{rotulo}</span>
            <input
              type="date"
              value={periodo[campo]}
              aria-label={`Data ${rotulo === 'De' ? 'inicial' : 'final'} do período`}
              required
              disabled={desabilitado}
              onChange={(e) => onChange({ [campo]: e.currentTarget.value })}
            />
            <CampoHora valor={`${hora}:${minuto}`} rotulo={`${rotulo.toLowerCase()} do período`} desabilitado />
          </div>
        ))}
      </div>
      {erro ? (
        <span className="at-sc-erro" role="alert">
          {erro}
        </span>
      ) : null}
    </div>
  );
}

export function FormularioDeHorario({
  horario,
  fuso,
  filas,
  onFechar,
  onExcluir,
}: {
  /** Presente = editar; ausente = criar. */
  horario?: HorarioCadastrado;
  fuso: string;
  filas: readonly { id: string; name: string }[];
  onFechar: () => void;
  onExcluir?: () => void;
}) {
  const [rascunho, setRascunho] = useState<RascunhoDeHorario>(() => rascunhoDe(horario));
  const [nomeTocado, setNomeTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problema = erroDoRascunho(rascunho);
  const mudar = (parcial: Partial<RascunhoDeHorario>) => setRascunho((r) => ({ ...r, ...parcial }));
  const aberturasEspeciais = horario?.exceptions.filter((e) => !e.closed).length ?? 0;
  const opcoes = filas.map((f) => ({ id: f.id, nome: f.name }));

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (problema) return;
    setEnviando(true);
    setError(null);
    const resultado = await gravarHorario(pedidoDeHorario(rascunho), horario?.id);
    setEnviando(false);
    if (resultado.ok) onFechar();
    else setError(resultado.error);
  }

  return (
    <>
      <div className="board-head regras-form-cabecalho">
        <BotaoDeIcone nome="esquerda" rotulo="Voltar para a lista de horários" onClick={onFechar} />
        <h2>{horario ? 'Editar horário' : 'Criar horário'}</h2>
      </div>

      <form className="fila-form regras-form" onSubmit={(e) => void salvar(e)}>
        <div className="sla-form-linha">
          <div>
            <h3>Nome e descrição</h3>
            <p className="sub">Qual o nome e a descrição deste horário de atendimento?</p>
          </div>
          <div className="sla-form-controles">
            <label className="form-campo">
              <span className="sub">Nome do horário</span>
              <Campo
                value={rascunho.name}
                placeholder="Insira o nome do horário (Ex: Horário de vendas)"
                maxLength={NOME_DO_HORARIO_MAX}
                aria-invalid={nomeTocado && !rascunho.name.trim() ? true : undefined}
                disabled={enviando}
                onChange={(e) => mudar({ name: e.target.value })}
                onBlur={() => setNomeTocado(true)}
              />
              {nomeTocado && !rascunho.name.trim() ? (
                <span className="at-sc-erro">Informe o nome do horário</span>
              ) : null}
            </label>
            <label className="form-campo">
              <span className="sub">Descrição</span>
              <Campo
                placeholder="Insira uma breve descrição sobre este horário"
                title={EM_BREVE}
                disabled
              />
              <span className="sub">{EM_BREVE}</span>
            </label>
          </div>
        </div>

        <div className="sla-form-linha">
          <div>
            <h3>Filas</h3>
            <p className="sub">Quais filas irão operar neste horário de atendimento?</p>
          </div>
          <div className="sla-form-controles">
            <label className="sla-form-padrao">
              <span className="sub">Definir como horário regular da operação</span>
              <Interruptor
                ligado={false}
                rotulo="Definir como horário regular da operação"
                titulo={EM_BREVE}
                desabilitado
                onChange={() => undefined}
              />
            </label>
            <span className="sub">{EM_BREVE}</span>
            <ChipsInput
              rotulo="Filas deste horário"
              label="Filas deste horário"
              placeholder="Selecione as filas de atendimento"
              options={opcoes}
              values={rascunho.queueIds}
              onChange={(queueIds) => mudar({ queueIds })}
            />
            <span className="sub">
              {rascunho.queueIds.length} de {filas.length} filas selecionadas
            </span>
          </div>
        </div>

        <div className="sla-form-linha">
          <div>
            <h3>Programação</h3>
            <p className="sub">Em quais dias e horários seus atendentes estarão disponíveis?</p>
          </div>
          <div className="horario-programacao">
            {DIAS_NA_TELA.map(({ dia, rotulo }) => (
              <LinhaDoDia
                key={dia}
                rotulo={rotulo}
                faixas={rascunho.faixas[dia] ?? []}
                desabilitado={enviando}
                onChange={(faixas) => mudar({ faixas: { ...rascunho.faixas, [dia]: faixas } })}
              />
            ))}
          </div>
        </div>

        <div className="sla-form-linha">
          <div>
            <h3>Períodos sem atendimento</h3>
            <p className="sub">
              Caso sua equipe de atendimento não esteja disponível em períodos específicos (ex:
              feriados ou recessos), você pode configurá-los aqui.
            </p>
          </div>
          <div className="sla-form-controles">
            <div className="horario-periodos-topo">
              <Botao
                type="button"
                icone="mais"
                disabled={enviando}
                onClick={() => {
                  const hoje = hojeNoFuso(new Date(), fuso);
                  mudar({
                    periods: [...rascunho.periods, { chave: novaChave(), title: '', from: hoje, to: hoje }],
                  });
                }}
              >
                Cadastrar período
              </Botao>
              <span className="sub">
                {rascunho.periods.length === 1
                  ? '1 periodo cadastrado'
                  : `${rascunho.periods.length} períodos cadastrados`}
              </span>
            </div>
            <p className="sub">Cada período tem no máximo {PERIODO_DIAS_MAX} dias, no fuso {fuso}.</p>
            {rascunho.periods.map((p) => (
              <CartaoDoPeriodo
                key={p.chave}
                periodo={p}
                desabilitado={enviando}
                onChange={(parcial) =>
                  mudar({ periods: rascunho.periods.map((x) => (x.chave === p.chave ? { ...x, ...parcial } : x)) })
                }
                onRemover={() => mudar({ periods: rascunho.periods.filter((x) => x.chave !== p.chave) })}
              />
            ))}
            {aberturasEspeciais > 0 ? (
              <p className="sub">
                Este horário tem {aberturasEspeciais} exceção(ões) com horário especial, mantida(s) como
                está.
              </p>
            ) : null}
          </div>
        </div>

        {error ? <Etiqueta tom="erro">{error}</Etiqueta> : null}
        <div className="cl-actions horario-rodape">
          {onExcluir ? (
            <Botao type="button" variante="perigo" onClick={onExcluir} disabled={enviando}>
              Excluir
            </Botao>
          ) : null}
          <Botao type="button" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao type="submit" variante="primario" disabled={enviando || problema !== null}>
            {enviando ? 'Salvando…' : 'Salvar alterações'}
          </Botao>
        </div>
      </form>
    </>
  );
}
