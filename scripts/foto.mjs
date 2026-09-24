/* Tira uma foto de uma URL com o Chromium do Playwright: node foto.mjs URL SAIDA [cookie] [largura] [altura]
   Usa o playwright-core do cache do npx (não é dependência do projeto). */
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
const require = createRequire(import.meta.url);
const { chromium } = require(
  homedir() + '/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright-core',
);

const [url, saida, cookie, largura = '1280', altura = '780'] = process.argv.slice(2);
const navegador = await chromium.launch({ executablePath: homedir() + '/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  // A política da empresa bloqueia o Chrome aberto com --disable-extensions.
  ignoreDefaultArgs: ['--disable-extensions'] });
const ctx = await navegador.newContext({ viewport: { width: +largura, height: +altura }, deviceScaleFactor: 1 });
if (cookie) {
  const [nome, valor] = cookie.split('=');
  await ctx.addCookies([{ name: nome, value: valor, url: new URL(url).origin }]);
}
/* LOCAL='chave=valor,chave2=valor2' grava no localStorage antes de a página carregar */
if (process.env.LOCAL) {
  const pares = process.env.LOCAL.split(',').map((p) => p.split('='));
  await ctx.addInitScript((ps) => ps.forEach(([k, v]) => localStorage.setItem(k, v)), pares);
}
const pagina = await ctx.newPage();
const erros = [];
pagina.on('console', (m) => m.type() === 'error' && erros.push(m.text().slice(0, 200)));
pagina.on('pageerror', (e) => erros.push('pageerror: ' + String(e.message ?? e).slice(0, 300)));
await pagina.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => console.log('goto:', e.message));
await pagina.waitForTimeout(+(process.env.ESPERA ?? 2500));
if (process.env.CLIQUE) {
  for (const sel of process.env.CLIQUE.split('|')) {
    await pagina.click(sel, { timeout: 5000 }).catch((e) => console.log('clique', sel, e.message.split('\n')[0]));
    await pagina.waitForTimeout(800);
  }
}
if (process.env.MEDIR) {
  const medidas = await pagina.evaluate((sels) =>
    sels.split('|').map((s) => {
      const el = document.querySelector(s);
      if (!el) return s + ': —';
      const r = el.getBoundingClientRect();
      const c = getComputedStyle(el);
      return `${s}: ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} font ${c.fontSize}/${c.fontWeight} pad ${c.padding} color ${c.color} bg ${c.backgroundColor}`;
    }),
  process.env.MEDIR);
  console.log(medidas.join('\n'));
}
await pagina.screenshot({ path: saida, fullPage: !!process.env.INTEIRA });
console.log('foto:', saida, 'url final:', pagina.url(), erros.length ? '\nerros: ' + erros.slice(0, 5).join('\n') : '');
await navegador.close();
