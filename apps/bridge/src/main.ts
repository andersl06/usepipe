import { startBridge } from './servidor.js';

const bridge = await startBridge();
console.log(`[ponte] no ar em ${bridge.url} — a cópia manda comando em POST /comandos`);

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinal, () => void bridge.fechar().then(() => process.exit(0)));
}
