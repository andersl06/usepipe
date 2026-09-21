import { useState, type FormEvent } from 'react';
import { Botao, BotaoDeIcone, Campo, Etiqueta, Seletor } from '@pipe/ui';
import type { AtendenteCadastrado, FilaCadastrada } from '../../lib/cadastros';
import {
  desvincularAtendenteDaFila,
  editarFila,
  vincularAtendenteNaFila,
} from '../../lib/cadastros-gravar';

/**
 * Conteúdo do modal "Editar fila" — renomear e vincular/desvincular
 * atendente (item 2 da tarefa de cadastros do Atendimento). `PATCH
 * /v1/gestao/atendentes/filas/:id`, `POST .../:id/atendentes` e `DELETE
 * .../:id/atendentes/:atendenteId` já existem e já são testados
 * (`apps/api/src/controladores/gestao-cadastros.ts`); faltava só a interface.
 *
 * Sem ficha capturada com este modal aberto (a origem só documenta o
 * `bds-modal` fechado, como os outros dois desta tela) — a forma aqui é a
 * mesma dos formulários vizinhos: rótulo em `.sub`, `Etiqueta` de erro no
 * campo certo, `.cl-acoes` para os botões.
 *
 * `fila` chega de novo a cada render do pai (`atendentes-filas.tsx` busca por
 * id em `filas`, não guarda o objeto parado) — por isso vincular ou
 * desvincular aqui dentro atualiza a lista de atendentes do modal sem fechar
 * e reabrir.
 */
export function EdicaoDeFila({
  fila,
  atendentesGestao,
}: {
  fila: FilaCadastrada;
  atendentesGestao: AtendenteCadastrado[];
}) {
  const [nome, setNome] = useState(fila.nome);
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [erroNome, setErroNome] = useState<string | null>(null);

  const [atendenteId, setAtendenteId] = useState('');
  const [capacidade, setCapacidade] = useState('');
  const [vinculando, setVinculando] = useState(false);
  /* `campo` decide onde a recusa aparece: "capacidadeOverride" vai debaixo do
     campo de capacidade, o resto (atendente inexistente, sem permissão) vai
     no rodapé do formulário. */
  const [resultadoVinculo, setResultadoVinculo] = useState<{ erro: string; campo?: string } | null>(
    null,
  );
  const erroCapacidade = resultadoVinculo?.campo === 'capacidadeOverride' ? resultadoVinculo.erro : null;
  const erroVinculo = resultadoVinculo && resultadoVinculo.campo !== 'capacidadeOverride' ? resultadoVinculo.erro : null;

  const [desvinculandoId, setDesvinculandoId] = useState<string | null>(null);
  const [erroDesvinculo, setErroDesvinculo] = useState<string | null>(null);

  const idsVinculados = new Set(fila.atendentes.map((a) => a.id));
  const disponiveis = atendentesGestao.filter((a) => !idsVinculados.has(a.id));
  const nomeMudou = nome.trim() !== '' && nome.trim() !== fila.nome;

  async function salvarNome(evento: FormEvent) {
    evento.preventDefault();
    if (!nomeMudou) return;
    setSalvandoNome(true);
    setErroNome(null);
    const resultado = await editarFila(fila.id, { nome: nome.trim() });
    setSalvandoNome(false);
    if (!resultado.ok) setErroNome(resultado.erro);
  }

  async function vincular(evento: FormEvent) {
    evento.preventDefault();
    if (!atendenteId) return;
    setVinculando(true);
    setResultadoVinculo(null);
    const resultado = await vincularAtendenteNaFila(
      fila.id,
      atendenteId,
      capacidade.trim() ? Number(capacidade) : null,
    );
    setVinculando(false);
    if (resultado.ok) {
      setAtendenteId('');
      setCapacidade('');
    } else {
      setResultadoVinculo({ erro: resultado.erro, campo: resultado.campo });
    }
  }

  async function desvincular(id: string) {
    setDesvinculandoId(id);
    setErroDesvinculo(null);
    const resultado = await desvincularAtendenteDaFila(fila.id, id);
    setDesvinculandoId(null);
    if (!resultado.ok) setErroDesvinculo(resultado.erro);
  }

  return (
    <>
      <form className="form-cadastro" onSubmit={(e) => void salvarNome(e)}>
        <label className="form-campo">
          <span className="sub">Nome</span>
          <Campo
            name="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            disabled={salvandoNome}
          />
        </label>

        {erroNome ? <Etiqueta tom="erro">{erroNome}</Etiqueta> : null}

        <div className="cl-acoes">
          <Botao type="submit" variante="primario" disabled={salvandoNome || !nomeMudou}>
            {salvandoNome ? 'Salvando…' : 'Salvar nome'}
          </Botao>
        </div>
      </form>

      <p className="sub" style={{ marginTop: 'var(--p-e-4, 24px)' }}>
        Atendentes desta fila
      </p>

      {fila.atendentes.length === 0 ? (
        <p className="sub">Nenhum atendente vinculado — a distribuição não tem a quem entregar.</p>
      ) : (
        fila.atendentes.map((a) => (
          <div key={a.id} className="form-linha" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="sub">
              {a.nome} · {a.capacidade}
              {a.temOverride ? ' próprio' : ''}
            </span>
            <div className="cl-acoes">
              <BotaoDeIcone
                nome="x"
                rotulo={`Desvincular ${a.nome} da fila ${fila.nome}`}
                onClick={() => void desvincular(a.id)}
                disabled={desvinculandoId === a.id}
              />
            </div>
          </div>
        ))
      )}

      {erroDesvinculo ? <Etiqueta tom="erro">{erroDesvinculo}</Etiqueta> : null}

      <form className="form-cadastro" onSubmit={(e) => void vincular(e)} style={{ marginTop: 'var(--p-e-3, 16px)' }}>
        <div className="form-linha">
          <label className="form-campo" style={{ flexBasis: '240px' }}>
            <span className="sub">Vincular atendente</span>
            <Seletor
              value={atendenteId}
              onChange={(e) => setAtendenteId(e.target.value)}
              disabled={vinculando || disponiveis.length === 0}
            >
              <option value="">
                {disponiveis.length === 0 ? 'Todos já estão nesta fila' : 'Escolha um atendente'}
              </option>
              {disponiveis.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </Seletor>
          </label>

          <label className="form-campo">
            <span className="sub">Capacidade própria (opcional)</span>
            <Campo
              name="capacidade"
              type="number"
              min={1}
              max={200}
              placeholder={`Padrão da fila: ${fila.capacidadePadrao}`}
              value={capacidade}
              onChange={(e) => setCapacidade(e.target.value)}
              disabled={vinculando}
            />
            {erroCapacidade ? <Etiqueta tom="erro">{erroCapacidade}</Etiqueta> : null}
          </label>
        </div>

        {erroVinculo ? <Etiqueta tom="erro">{erroVinculo}</Etiqueta> : null}

        <div className="cl-acoes">
          <Botao type="submit" disabled={vinculando || !atendenteId}>
            {vinculando ? 'Vinculando…' : 'Vincular'}
          </Botao>
        </div>
      </form>
    </>
  );
}
