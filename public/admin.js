(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var state = { me: null, users: [], roles: [], catalog: [], editingUser: null, editingRole: null };

  function can(p) { return state.me && state.me.permissions.indexOf(p) >= 0; }
  function isMaster() { return !!(state.me && state.me.master); }

  function api(method, url, body) {
    var opt = { method: method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
    return fetch(url, opt).then(function (r) {
      if (r.status === 401) { location.href = '/login'; throw new Error('unauthenticated'); }
      return r.json().catch(function () { return null; }).then(function (d) {
        if (!r.ok) throw new Error((d && d.message) || r.statusText);
        return d;
      });
    });
  }

  function el(tag, props, children) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') n.textContent = props[k];
      else if (k === 'class') n.className = props[k];
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), props[k]);
      else n.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  var toastTimer;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.style.display = 'block';
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.style.display = 'none'; }, 3000);
  }

  function showError(id, msg) { var e = $(id); e.textContent = msg; e.style.display = msg ? 'block' : 'none'; }

  /* ---------------- Usuários ---------------- */
  function renderUsers() {
    var body = $('users-body'); body.textContent = '';
    state.users.forEach(function (u) {
      var actions = el('td', {});
      if (isMaster()) {
        actions.appendChild(el('button', { class: 'btn sec sm', text: 'Editar', onclick: function () { openUser(u); } }));
        actions.appendChild(el('button', { class: 'btn sec sm', style: 'margin-left:6px', text: 'Redefinir senha', onclick: function () { resetPassword(u); } }));
      }
      body.appendChild(el('tr', {}, [
        el('td', { text: u.nome }),
        el('td', { text: u.login }),
        el('td', {}, [el('span', { class: 'tag', text: u.perfil.nome })]),
        el('td', {}, [
          el('span', { class: 'tag ' + (u.ativo ? 'ok' : 'off'), text: u.ativo ? 'Ativo' : 'Inativo' }),
          u.deveTrocarSenha ? el('span', { class: 'tag', style: 'margin-left:6px', text: 'Troca de senha pendente' }) : null
        ]),
        actions
      ]));
    });
  }

  function fillRoleSelect(selected) {
    var s = $('u-perfil'); s.textContent = '';
    state.roles.forEach(function (r) {
      var o = el('option', { value: r.id, text: r.nome });
      if (r.id === selected) o.selected = true;
      s.appendChild(o);
    });
  }

  function openUser(u) {
    state.editingUser = u || null;
    showError('user-err', '');
    $('user-title').textContent = u ? 'Editar usuário' : 'Novo usuário';
    $('u-nome').value = u ? u.nome : '';
    $('u-login').value = u ? u.login : '';
    $('u-login').disabled = !!u;
    $('u-senha').value = '';
    $('u-senha').required = !u;
    $('u-senha-wrap').hidden = !!u;
    $('u-ativo-wrap').hidden = !u;
    $('u-ativo').checked = u ? u.ativo : true;
    fillRoleSelect(u ? u.perfilId : (state.roles[0] && state.roles[0].id));
    $('dlg-user').showModal();
  }

  function saveUser(e) {
    e.preventDefault();
    showError('user-err', '');
    var u = state.editingUser;
    var req;
    if (u) {
      var patch = { nome: $('u-nome').value, perfilId: $('u-perfil').value, ativo: $('u-ativo').checked };
      req = api('PATCH', '/api/usuarios/' + u.id, patch);
    } else {
      req = api('POST', '/api/usuarios', { nome: $('u-nome').value, login: $('u-login').value, perfilId: $('u-perfil').value, senha: $('u-senha').value });
    }
    $('user-save').disabled = true;
    req.then(function () { $('dlg-user').close(); toast('Usuário salvo.'); return loadAll(); })
      .catch(function (err) { showError('user-err', err.message); })
      .then(function () { $('user-save').disabled = false; });
  }

  function resetPassword(u) {
    if (!confirm('Redefinir a senha de "' + u.nome + '"? Será gerada uma senha temporária e o usuário terá de trocá-la no próximo acesso.')) return;
    api('POST', '/api/usuarios/' + u.id + '/redefinir-senha').then(function (r) {
      $('tmp-login').textContent = r.login;
      $('tmp-pass').textContent = r.senhaTemporaria;
      $('dlg-temp').showModal();
      return loadAll();
    }).catch(function (err) { toast(err.message); });
  }

  /* ---------------- Perfis ---------------- */
  function groupedCatalog() {
    var groups = {}, order = [];
    state.catalog.forEach(function (p) {
      if (!groups[p.menu]) { groups[p.menu] = []; order.push(p.menu); }
      groups[p.menu].push(p);
    });
    return order.map(function (m) { return { menu: m, items: groups[m] }; });
  }

  function renderRoles() {
    var list = $('roles-list'); list.textContent = '';
    state.roles.forEach(function (r) {
      var actions = el('div', { class: 'actions' });
      var isAdmin = r.nome === 'Administrador';
      if (can('perfis:gerenciar') && !isAdmin) {
        actions.appendChild(el('button', { class: 'btn sec sm', text: 'Editar', onclick: function () { openRole(r); } }));
        if (!r.sistema) actions.appendChild(el('button', { class: 'btn danger sm', text: 'Excluir', onclick: function () { removeRole(r); } }));
      }
      var perms = r.permissoes.map(function (k) {
        var p = state.catalog.filter(function (c) { return c.chave === k; })[0];
        return el('span', { class: 'tag', text: p ? p.menu + ' · ' + k.split(':')[1] : k });
      });
      list.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'bar' }, [
          el('div', {}, [el('h2', { text: r.nome }), el('div', { class: 'muted', text: (r.descricao || 'Sem descrição') + ' · ' + r.usuarios + ' usuário(s)' + (isAdmin ? ' · acesso total (fixo)' : '') })]),
          actions
        ]),
        el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, perms)
      ]));
    });
  }

  function openRole(r) {
    state.editingRole = r || null;
    showError('role-err', '');
    $('role-title').textContent = r ? 'Editar perfil' : 'Novo perfil';
    $('r-nome').value = r ? r.nome : '';
    $('r-nome').disabled = !!(r && r.sistema);
    $('r-desc').value = r ? r.descricao : '';
    var box = $('r-perms'); box.textContent = '';
    groupedCatalog().forEach(function (g) {
      var grp = el('div', { class: 'perm-group' }, [el('b', { text: g.menu })]);
      g.items.forEach(function (p) {
        var cb = el('input', { type: 'checkbox', value: p.chave });
        if (r && r.permissoes.indexOf(p.chave) >= 0) cb.checked = true;
        grp.appendChild(el('label', { class: 'perm' }, [cb, el('span', { text: p.descricao })]));
      });
      box.appendChild(grp);
    });
    $('dlg-role').showModal();
  }

  function saveRole(e) {
    e.preventDefault();
    showError('role-err', '');
    var perms = Array.prototype.map.call($('r-perms').querySelectorAll('input:checked'), function (i) { return i.value; });
    var r = state.editingRole;
    var body = { descricao: $('r-desc').value, permissoes: perms };
    if (!r || !r.sistema) body.nome = $('r-nome').value;
    $('role-save').disabled = true;
    api(r ? 'PATCH' : 'POST', r ? '/api/perfis/' + r.id : '/api/perfis', body)
      .then(function () { $('dlg-role').close(); toast('Perfil salvo.'); return loadAll(); })
      .catch(function (err) { showError('role-err', err.message); })
      .then(function () { $('role-save').disabled = false; });
  }

  function removeRole(r) {
    if (!confirm('Excluir o perfil "' + r.nome + '"?')) return;
    api('DELETE', '/api/perfis/' + r.id).then(function () { toast('Perfil excluído.'); return loadAll(); }).catch(function (err) { toast(err.message); });
  }

  /* ---------------- Início ---------------- */
  function selectTab(name) {
    $('tab-users').setAttribute('aria-selected', String(name === 'users'));
    $('tab-roles').setAttribute('aria-selected', String(name === 'roles'));
    $('panel-users').hidden = name !== 'users';
    $('panel-roles').hidden = name !== 'roles';
  }

  function loadAll() {
    var jobs = [api('GET', '/api/perfis'), api('GET', '/api/perfis/permissoes')];
    jobs.push(isMaster() ? api('GET', '/api/usuarios') : Promise.resolve([]));
    return Promise.all(jobs).then(function (r) {
      state.roles = r[0]; state.catalog = r[1]; state.users = r[2];
      renderUsers(); renderRoles();
    });
  }

  $('tab-users').addEventListener('click', function () { selectTab('users'); });
  $('tab-roles').addEventListener('click', function () { selectTab('roles'); });
  $('new-user').addEventListener('click', function () { openUser(null); });
  $('new-role').addEventListener('click', function () { openRole(null); });
  $('temp-close').addEventListener('click', function () { $('tmp-pass').textContent = ''; $('dlg-temp').close(); });
  $('temp-copy').addEventListener('click', function () {
    var t = $('tmp-pass').textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Senha copiada.'); }, function () { toast('Selecione e copie manualmente.'); });
  });
  $('user-cancel').addEventListener('click', function () { $('dlg-user').close(); });
  $('role-cancel').addEventListener('click', function () { $('dlg-role').close(); });
  $('form-user').addEventListener('submit', saveUser);
  $('form-role').addEventListener('submit', saveRole);

  api('GET', '/api/auth/me').then(function (me) {
    state.me = me;
    var showUsers = isMaster(), showRoles = can('perfis:ver');
    $('tab-users').hidden = !showUsers; $('tab-roles').hidden = !showRoles;
    $('new-user').hidden = !isMaster(); $('new-role').hidden = !can('perfis:gerenciar');
    selectTab(showUsers ? 'users' : 'roles');
    return loadAll();
  }).catch(function (err) { toast(err.message); });
})();
