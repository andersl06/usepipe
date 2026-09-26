import { Botao, Campo, Etiqueta, Seletor, Tabela, type Column } from '@pipe/ui';
import { Block, SectionHeader } from '../../../components/settings/cabecalho';
import {
  ConfirmationButton,
  Formulario,
  FormularioDeLinha,
} from '../../../components/settings/formulario';
import { listarCamposPersonalizados } from '../../../lib/settings-data';
import { TIPOS_DE_CAMPO, type CampoPersonalizado } from '../../../lib/settings-comum';
import { numero } from '../../../lib/format';
import { actionCreateField, acaoExcluirCampo, acaoRenomearCampo } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * Custom fields for the lead.
 *
 * **What Twenty has here that Pipe won't.** There, "Data model" lets the customer create
 * an OBJECT and a FIELD — which means running `alter table` at runtime, on a database
 * with RLS and versioned migrations. Pipe decided the opposite at the foundation, and
 * it's written into the schema: *"a tenant's custom field lives here, with a GIN
 * index — never `alter table` at runtime"*. The value lives in `lead.customizados`,
 * which is `jsonb`.
 *
 * So the honest equivalent isn't "create a field in the database": it's **declaring the
 * key**. That's what this screen does, in `dicionario_campo` — the same table the
 * query language reads to decide what's queryable. Declaring it here is what makes
 * the field exist for search, for export, and for whoever fills out the form.
 *
 * Three consequences of this decision, all visible on the screen:
 *
 * - **The code isn't editable.** It's the key inside each lead's `jsonb`; changing it
 *   would silently orphan the stored value across the entire database. Label and
 *   description, yes.
 * - **"Filled in" counts real leads**, scanning `customizados`. It's the number that stops
 *   someone from blindly deleting a field that 400 leads use — the opposite of Twenty's
 *   "Mostly empty".
 * - **Deleting removes the definition, not the value.** Whatever was stored stays there,
 *   and the audit log keeps the code. Re-registering the same code makes the data
 *   reappear.
 */

const ROTULO_DO_TIPO = new Map(TIPOS_DE_CAMPO.map((t) => [t.codigo as string, t.rotulo]));

const COLUNAS: readonly Column<CampoPersonalizado>[] = [
  {
    key: 'rotulo',
    rotulo: 'Campo',
    celula: (c) => (
      <FormularioDeLinha acao={acaoRenomearCampo} campos={{ id: c.id }}>
        <label>
          <span className="cfg-oculto">Rótulo de {c.codigo}</span>
          <Campo name="rotulo" defaultValue={c.rotulo} required maxLength={120} />
        </label>
        <label>
          <span className="cfg-oculto">Descrição de {c.codigo}</span>
          <Campo name="descricao" defaultValue={c.description ?? ''} placeholder="Descrição" />
        </label>
        <Botao type="submit">Renomear</Botao>
      </FormularioDeLinha>
    ),
  },
  { key: 'codigo', rotulo: 'Código', celula: (c) => <span className="mono">{c.codigo}</span> },
  {
    key: 'tipo',
    rotulo: 'Tipo',
    celula: (c) => <Etiqueta>{ROTULO_DO_TIPO.get(c.tipo) ?? c.tipo}</Etiqueta>,
  },
  {
    key: 'preenchidos',
    rotulo: 'Leads preenchidos',
    numerica: true,
    celula: (c) => numero(c.preenchidos),
  },
  {
    key: 'acao',
    rotulo: 'Ação',
    celula: (c) => (
      <FormularioDeLinha acao={acaoExcluirCampo} campos={{ id: c.id }}>
        <ConfirmationButton
          rotulo="Excluir"
          pergunta={
            c.preenchidos > 0
              ? `${numero(c.preenchidos)} leads têm valor neste campo. O valor fica no banco; a definição some.`
              : 'Excluir a definição deste campo?'
          }
        />
      </FormularioDeLinha>
    ),
  },
];

export default async function PageFields() {
  const campos = await listarCamposPersonalizados();

  return (
    <>
      <SectionHeader titulo="Campos personalizados">
        Os campos do lead que são seus. O Pipe guarda o valor em <code>lead.customizados</code>;
        aqui você declara o que cada chave significa.
      </SectionHeader>

      <Block
        titulo="Campos do lead"
        description="O código é a chave gravada em cada lead e não muda. Rótulo e descrição, sim."
      >
        <Tabela
          colunas={COLUNAS}
          linhas={campos}
          rowKey={(c) => c.id}
          larguraMinima={820}
          empty="Nenhum campo personalizado ainda. O lead usa só os campos que o Pipe já traz."
        />
      </Block>

      <Block
        titulo="Novo campo"
        description="Deixe o código em branco e o Pipe deriva do rótulo — sem acento, sem espaço, minúsculo."
      >
        <Formulario acao={actionCreateField} rotuloBotao="Criar campo">
          <div className="cfg-form-linha">
            <label className="cfg-campo">
              <span>Rótulo</span>
              <Campo name="rotulo" required maxLength={120} placeholder="Faturamento anual" />
            </label>
            <label className="cfg-campo">
              <span>Tipo</span>
              <Seletor name="tipo" defaultValue="texto">
                {TIPOS_DE_CAMPO.map((t) => (
                  <option key={t.codigo} value={t.codigo}>
                    {t.rotulo}
                  </option>
                ))}
              </Seletor>
            </label>
            <label className="cfg-campo">
              <span>Código (opcional)</span>
              <Campo
                name="codigo"
                maxLength={40}
                pattern="[a-z][a-z0-9_]{1,39}"
                placeholder="faturamento_anual"
                className="mono"
              />
            </label>
          </div>
          <label className="cfg-campo">
            <span>O que este campo guarda</span>
            <Campo
              name="descricao"
              maxLength={200}
              placeholder="Faturamento declarado pelo lead no formulário"
            />
          </label>
        </Formulario>
      </Block>
    </>
  );
}
