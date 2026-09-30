import { useId, type ReactNode } from 'react';
import type { FlowAiModelInput, FlowAiContentCombination } from '@pipe/contracts';
import { Botao, Campo } from '@pipe/ui';
import { Select } from '@pipe/ui/select';
import { ChipsInput } from '@pipe/ui/chips-input';
import { MODEL_SUGGESTIONS } from '../builder/ai-agent-block';
import { renameIntent } from './ai-model-logic';

function TextField({ label, value, onChange, long = false }: { label: string; value: string; onChange: (value: string) => void; long?: boolean }) {
  return <label className="ai-model-field"><span>{label}</span>{long
    ? <textarea className="campo" rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
    : <Campo value={value} onChange={(e) => onChange(e.target.value)} />}</label>;
}

/** One row per text: answer punctuation/newlines never become accidental separators. */
function TextList({ label, values, onChange, max }: { label: string; values: string[]; onChange: (values: string[]) => void; max: number }) {
  return <fieldset className="ai-model-list"><legend>{label}</legend>
    {values.map((value, i) => <div className="ai-model-inline" key={i}>
      <textarea className="campo" rows={2} aria-label={`${label} ${i + 1}`} value={value} onChange={(e) => onChange(values.map((x, n) => n === i ? e.target.value : x))} />
      <Botao type="button" variante="padrao" aria-label={`Excluir ${label} ${i + 1}`} onClick={() => onChange(values.filter((_, n) => n !== i))}>Excluir</Botao>
    </div>)}
    <Botao type="button" variante="padrao" disabled={values.length >= max} onClick={() => onChange([...values, ''])}>+ Adicionar {label.toLowerCase()}</Botao>
  </fieldset>;
}

function Collection<T extends { id: string; name: string }>({ label, items, onChange, create, max, children }: {
  label: string; items: T[]; onChange: (items: T[]) => void; create: () => T; max: number;
  children: (item: T, update: (item: T) => void) => ReactNode;
}) {
  return <section className="ai-model-section" aria-label={label}>
    <header><h2>{label}</h2><span className="sub">{items.length} / {max}</span></header>
    {!items.length ? <p className="sub">Nenhum item cadastrado. Adicione o primeiro abaixo.</p> : null}
    {items.map((item, i) => <article className="ai-model-card" key={item.id}>
      <header><h3>{item.name || `Novo item ${i + 1}`}</h3><Botao type="button" variante="padrao" aria-label={`Excluir ${label}: ${item.name || i + 1}`} onClick={() => onChange(items.filter((x) => x.id !== item.id))}>Excluir</Botao></header>
      {children(item, (next) => onChange(items.map((x) => x.id === item.id ? next : x)))}
    </article>)}
    <Botao type="button" variante="padrao" disabled={items.length >= max} onClick={() => onChange([...items, create()])}>+ Adicionar em {label}</Botao>
  </section>;
}

export function AiModelForm({ model, onChange, secretNames }: { model: FlowAiModelInput; onChange: (model: FlowAiModelInput) => void; secretNames: string[] }) {
  const instance = useId();
  const provider = model.settings.provider ?? (/^(gpt-|o\d)/i.test(model.settings.model ?? '') ? 'openai' : 'anthropic');
  const secret = model.settings.apiKeySecret || (provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY');
  const settings = (patch: Partial<FlowAiModelInput['settings']>) => onChange({ ...model, settings: { ...model.settings, ...patch } });
  return <div className="ai-model-form">
    <section className="ai-model-section" aria-label="Configuração do modelo">
      <h2>Configuração do modelo</h2>
      <Select rotulo="Provedor" value={model.settings.provider ?? ''} onChange={(e) => settings({ provider: e.target.value as 'anthropic' | 'openai' || null })}>
        <option value="">Automático pelo nome do modelo</option><option value="anthropic">Anthropic</option><option value="openai">OpenAI</option>
      </Select>
      <label className="ai-model-field"><span>Modelo</span><Campo list={`${instance}-models`} value={model.settings.model ?? ''} placeholder="Padrão do provedor" onChange={(e) => settings({ model: e.target.value || null })} /></label>
      <datalist id={`${instance}-models`}>{MODEL_SUGGESTIONS[provider].map((name) => <option key={name} value={name} />)}</datalist>
      <label className="ai-model-field"><span>Chave do provedor (nome da variável sensível)</span><Campo list={`${instance}-secrets`} value={model.settings.apiKeySecret ?? ''} placeholder={secret} onChange={(e) => settings({ apiKeySecret: e.target.value || null })} /></label>
      <datalist id={`${instance}-secrets`}>{secretNames.map((name) => <option key={name} value={name} />)}</datalist>
      <p className="sub">Chave em uso: {secret}. Informe somente o nome; cadastre o valor em Variáveis sensíveis no Builder.</p>
      {!secretNames.includes(secret) ? <p className="ai-model-warning">A variável sensível {secret} ainda não foi cadastrada neste fluxo.</p> : null}
    </section>
    <Collection label="Intenções" items={model.intents} max={200} create={() => ({ id: crypto.randomUUID(), name: '', description: '', examples: [], answers: [] })} onChange={(intents) => onChange({ ...model, intents })}>
      {(intent, update) => <>
        <TextField label="Nome da intenção" value={intent.name} onChange={(name) => onChange(renameIntent(model, intent.id, name))} />
        <TextField label="Descrição" long value={intent.description ?? ''} onChange={(description) => update({ ...intent, description })} />
        <TextList label="Exemplos" max={100} values={intent.examples} onChange={(examples) => update({ ...intent, examples })} />
        <TextList label="Respostas" max={20} values={intent.answers} onChange={(answers) => update({ ...intent, answers })} />
      </>}
    </Collection>
    <Collection label="Entidades" items={model.entities} max={100} create={() => ({ id: crypto.randomUUID(), name: '', values: [] })} onChange={(entities) => onChange({ ...model, entities })}>
      {(entity, update) => <>
        <TextField label="Nome da entidade" value={entity.name} onChange={(name) => update({ ...entity, name })} />
        {entity.values.map((value, i) => <fieldset className="ai-model-card" key={i}><legend>Valor {i + 1}</legend>
          <TextField label="Valor da entidade" value={value.name} onChange={(name) => update({ ...entity, values: entity.values.map((x, n) => n === i ? { ...x, name } : x) })} />
          <TextList label="Sinônimos" max={50} values={value.synonyms} onChange={(synonyms) => update({ ...entity, values: entity.values.map((x, n) => n === i ? { ...x, synonyms } : x) })} />
          <Botao type="button" variante="padrao" onClick={() => update({ ...entity, values: entity.values.filter((_, n) => n !== i) })}>Excluir valor {i + 1}</Botao>
        </fieldset>)}
        <Botao type="button" variante="padrao" disabled={entity.values.length >= 200} onClick={() => update({ ...entity, values: [...entity.values, { name: '', synonyms: [] }] })}>+ Adicionar valor</Botao>
      </>}
    </Collection>
    <Collection label="Conteúdos" items={model.contents} max={200} create={() => ({ id: crypto.randomUUID(), name: '', combinations: [{ intent: null, entities: [] }], result: '' })} onChange={(contents) => onChange({ ...model, contents })}>
      {(content, update) => <>
        <TextField label="Nome do conteúdo" value={content.name} onChange={(name) => update({ ...content, name })} />
        <TextField label="Resposta do conteúdo" long value={content.result} onChange={(result) => update({ ...content, result })} />
        {content.combinations.map((combination, i) => {
          const change = (next: FlowAiContentCombination) => update({ ...content, combinations: content.combinations.map((x, n) => n === i ? next : x) });
          return <fieldset className="ai-model-card" key={i}><legend>Combinação {i + 1}</legend>
            <Select rotulo="Intenção" value={combination.intent ?? ''} onChange={(e) => change({ ...combination, intent: e.target.value || null })}>
              <option value="">Qualquer intenção</option>
              {combination.intent && !model.intents.some((x) => x.name === combination.intent) ? <option value={combination.intent}>{combination.intent} (ausente)</option> : null}
              {model.intents.map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}
            </Select>
            <ChipsInput rotulo="Valores de entidades" label="Valores de entidades" placeholder="Escolha valores" values={combination.entities} options={[...new Set([...model.entities.flatMap((x) => x.values.map((v) => v.name)), ...combination.entities])].map((name) => ({ id: name, nome: name }))} onChange={(entities) => change({ ...combination, entities, ...(combination.minEntityMatch !== undefined ? { minEntityMatch: Math.min(combination.minEntityMatch, entities.length) } : {}) })} />
            <label className="ai-model-field"><span>Mínimo de valores identificados</span><Campo type="number" min={0} max={combination.entities.length} step={1} placeholder="Todos os valores" value={combination.minEntityMatch ?? ''} onChange={(e) => {
              const next = { ...combination };
              if (e.target.value === '') delete next.minEntityMatch;
              else next.minEntityMatch = Number(e.target.value);
              change(next);
            }} /></label>
            <Botao type="button" variante="padrao" onClick={() => update({ ...content, combinations: content.combinations.filter((_, n) => n !== i) })}>Excluir combinação {i + 1}</Botao>
          </fieldset>;
        })}
        <Botao type="button" variante="padrao" disabled={content.combinations.length >= 20} onClick={() => update({ ...content, combinations: [...content.combinations, { intent: null, entities: [] }] })}>+ Adicionar combinação</Botao>
      </>}
    </Collection>
    <Collection label="AI Answers" items={model.assistants} max={20} create={() => ({ id: crypto.randomUUID(), name: '', invalidAnswer: '', knowledge: [] })} onChange={(assistants) => onChange({ ...model, assistants })}>
      {(assistant, update) => <>
        <TextField label="Nome do assistente" value={assistant.name} onChange={(name) => update({ ...assistant, name })} />
        <TextField label="Nome da empresa" value={assistant.companyName ?? ''} onChange={(companyName) => update({ ...assistant, companyName })} />
        <TextField label="Perfil" long value={assistant.profile ?? ''} onChange={(profile) => update({ ...assistant, profile })} />
        <TextField label="Diretrizes" long value={assistant.guidelines ?? ''} onChange={(guidelines) => update({ ...assistant, guidelines })} />
        <TextField label="Resposta de fallback" long value={assistant.invalidAnswer} onChange={(invalidAnswer) => update({ ...assistant, invalidAnswer })} />
        <h4>Perguntas e respostas (Q&A)</h4>
        {assistant.knowledge.map((entry, i) => <fieldset className="ai-model-card" key={i}><legend>Pergunta e resposta {i + 1}</legend>
          <TextField label="Pergunta" long value={entry.question} onChange={(question) => update({ ...assistant, knowledge: assistant.knowledge.map((x, n) => n === i ? { ...x, question } : x) })} />
          <TextField label="Resposta" long value={entry.answer} onChange={(answer) => update({ ...assistant, knowledge: assistant.knowledge.map((x, n) => n === i ? { ...x, answer } : x) })} />
          <Botao type="button" variante="padrao" onClick={() => update({ ...assistant, knowledge: assistant.knowledge.filter((_, n) => n !== i) })}>Excluir pergunta e resposta {i + 1}</Botao>
        </fieldset>)}
        <Botao type="button" variante="padrao" disabled={assistant.knowledge.length >= 500} onClick={() => update({ ...assistant, knowledge: [...assistant.knowledge, { question: '', answer: '' }] })}>+ Adicionar pergunta e resposta</Botao>
      </>}
    </Collection>
  </div>;
}
