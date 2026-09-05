/* Pipe — comportamento do site: tema claro/escuro e menu no celular. */
(function () {
  var root = document.documentElement;

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
})();
