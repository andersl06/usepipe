import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Storage, ObjetoGuardado, ObjetoLido } from './porta.js';

/**
 * Disk backend inside a volume.
 *
 * The root is `PIPE_STORAGE_DIR`. In production it is a container volume: files must survive `docker compose up` and image replacement, just as the CRM database does.
 *
 * There is deliberately no static route serving this directory: **the `api` serves files** only after checking signature, expiry, and tenant. Publishing the directory through nginx would create the guessable public object ID forbidden by the requirement.
 */
export class StorageInDisk implements Storage {
  private readonly raiz: string;

  constructor(raiz = process.env['PIPE_STORAGE_DIR'] ?? './.dados/storage') {
    this.raiz = resolve(raiz);
  }

  /**
   * Resolve the key within the root and **prove it did not escape**.
   *
   * Check after `resolve`, not before: comparing path text before normalization lets `../` through. At this point the path is already absolute and normalized.
   */
  private caminho(key: string): string {
    const alvo = resolve(join(this.raiz, key));
    if (alvo !== this.raiz && !alvo.startsWith(this.raiz + sep)) {
      throw new Error('chave fora da raiz do storage');
    }
    return alvo;
  }

  async guardar(chave: string, data: Uint8Array): Promise<ObjetoGuardado> {
    const alvo = this.caminho(chave);
    await mkdir(dirname(alvo), { recursive: true });
    await writeFile(alvo, data);
    return { key: chave, bytes: data.byteLength };
  }

  async ler(chave: string): Promise<ObjetoLido | null> {
    try {
      const data = await readFile(this.caminho(chave));
      return { data, bytes: data.byteLength };
    } catch (error) {
      // A missing file means absence, not failure: the caller returns 404.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async remover(chave: string): Promise<void> {
    await rm(this.caminho(chave), { force: true });
  }
}
