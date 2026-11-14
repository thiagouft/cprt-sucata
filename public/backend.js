/* Cliente do backend Node/PostgreSQL.
   Expõe window.backend.use(nome) com as mesmas interfaces que a tela já usa:
   db (collection/doc + onSnapshot em tempo real via SSE), user, sample (leitura de fotos por IA),
   assets (upload de fotos/PDF) e downloads (salvar CSV). */
(function () {
  'use strict';

  async function api(method, url, body, isBlob) {
    const opt = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) {
      if (isBlob) { opt.body = body; opt.headers['Content-Type'] = body.type || 'application/octet-stream'; }
      else { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
    }
    const r = await fetch(url, opt);
    if (r.status === 401) { location.href = '/login'; throw { code: 'unauthenticated' }; }
    let data = null;
    try { data = await r.json(); } catch (e) { /* sem corpo */ }
    if (r.status === 403 && data && data.code === 'password_change_required') { location.href = '/trocar-senha'; throw { code: data.code }; }
    if (!r.ok) throw Object.assign(new Error((data && data.message) || r.statusText), { code: (data && data.code) || 'http_' + r.status });
    return data;
  }

  /* ---------- Tempo real (Server-Sent Events) ---------- */
  const listeners = new Set();
  let es = null;
  function ensureEvents() {
    if (es) return;
    es = new EventSource('/api/events');
    es.onmessage = ev => {
      let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      listeners.forEach(fn => { try { fn(msg); } catch (e) { console.error(e); } });
    };
    es.onerror = () => { /* o navegador reconecta sozinho */ };
    es.addEventListener('open', () => listeners.forEach(fn => fn({ type: 'reconnect' })));
  }
  const mkDoc = (id, data) => ({ id, exists: data != null, data: () => data });

  /* ---------- db ---------- */
  const db = {
    collection(name) {
      if (name !== 'tickets') throw new Error('Coleção desconhecida: ' + name);
      return {
        onSnapshot(onNext, onError) {
          let cache = {};
          const emit = fromCache => onNext({ docs: Object.keys(cache).map(id => mkDoc(id, cache[id])), metadata: { fromCache } });
          const full = () => api('GET', '/api/tickets')
            .then(list => { cache = {}; list.forEach(t => { cache[t.id] = t; }); emit(false); })
            .catch(e => onError && onError(e));
          const fn = msg => {
            if (msg.type === 'reconnect') return full();
            if (msg.type !== 'ticket') return;
            if (msg.deleted) delete cache[msg.id];
            else if (msg.data) cache[msg.id] = msg.data;
            emit(false);
          };
          listeners.add(fn); ensureEvents(); full();
          return () => listeners.delete(fn);
        }
      };
    },
    doc(path) {
      const [col, id] = path.split('/');
      if (col === 'tickets') {
        return {
          set: data => api('PUT', '/api/tickets/' + encodeURIComponent(id), data),
          delete: () => api('DELETE', '/api/tickets/' + encodeURIComponent(id))
        };
      }
      if (col === 'config') {
        return {
          set: data => api('PUT', '/api/config', data),
          onSnapshot(onNext, onError) {
            const full = () => api('GET', '/api/config').then(d => onNext(mkDoc('main', d))).catch(e => onError && onError(e));
            const fn = msg => { if (msg.type === 'config') onNext(mkDoc('main', msg.data)); else if (msg.type === 'reconnect') full(); };
            listeners.add(fn); ensureEvents(); full();
            return () => listeners.delete(fn);
          }
        };
      }
      throw new Error('Documento desconhecido: ' + path);
    }
  };

  /* ---------- user ---------- */
  let mePromise = null;
  const me = () => (mePromise = mePromise || api('GET', '/api/auth/me'));
  const user = {
    id: async () => (await me()).id,
    name: async () => (await me()).nome,
    permissions: async () => (await me()).permissions,
    isMaster: async () => (await me()).master === true,
    canEdit: async () => (await me()).permissions.includes('ajustes:editar')
  };

  /* ---------- sample (leitura de imagem por IA, via servidor) ---------- */
  const sample = {
    limits: async () => api('GET', '/api/ocr/limits'),
    async json(prompt, opts) {
      const img = opts && opts.images && opts.images[0];
      if (!img) throw { code: 'no_image' };
      const fd = new FormData();
      const m = /O tipo esperado para esta foto é "(\w+)"/.exec(prompt || '');
      if (m) fd.append('esperado', m[1]);
      fd.append('image', img, 'foto.jpg');
      const r = await fetch('/api/ocr', { method: 'POST', body: fd, credentials: 'same-origin' });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw { code: (d && d.code) || 'ocr_error', message: d && d.message };
      return d;
    }
  };

  /* ---------- assets ---------- */
  const assets = {
    async upload(blob) {
      const d = await api('POST', '/api/files', blob, true);
      return { id: d.id, url: '/_blob/' + d.id };
    }
  };

  /* ---------- downloads ---------- */
  const downloads = {
    async save({ filename, data, mimeType }) {
      const b = data instanceof Blob ? data : new Blob([data], { type: mimeType || 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = filename || 'arquivo';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
  };

  const caps = { db, user, sample, assets, downloads };
  window.backend = {
    use: async n => {
      if (n === 'sample') {
        const l = await sample.limits().catch(() => null);
        return l && l.images ? sample : null;
      }
      if (n === 'user') { await me(); }
      return caps[n] || null;
    }
  };
})();
