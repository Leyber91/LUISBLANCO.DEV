/* =========================================================================
   codex.js — the private Codex: a profile ring (top-right) that unlocks the
   owner's encrypted book (codex.enc.json) entirely client-side.
   Crypto: WebCrypto PBKDF2-SHA256 (600k) → AES-256-GCM → gunzip
   (DecompressionStream). The blob is fetched ON DEMAND (zero cost to normal
   visitors); decrypted content lives in memory only — reload re-locks.
   No services, no accounts, no third-party code (stack lock D-7).
   ========================================================================= */
(function () {
  'use strict';
  let codex = null;      // decrypted {built, sections} — memory only
  let activeIdx = 0;
  let ui = null;

  // ── chrome: the profile ring ─────────────────────────────────────────
  function mountRing() {
    const a = document.createElement('button');
    a.id = 'codexRing';
    a.type = 'button';
    a.setAttribute('aria-label', 'private codex');
    a.title = 'codex';
    a.innerHTML = '<span class="cx-dot"></span>';
    a.addEventListener('click', open);
    document.body.appendChild(a);
  }

  // ── overlay ──────────────────────────────────────────────────────────
  function open() {
    if (ui) { ui.root.hidden = false; return; }
    const root = document.createElement('div');
    root.id = 'codexOverlay';
    root.innerHTML =
      '<div class="cx-frame">' +
      '  <div class="cx-head"><span class="cx-title">THE CODEX</span>' +
      '    <span class="cx-sub" id="cxSub">sealed</span>' +
      '    <button class="cx-close" id="cxClose" type="button" aria-label="close">×</button></div>' +
      '  <div class="cx-lock" id="cxLock">' +
      '    <div class="cx-lock-inner">' +
      '      <div class="cx-lock-line">the content of this book is encrypted. it opens for one reader.</div>' +
      '      <input id="cxPass" type="password" placeholder="passphrase" autocomplete="current-password" autocapitalize="off" spellcheck="false">' +
      '      <button id="cxUnlock" type="button">unseal →</button>' +
      '      <div class="cx-err" id="cxErr"></div>' +
      '    </div></div>' +
      '  <div class="cx-body" id="cxBody" hidden>' +
      '    <nav class="cx-nav" id="cxNav"></nav>' +
      '    <article class="cx-read" id="cxRead"></article>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(root);
    ui = {
      root,
      sub: root.querySelector('#cxSub'), lock: root.querySelector('#cxLock'),
      body: root.querySelector('#cxBody'), nav: root.querySelector('#cxNav'),
      read: root.querySelector('#cxRead'), pass: root.querySelector('#cxPass'),
      err: root.querySelector('#cxErr'),
    };
    root.querySelector('#cxClose').addEventListener('click', () => { root.hidden = true; });
    root.querySelector('#cxUnlock').addEventListener('click', unseal);
    ui.pass.addEventListener('keydown', e => { if (e.key === 'Enter') unseal(); });
    if (codex) showBook();
    ui.pass.focus();
  }

  // ── crypto ───────────────────────────────────────────────────────────
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function unseal() {
    const pw = ui.pass.value;
    if (!pw) return;
    ui.err.textContent = ''; ui.sub.textContent = 'fetching…';
    try {
      const res = await fetch('codex.enc.json', { cache: 'force-cache' });
      if (!res.ok) throw new Error('blob not found');
      const blob = await res.json();
      ui.sub.textContent = 'deriving key…';
      const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: b64(blob.salt), iterations: blob.iter, hash: 'SHA-256' },
        keyMat, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      ui.sub.textContent = 'unsealing…';
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(blob.iv) }, key, b64(blob.ct));
      const ds = new DecompressionStream('gzip');
      const text = await new Response(new Blob([plain]).stream().pipeThrough(ds)).text();
      codex = JSON.parse(text);
      showBook();
    } catch (e) {
      ui.sub.textContent = 'sealed';
      ui.err.textContent = (e.name === 'OperationError') ? 'wrong passphrase.' : ('cannot unseal: ' + (e.message || e.name));
    }
  }

  // ── reader ───────────────────────────────────────────────────────────
  function showBook() {
    ui.lock.hidden = true; ui.body.hidden = false;
    ui.sub.textContent = codex.sections.length + ' documents · built ' + codex.built;
    let g = '', html = '';
    codex.sections.forEach((s, i) => {
      if (s.group !== g) { g = s.group; html += '<div class="cx-grp">' + esc(g) + '</div>'; }
      html += '<button type="button" class="cx-item" data-i="' + i + '">' + esc(s.title) + '</button>';
    });
    ui.nav.innerHTML = html;
    ui.nav.addEventListener('click', e => {
      const b = e.target.closest('.cx-item'); if (!b) return;
      activeIdx = +b.dataset.i; renderDoc();
    });
    renderDoc();
  }
  function renderDoc() {
    ui.nav.querySelectorAll('.cx-item').forEach((b, i) => b.classList.toggle('on', i === activeIdx));
    ui.read.innerHTML = md(codex.sections[activeIdx].md);
    ui.read.scrollTop = 0;
  }

  // ── minimal markdown (escape-first, tables included) ─────────────────
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\*([^*]+)\*/g, '<i>$1</i>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  function md(src) {
    const lines = esc(src).split('\n');
    let out = '', inCode = false, inList = false, inTable = false, inQuote = false;
    const closeAll = () => { if (inList) { out += '</ul>'; inList = false; } if (inTable) { out += '</table>'; inTable = false; } if (inQuote) { out += '</blockquote>'; inQuote = false; } };
    for (const raw of lines) {
      const l = raw;
      if (l.startsWith('```')) { closeAll(); out += inCode ? '</pre>' : '<pre>'; inCode = !inCode; continue; }
      if (inCode) { out += l + '\n'; continue; }
      if (/^\s*\|/.test(l)) {
        if (/^\s*\|[\s:|-]+\|?\s*$/.test(l)) continue;            // separator row
        if (!inTable) { closeAll(); out += '<table>'; inTable = true; }
        out += '<tr>' + l.replace(/^\s*\||\|\s*$/g, '').split('|').map(c => '<td>' + inline(c.trim()) + '</td>').join('') + '</tr>';
        continue;
      }
      if (inTable) { out += '</table>'; inTable = false; }
      const h = l.match(/^(#{1,4})\s+(.*)$/);
      if (h) { closeAll(); out += '<h' + h[1].length + '>' + inline(h[2]) + '</h' + h[1].length + '>'; continue; }
      if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
        if (!inList) { closeAll(); out += '<ul>'; inList = true; }
        out += '<li>' + inline(l.replace(/^\s*([-*]|\d+\.)\s+/, '')) + '</li>'; continue;
      }
      if (inList) { out += '</ul>'; inList = false; }
      if (/^\s*&gt;\s?/.test(l)) {
        if (!inQuote) { out += '<blockquote>'; inQuote = true; }
        out += inline(l.replace(/^\s*&gt;\s?/, '')) + '<br>'; continue;
      }
      if (inQuote) { out += '</blockquote>'; inQuote = false; }
      if (/^\s*(---|···|\*\*\*)\s*$/.test(l)) { out += '<hr>'; continue; }
      if (l.trim() === '') { out += ''; continue; }
      out += '<p>' + inline(l) + '</p>';
    }
    closeAll(); if (inCode) out += '</pre>';
    return out;
  }

  if (document.readyState !== 'loading') mountRing();
  else document.addEventListener('DOMContentLoaded', mountRing);
})();
