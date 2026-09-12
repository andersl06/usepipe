import { subirPonte } from './servidor.js';

const ponte = await subirPonte();
console.log(`[ponte] no ar em ${ponte.url} — a cópia manda comando em POST /comandos`);

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinal, () => void ponte.fechar().then(() => process.exit(0)));
}
