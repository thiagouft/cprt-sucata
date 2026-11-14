(function () {
  'use strict';
  var form = document.getElementById('f');
  var err = document.getElementById('err');
  var btn = document.getElementById('btn');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    err.style.display = 'none';
    btn.disabled = true;
    fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: form.login.value, senha: form.senha.value })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok) { location.href = '/'; return; }
        err.textContent = res.d.message || 'Não foi possível entrar.';
        err.style.display = 'block';
        btn.disabled = false;
        form.senha.value = '';
        form.senha.focus();
      })
      .catch(function () {
        err.textContent = 'Sem conexão com o servidor.';
        err.style.display = 'block';
        btn.disabled = false;
      });
  });
})();
