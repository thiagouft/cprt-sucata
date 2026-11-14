(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var form = $('f'), err = $('err'), btn = $('btn');

  function show(msg) { err.textContent = msg; err.style.display = msg ? 'block' : 'none'; }

  // Mostra o aviso de troca obrigatória só quando for o caso
  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then(function (r) { if (r.status === 401) { location.href = '/login'; return null; } return r.json(); })
    .then(function (me) { if (me && me.deveTrocarSenha) $('forced').style.display = 'block'; });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    show('');
    if ($('nova').value !== $('conf').value) return show('A confirmação não confere com a nova senha.');
    btn.disabled = true;
    fetch('/api/auth/password', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senhaAtual: $('atual').value, novaSenha: $('nova').value })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok) { location.href = '/'; return; }
        show(res.d.message || 'Não foi possível alterar a senha.');
        btn.disabled = false;
      })
      .catch(function () { show('Sem conexão com o servidor.'); btn.disabled = false; });
  });
})();
