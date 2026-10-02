import type { TemplateRequest } from './channels-gravar';

export interface ActionButton {
  tipo: 'url' | 'telefone';
  texto: string;
  /** URL for `url`, international number for `telefone`. */
  valor: string;
}

export interface TranslationToSend {
  idioma: string;
  texto: string;
  /** One sample per body variable, in occurrence order. */
  exemplos: string[];
  rodape: string;
  /** Quick reply labels. */
  buttons: string[];
  acoes: ActionButton[];
}

/** The single place that turns what the Contents preview shows into the submitted request. */
export function templatePayload(
  tela: { nome: string; categoria: string },
  t: TranslationToSend,
): TemplateRequest {
  const rodape = t.rodape.trim();
  const acoes = t.acoes.filter((a) => a.texto.trim() || a.valor.trim());
  if (acoes.some((a) => !a.texto.trim() || !a.valor.trim())) {
    throw new Error('Ação do template sem texto ou sem URL/telefone.');
  }
  const botoes: NonNullable<TemplateRequest['botoes']> = [
    ...t.buttons.filter((b) => b.trim()).map((b) => ({ tipo: 'resposta' as const, texto: b.trim() })),
    ...acoes.map((a) =>
      a.tipo === 'url'
        ? { tipo: 'url' as const, texto: a.texto.trim(), url: a.valor.trim() }
        : { tipo: 'telefone' as const, texto: a.texto.trim(), telefone: a.valor.trim() },
    ),
  ];
  return {
    name: tela.nome,
    idioma: t.idioma,
    category: tela.categoria,
    body: t.texto,
    exemplos: t.exemplos,
    ...(rodape ? { rodape } : {}),
    ...(botoes.length ? { botoes } : {}),
  };
}
