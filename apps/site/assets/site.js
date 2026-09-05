/* Pipe — comportamento do site.
   Tema claro/escuro, menu no celular, entrada por rolagem, barra de progresso
   de leitura, sumário do artigo, botões de copiar e filtro do blog.
   Tudo opcional: cada bloco só roda se os elementos existirem na página. */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------------- tema */
  function isDark() {
    var attr = root.getAttribute("data-theme");
    if (attr === "dark") return true;
    if (attr === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function paintThemeIcons() {
    var dark = isDark();
    document.querySelectorAll("[data-icon-sun]").forEach(function (el) { el.hidden = dark; });
    document.querySelectorAll("[data-icon-moon]").forEach(function (el) { el.hidden = !dark; });
  }

  document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var next = isDark() ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("pipe-theme", next); } catch (e) {}
      paintThemeIcons();
    });
  });
  paintThemeIcons();

  /* ---------------------------------------------------------------- menu */
  var toggle = document.querySelector("[data-menu-toggle]");
  var panel = document.getElementById("menu");
  if (toggle && panel) {
    toggle.addEventListener("click", function () {
      var open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
      toggle.querySelector("use").setAttribute("href", open ? "#i-close" : "#i-menu");
    });
    panel.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        panel.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) {
        panel.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
  }

  /* ------------------------------------------------- entrada por rolagem
     O CSS só esconde os elementos quando a classe js-reveal está no <html>,
     e quem coloca essa classe é este script. Com o JavaScript bloqueado a
     página aparece inteira no primeiro quadro. */
  var alvos = document.querySelectorAll(".scroll-reveal");
  if (alvos.length && !reduzido && "IntersectionObserver" in window) {
    root.classList.add("js-reveal");
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        if (!entrada.isIntersecting) return;
        var el = entrada.target;
        el.classList.add("scroll-reveal--visible");
        obs.unobserve(el);
        el.addEventListener("transitionend", function marcar() {
          el.classList.add("scroll-reveal--done");
          el.removeEventListener("transitionend", marcar);
        });
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -10% 0px" });
    alvos.forEach(function (el) { obs.observe(el); });
  }

  /* ------------------------------------------- barra de progresso do texto */
  var progresso = document.querySelector("[data-progress] span");
  if (progresso) {
    var artigo = document.querySelector("[data-article]") || document.body;
    var pintar = function () {
      var inicio = artigo.offsetTop;
      var total = artigo.offsetHeight - window.innerHeight;
      var feito = window.scrollY - inicio;
      var pct = total > 0 ? (feito / total) * 100 : 0;
      progresso.style.width = Math.min(100, Math.max(0, pct)) + "%";
    };
    pintar();
    window.addEventListener("scroll", pintar, { passive: true });
    window.addEventListener("resize", pintar);
  }

  /* --------------------------------------------------- sumário do artigo */
  var links = document.querySelectorAll("[data-toc] a");
  if (links.length && "IntersectionObserver" in window) {
    var porId = {};
    var titulos = [];
    links.forEach(function (a) {
      var id = a.getAttribute("href").slice(1);
      var alvo = document.getElementById(id);
      if (!alvo) return;
      (porId[id] = porId[id] || []).push(a);
      titulos.push(alvo);
    });
    var ativar = function (id) {
      links.forEach(function (a) { a.classList.remove("is-active"); });
      (porId[id] || []).forEach(function (a) { a.classList.add("is-active"); });
    };
    var espiao = new IntersectionObserver(function (entradas) {
      var visiveis = entradas
        .filter(function (e) { return e.isIntersecting; })
        .sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
      if (visiveis.length) ativar(visiveis[0].target.id);
    }, { rootMargin: "-96px 0px -70% 0px", threshold: [0, 1] });
    titulos.forEach(function (h) { espiao.observe(h); });
    if (titulos.length) ativar(titulos[0].id);
  }

  /* ----------------------------------------------------- botões de copiar
     data-copy pode ser o id do elemento cujo texto vai para a área de
     transferência, ou o próprio texto quando vem em data-copy-text. */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-copy]") : null;
    if (!btn) return;
    var texto = btn.getAttribute("data-copy-text");
    if (texto === null) {
      var fonte = document.getElementById(btn.getAttribute("data-copy"));
      texto = fonte ? (fonte.value !== undefined && fonte.value !== null ? fonte.value : fonte.textContent) : "";
    }
    if (!texto) return;
    var pronto = function () {
      var rotulo = btn.querySelector("[data-copy-label]");
      if (rotulo && !rotulo.getAttribute("data-original")) {
        rotulo.setAttribute("data-original", rotulo.textContent);
      }
      btn.classList.add("is-done");
      if (rotulo) rotulo.textContent = "Copiado";
      window.setTimeout(function () {
        btn.classList.remove("is-done");
        if (rotulo) rotulo.textContent = rotulo.getAttribute("data-original");
      }, 2000);
    };
    /* A API de área de transferência falha sem foco na aba, em http sem TLS e
       em parte dos navegadores de celular. Quando ela recusa, o caminho antigo
       com textarea e execCommand ainda funciona, então ele fica como reserva. */
    function reserva() {
      var tmp = document.createElement("textarea");
      tmp.value = texto;
      tmp.setAttribute("readonly", "");
      tmp.style.position = "fixed";
      tmp.style.top = "0";
      tmp.style.opacity = "0";
      document.body.appendChild(tmp);
      tmp.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
      document.body.removeChild(tmp);
      if (ok) pronto();
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(pronto, reserva);
    } else {
      reserva();
    }
  });

  /* ------------------------------------------------- filtro do blog
     Busca por texto e filtro por categoria, tudo sobre o HTML já entregue.
     Sem JavaScript a lista aparece inteira, que é o estado correto. */
  var explorer = document.querySelector("[data-explorer]");
  if (explorer) {
    var busca = explorer.querySelector("[data-explorer-search]");
    var chips = explorer.querySelectorAll("[data-explorer-cat]");
    var itens = explorer.querySelectorAll("[data-post]");
    var destaque = explorer.querySelector("[data-explorer-featured]");
    var vazio = explorer.querySelector("[data-explorer-empty]");
    var categoria = "";

    var normalizar = function (s) {
      return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    };

    var filtrar = function () {
      var q = normalizar(busca ? busca.value.trim() : "");
      var filtrando = q.length > 0 || categoria !== "";
      var achou = 0;
      itens.forEach(function (li) {
        var cat = li.getAttribute("data-cat") || "";
        var texto = normalizar(li.getAttribute("data-busca") || li.textContent);
        var ok = (categoria === "" || cat === categoria) && (q === "" || texto.indexOf(q) !== -1);
        /* O primeiro post aparece no bloco de destaque enquanto ninguém filtra,
           então o cartão dele na grade só entra quando o destaque some. */
        if (!filtrando && li.hasAttribute("data-primeiro")) ok = false;
        li.hidden = !ok;
        if (ok) achou++;
      });
      if (destaque) destaque.hidden = filtrando;
      if (vazio) vazio.hidden = achou > 0;
    };

    if (busca) busca.addEventListener("input", filtrar);
    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        var valor = chip.getAttribute("data-explorer-cat");
        categoria = categoria === valor ? "" : valor;
        chips.forEach(function (c) {
          c.setAttribute("aria-pressed", String(c.getAttribute("data-explorer-cat") === categoria));
        });
        filtrar();
      });
    });
  }
})();
