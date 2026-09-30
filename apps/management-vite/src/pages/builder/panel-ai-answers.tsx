import { Campo } from '@pipe/ui';
import type { Block } from './model';
import { AssistantPicker } from './ai-model-context';
import { comCampo, fieldValue, novaAcao } from './actions-of-block';

export function AiAnswersPanel({ block, onMudar }: { block: Block; onMudar: (block: Block) => void }) {
  const list = block.$leavingCustomActions ?? [];
  const action = list.find((x) => x.type === 'ProcessAnswers') ?? novaAcao('ProcessAnswers');
  function change(key: string, value: string) {
    const next = comCampo(action, key, value);
    onMudar({ ...block, $leavingCustomActions: list.includes(action) ? list.map((x) => x === action ? next : x) : [...list, next] });
  }
  return <section aria-label="AI Answers">
    <AssistantPicker value={fieldValue(action, 'AssistantId')} onChange={(value) => change('AssistantId', value)} />
    <label className="bl-campo"><span>Pergunta do usuário</span><Campo value={fieldValue(action, 'UserInput')} onChange={(e) => change('UserInput', e.target.value)} /></label>
    <label className="bl-campo"><span>Identidade do contato</span><Campo value={fieldValue(action, 'ContactId')} onChange={(e) => change('ContactId', e.target.value)} /></label>
    <p className="sub">O bloco aguarda a entrada do usuário e consulta o assistente nas ações de saída. Configure a saída padrão para continuar o fluxo.</p>
  </section>;
}
