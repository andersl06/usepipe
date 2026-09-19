import { api, ErroDaApi } from '../../../../lib/api';
import { atualizarLeituras } from '../../../../lib/acoes';
import { IMAGEM } from '../../../criar/regras-de-nome';

/**
 * As duas escritas de "Editar Fluxo": `PATCH /v1/gestao/fluxos/:id` (o
 * "Salvar") e `DELETE /v1/gestao/fluxos/:id` (o "Excluir fluxo"). A regra
 * mora na `api` (`dominio/gestao/ciclo-de-vida-do-fluxo.ts`); aqui a foto vira
 * `data:` para atravessar o JSON, como em `criar/gravar.ts`, e a recusa vira
 * texto para a tela.
 */

/** O que o PATCH devolve (`FluxoGravado` na `api`). */
export interface FluxoGravado {
  id: string;
  nome: string;
  descricao: string | null;
  imagemUrl: string | null;
  shortName: string | null;
}

export interface EdicaoBasica {
  nome: string;
  descricao: string;
  /** `File` novo troca a foto; `null` tira; `undefined` deixa como está. */
  imagem: File | null | undefined;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

export async function salvarBasicas(
  id: string,
  edicao: EdicaoBasica,
): Promise<Resultado<FluxoGravado>> {
  const imagem = edicao.imagem === undefined ? undefined : await lerImagem(edicao.imagem);
  if (edicao.imagem instanceof File && imagem === null) {
    const tipos = IMAGEM.aceitos.join(', ');
    const teto = Math.round(IMAGEM.maxBytes / 1024);
    return { ok: false, erro: `A imagem precisa ser ${tipos} e ter até ${teto} KB.` };
  }
  try {
    const valor = await api.patch<FluxoGravado>(`/v1/gestao/fluxos/${id}`, {
      nome: edicao.nome,
      descricao: edicao.descricao,
      ...(imagem === undefined ? {} : { imagem }),
    });
    atualizarLeituras();
    return { ok: true, valor };
  } catch (erro) {
    /* `onAdvancedConfigurationError` deles, para quando a `api` não disse o motivo. */
    return { ok: false, erro: motivoDe(erro, 'Ocorreu um erro ao salvar a configuração') };
  }
}

export async function excluirFluxo(id: string): Promise<Resultado<void>> {
  try {
    await api.delete<void>(`/v1/gestao/fluxos/${id}`);
    atualizarLeituras();
    return { ok: true, valor: undefined };
  } catch (erro) {
    /* `deleteErrorMessage` deles. */
    return { ok: false, erro: motivoDe(erro, 'Ocorreu um erro ao tentar excluir o fluxo') };
  }
}

/** O `erro.mensagem` que a `api` põe no corpo (`ErroPipe`), ou o texto padrão. */
function motivoDe(erro: unknown, padrao: string): string {
  if (erro instanceof ErroDaApi) {
    const corpo = erro.corpo as { erro?: { mensagem?: unknown } } | null;
    const mensagem = corpo?.erro?.mensagem;
    if (typeof mensagem === 'string' && mensagem) return mensagem;
  }
  return padrao;
}

/** O arquivo em `data:`. `null` quando não é arquivo, está vazio ou passou do teto. */
function lerImagem(arquivo: File | null): Promise<string | null> {
  if (!(arquivo instanceof File) || arquivo.size === 0 || arquivo.size > IMAGEM.maxBytes) {
    return Promise.resolve(null);
  }
  return new Promise((resolver) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(typeof leitor.result === 'string' ? leitor.result : null);
    leitor.onerror = () => resolver(null);
    leitor.readAsDataURL(arquivo);
  });
}
