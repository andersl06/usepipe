import { api } from '../../lib/api';
import { atualizarLeituras } from '../../lib/acoes';
import { IMAGEM, type RecadosDoNome } from './regras-de-nome';

/**
 * Criar um contato (fluxo ou roteador): `POST /v1/gestao/fluxos`.
 *
 * A validação de nome, a permissão e a leitura da foto pelos bytes ficam na
 * `api` (`gestao-fluxo.ts` → `dominio/gestao/ciclo-de-vida-do-fluxo.ts`), com
 * as regras de `regras-de-nome.ts`. Aqui a foto só vira `data:` para
 * atravessar o JSON — e nem vai se já passou do teto.
 */
export type Resultado = { id: string; erro?: undefined } | { id?: undefined; erro: string };

export interface OpcoesDaGravacao {
  tipo: 'fluxo' | 'roteador';
  recados: RecadosDoNome & { nomeEmUso: string; semPermissao: string };
}

export async function gravarContato(
  dados: FormData,
  { tipo, recados }: OpcoesDaGravacao,
): Promise<Resultado> {
  const imagem = await lerImagem(dados.get('imagem'));
  try {
    const resultado = await api.post<Resultado>('/v1/gestao/fluxos', {
      nome: String(dados.get('nome') ?? ''),
      tipo,
      imagem,
      recados,
    });
    if (resultado.id) atualizarLeituras();
    return resultado;
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : 'Não foi possível criar.' };
  }
}

async function lerImagem(campo: FormDataEntryValue | null): Promise<string | null> {
  /* Campo vazio chega como um `File` de zero byte, e não como `null`. */
  if (!(campo instanceof File) || campo.size === 0) return null;
  if (campo.size > IMAGEM.maxBytes) return null;
  return new Promise((resolver) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(typeof leitor.result === 'string' ? leitor.result : null);
    leitor.onerror = () => resolver(null);
    leitor.readAsDataURL(campo);
  });
}
