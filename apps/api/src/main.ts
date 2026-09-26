import { upApi } from './servidor.js';

const api = await upApi();
console.log(`[api] no ar em ${api.url}`);

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinal, () => void api.fechar().then(() => process.exit(0)));
}
