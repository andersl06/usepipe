import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Armazenamento, ObjetoGuardado, ObjetoLido } from './porta.js';

/**
 * Backend em disco, dentro de um volume.
 *
 * A raiz é `PIPE_STORAGE_DIR`. Em produção ela é um volume do contêiner — o arquivo
 * precisa sobreviver a `docker compose up` e a troca de imagem, exatamente como o
 * banco do CRM sobrevive.
 *
 * Não existe rota estática servindo esta pasta, e isso é decisão: **quem serve o
 * arquivo é a `api`**, depois de conferir assinatura, validade e tenant. Uma pasta
 * publicada por nginx seria o "objeto público adivinhável por id" que o requisito
 * proíbe.
 */
export class ArmazenamentoEmDisco implements Armazenamento {
  private readonly raiz: string;

  constructor(raiz = process.env['PIPE_STORAGE_DIR'] ?? './.dados/storage') {
    this.raiz = resolve(raiz);
  }

  /**
   * Resolve a chave dentro da raiz e **prova que não saiu dela**.
   *
   * A conferência é depois do `resolve`, e não antes: comparar texto antes de
   * normalizar é como `../` passa. Aqui o caminho já está absoluto e normalizado
   * quando a pergunta é feita.
   */
  private caminho(chave: string): string {
    const alvo = resolve(join(this.raiz, chave));
    if (alvo !== this.raiz && !alvo.startsWith(this.raiz + sep)) {
      throw new Error('chave fora da raiz do storage');
    }
    return alvo;
  }

  async guardar(chave: string, dados: Uint8Array): Promise<ObjetoGuardado> {
    const alvo = this.caminho(chave);
    await mkdir(dirname(alvo), { recursive: true });
    await writeFile(alvo, dados);
    return { chave, bytes: dados.byteLength };
  }

  async ler(chave: string): Promise<ObjetoLido | null> {
    try {
      const dados = await readFile(this.caminho(chave));
      return { dados, bytes: dados.byteLength };
    } catch (erro) {
      // Arquivo que não existe é ausência, não falha: quem chama devolve 404.
      if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw erro;
    }
  }

  async remover(chave: string): Promise<void> {
    await rm(this.caminho(chave), { force: true });
  }
}
