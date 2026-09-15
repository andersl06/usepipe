'use client';

import { useState } from 'react';
import { IconePortal } from '../../../../../componentes/icones-portal';

/**
 * O filtro de Mensagens ativas — `St` (analytics-main.js 33556), dicionário `gt`.
 *
 * É cliente por UMA razão visível: o "Aplicar" nasce desabilitado e só acende
 * quando algo muda (o `N`/`U()` do `Lx`: chip, data ou template). O resto é um
 * formulário GET comum — o período, as datas e o template vão na URL e a página
 * (servidor) lê de lá, que é o `K()` da origem.
 *
 * Não importa `lib/analise.ts` de propósito: aquele arquivo abre o banco. Os
 * rótulos e os limites de data chegam por prop.
 */
export function Filtro({
  fileiras,
  periodo,
  de,
  ate,
  template,
  templates,
  hoje,
  limite,
}: {
  /** As duas fileiras de chip: `vT` sem o personalizado, e `kt`. */
  fileiras: { chave: string; rotulo: string }[][];
  periodo: string;
  de: string;
  ate: string;
  template: string;
  /** `/active-messages/template-names`: as opções do autocomplete. */
  templates: string[];
  /** `endDateLimit` (hoje) e `startDateLimit` (hoje − 186), em `AAAA-MM-DD`. */
  hoje: string;
  limite: string;
}) {
  const [mudou, setMudou] = useState(false);
  const [escolhido, setEscolhido] = useState(periodo);
  const [datas, setDatas] = useState({ de, ate });
  const [nome, setNome] = useState(template);
  const personalizado = escolhido === 'custom';

  /* `D()`: concluir o calendário vira período personalizado e apaga o chip. */
  const mudarData = (campo: 'de' | 'ate', valor: string) => {
    setDatas((d) => ({ ...d, [campo]: valor }));
    setEscolhido('custom');
    setMudou(true);
  };

  return (
    <form id="ma-filtro" className="ma-filtro" method="get">
      <div className="ma-filtro-grade">
        {/* `.chips-wrapper` › `bds-grid direction="column" gap="1"` */}
        <div className="ma-chips-caixa">
          <div className="ma-coluna">
            <div className="ma-rotulo-caixa">
              <p className="ma-t14 ma-negrito">Selecione o período</p>
            </div>
            {fileiras.map((fileira) => (
              <div key={fileira[0]?.chave} className="ma-linha-chips">
                {fileira.map(({ chave, rotulo }) => (
                  <label key={chave} className="ma-chip">
                    <input
                      type="radio"
                      name="periodo"
                      value={chave}
                      checked={escolhido === chave}
                      onChange={() => {
                        setEscolhido(chave);
                        setDatas({ de: '', ate: '' });
                        setMudou(true);
                      }}
                    />
                    <span className="ma-chip-texto">{rotulo}</span>
                  </label>
                ))}
              </div>
            ))}
            {personalizado ? <input type="hidden" name="periodo" value="custom" /> : null}
          </div>
        </div>

        {/* `.datepicker-wrapper`: rótulo fs-14 semi-bold e o `bds-datepicker
            type-of-date="period"` — dois `bds-input` "De"/"Até" com o ícone
            `calendar`. O calendário flutuante deles vira o seletor nativo. */}
        <div className="ma-coluna">
          <p className="ma-t14 ma-semi">Filtre por data</p>
          <div className="ma-datas">
            {(
              [
                ['de', 'De'],
                ['ate', 'Até'],
              ] as const
            ).map(([campo, rotulo]) => (
              <label key={campo} className="ma-campo">
                <span className="ma-campo-icone">
                  <IconePortal nome="calendario" tamanho={24} />
                </span>
                <span className="ma-campo-miolo">
                  <span className="ma-campo-rotulo">{rotulo}</span>
                  <input
                    type="date"
                    name={personalizado ? campo : undefined}
                    value={datas[campo]}
                    min={limite}
                    max={hoje}
                    onChange={(e) => mudarData(campo, e.target.value)}
                  />
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* `.autocomplete-wrapper`: o rótulo diz "campanha" porque o de template
            está ligado (`y || v`); o de Campanha fica escondido pela flag. */}
        <div className="ma-coluna">
          <p className="ma-t14 ma-semi">Filtre por campanha</p>
          <div className="ma-linha-chips ma-filtro-template">
            <label className="ma-campo ma-campo-auto">
              <span className="ma-campo-miolo">
                <span className="ma-campo-rotulo">Template</span>
                <input
                  type="text"
                  name="template"
                  list="ma-templates"
                  placeholder="Nome do template"
                  autoComplete="off"
                  value={nome}
                  onChange={(e) => {
                    setNome(e.target.value);
                    setMudou(true);
                  }}
                />
                <datalist id="ma-templates">
                  {templates.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </span>
              {/* `.select__icon`: o `error` sólido só aparece com valor (`icon-hidden`). */}
              <span className="ma-campo-sufixo">
                <IconePortal
                  nome="fechar-chip"
                  tamanho={16}
                  style={{ visibility: nome ? 'visible' : 'hidden', cursor: 'pointer' }}
                  onClick={(e) => {
                    e.preventDefault();
                    setNome('');
                    setMudou(true);
                  }}
                />
                <IconePortal nome="baixo" tamanho={16} />
              </span>
            </label>
            <button type="submit" className="ma-botao ma-botao-primario" disabled={!mudou}>
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
