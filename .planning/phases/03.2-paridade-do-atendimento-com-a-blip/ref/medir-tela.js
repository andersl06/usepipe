/*
 * Medição de tela para a verificação visual lado a lado (Atendimento Blip x Pipe).
 *
 * Uso no console do navegador: cole este arquivo inteiro, depois chame
 *   medirTela({ no: '.diagram-node', painel: '#node-content-tab' })
 * O resultado é impresso como JSON e devolvido. Para cada nome, mede o PRIMEIRO
 * elemento que casa com o seletor; seletor sem elemento sai como null.
 *
 * Só lê geometria e estilo computado. Não lê credenciais, armazenamento local nem rede, e não
 * clica em nada (na Blip, não clicar em nada que grave).
 */
function medirTela(mapa) {
  const props = [
    'color',
    'background-color',
    'border-color',
    'border-width',
    'border-radius',
    'box-shadow',
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'padding',
    'stroke',
    'stroke-width',
    'fill',
  ];
  const saida = {};
  for (const [nome, seletor] of Object.entries(mapa)) {
    const el = document.querySelector(seletor);
    if (!el) {
      saida[nome] = null;
      continue;
    }
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const estilo = {};
    for (const p of props) estilo[p] = cs.getPropertyValue(p);
    saida[nome] = {
      seletor,
      x: Math.round(r.x * 10) / 10,
      y: Math.round(r.y * 10) / 10,
      width: Math.round(r.width * 10) / 10,
      height: Math.round(r.height * 10) / 10,
      estilo,
    };
  }
  console.log(JSON.stringify(saida, null, 2));
  return saida;
}
