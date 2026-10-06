/* Pipe - landing page behaviour: preselects the contact subject from the CTA
   that was clicked, and keeps the placeholder contact form from submitting. */
(function () {
  "use strict";
  var campo = document.querySelector("[data-assunto-campo]");

  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("[data-assunto]") : null;
    if (!a || !campo) return;
    var v = a.getAttribute("data-assunto");
    if (v === "teste" || v === "especialista") campo.value = v;
  });

  var form = document.querySelector("[data-contato]");
  var msg = document.querySelector("[data-contato-msg]");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (msg) msg.textContent = "Este formulário ainda está sendo conectado. Por enquanto, use o chat desta página.";
    });
  }
})();
