/* ============================================================
   ai/route-panel.js — the pill that says which route answered,
   and the small panel where a visitor can bring their own key.

   Usage:
     import { mountRoutePanel } from './ai/route-panel.js';
     mountRoutePanel(document.querySelector('#route'));

   The key is stored in this browser's localStorage and sent only
   to the endpoint the visitor typed. Nothing reaches this site.
   ============================================================ */

import { LLM } from './llm.js';

const CSS = `
.lbr{position:relative;display:inline-flex;font:500 11px/1 var(--font-mono,'IBM Plex Mono',monospace);letter-spacing:.06em}
.lbr-pill{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border:1px solid var(--line-bright,#2C3744);
  border-radius:999px;background:rgba(6,8,13,.72);color:var(--text-dim,#79828F);cursor:pointer;text-transform:lowercase}
.lbr-pill:hover{border-color:var(--accretion-dim,#97681F);color:var(--text,#C5CCD8)}
.lbr-dot{width:7px;height:7px;border-radius:50%;background:var(--text-faint,#424B57);flex:none}
.lbr[data-route="ollama"] .lbr-dot,.lbr[data-route="own-key"] .lbr-dot,.lbr[data-route="worker"] .lbr-dot{background:var(--ok,#6FCF8E)}
.lbr[data-route="pollinations"] .lbr-dot{background:var(--accretion,#D4A24C);box-shadow:0 0 8px var(--accretion-glow,rgba(212,162,76,.45))}
.lbr[data-route="pollinations"][data-wait="1"] .lbr-dot{background:var(--horizon-dim,#565D72);box-shadow:none}
.lbr[data-route="offline"] .lbr-dot{background:var(--horizon-dim,#565D72)}
.lbr-panel{position:absolute;right:0;top:calc(100% + 8px);width:min(340px,86vw);padding:14px;z-index:400;
  background:var(--surface,#0B0E13);border:1px solid var(--line-bright,#2C3744);border-radius:8px;color:var(--text,#C5CCD8);
  box-shadow:0 18px 40px -16px rgba(0,0,0,.8);text-transform:none;letter-spacing:.02em;line-height:1.5}
.lbr-panel h4{margin:0 0 6px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-bright,#EAF0FB)}
.lbr-panel p{margin:0 0 10px;font-size:11px;color:var(--text-dim,#79828F)}
.lbr-panel label{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-dim,#79828F);margin:8px 0 4px}
.lbr-panel input{width:100%;box-sizing:border-box;padding:7px 9px;background:var(--surface-3,#18202B);border:1px solid var(--line,#1C232F);
  border-radius:4px;color:var(--text-bright,#EAF0FB);font:12px var(--font-mono,'IBM Plex Mono',monospace)}
.lbr-row{display:flex;gap:8px;margin-top:12px}
.lbr-row button{flex:1;padding:8px;border:1px solid var(--line-bright,#2C3744);border-radius:4px;background:transparent;
  color:var(--text,#C5CCD8);font:500 11px var(--font-mono,'IBM Plex Mono',monospace);letter-spacing:.08em;cursor:pointer}
.lbr-row button.go{border-color:var(--accretion-dim,#97681F);color:var(--accretion-soft,#F0C674)}
.lbr-row button:hover{border-color:var(--accretion,#D4A24C)}
.lbr-routes{margin:0 0 10px;padding:0;list-style:none;font-size:11px}
.lbr-routes li{display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px dashed var(--line,#1C232F)}
.lbr-routes li b{font-weight:500;color:var(--text-bright,#EAF0FB)}
.lbr-routes li.on b{color:var(--accretion-soft,#F0C674)}
`;

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

const el = (tag, attrs = {}, text = '') => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text) n.textContent = text;
  return n;
};

export function mountRoutePanel(host) {
  if (!host) return null;
  style();
  const root = el('span', { class: 'lbr', 'data-route': 'unknown' });
  const pill = el('button', { class: 'lbr-pill', type: 'button', 'aria-expanded': 'false', 'aria-haspopup': 'dialog' });
  const dot = el('span', { class: 'lbr-dot', 'aria-hidden': 'true' });
  const label = el('span', { class: 'lbr-label' }, 'model: detecting');
  pill.append(dot, label);

  const panel = el('form', { class: 'lbr-panel', role: 'dialog', 'aria-label': 'Model route' });
  panel.addEventListener('submit', (e) => e.preventDefault());
  panel.hidden = true;
  panel.innerHTML = `
    <h4>Model route</h4>
    <p>This page is static and holds no key. It asks the first route that answers.</p>
    <ol class="lbr-routes">
      <li data-r="ollama"><b>your machine</b><span>Ollama, when served locally</span></li>
      <li data-r="own-key"><b>your key</b><span>any OpenAI-compatible API</span></li>
      <li data-r="pollinations"><b>public</b><span>1 reply / 45 s per IP</span></li>
      <li data-r="offline"><b>offline</b><span>the lab's own engine</span></li>
    </ol>
    <p>Bring a key to lift the 45-second limit. It stays in this browser's storage and goes only to the address below.</p>
    <label for="lbr-base">API base URL</label>
    <input id="lbr-base" placeholder="https://openrouter.ai/api/v1" autocomplete="off" spellcheck="false">
    <label for="lbr-model">Model</label>
    <input id="lbr-model" placeholder="meta-llama/llama-3.3-70b-instruct" autocomplete="off" spellcheck="false">
    <label for="lbr-key">Key</label>
    <input id="lbr-key" type="password" placeholder="sk-..." autocomplete="off" spellcheck="false">
    <div class="lbr-row"><button type="button" class="go" data-act="save">Use my key</button><button type="button" data-act="clear">Forget key</button></div>`;
  root.append(pill, panel);
  host.appendChild(root);

  const own = LLM.ownKey();
  if (own) {
    panel.querySelector('#lbr-base').value = own.base;
    panel.querySelector('#lbr-model').value = own.model;
  }

  const toggle = (open) => {
    panel.hidden = !open;
    pill.setAttribute('aria-expanded', String(open));
  };
  pill.addEventListener('click', () => toggle(panel.hidden));
  document.addEventListener('click', (e) => { if (!root.contains(e.target)) toggle(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });

  panel.addEventListener('click', async (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (act === 'save') {
      const base = panel.querySelector('#lbr-base').value.trim();
      const model = panel.querySelector('#lbr-model').value.trim();
      const key = panel.querySelector('#lbr-key').value.trim();
      if (!base || !model || !key) return;
      panel.querySelector('#lbr-key').value = '';
      await LLM.setOwnKey({ base, key, model });
      toggle(false);
    } else if (act === 'clear') {
      await LLM.clearOwnKey();
      toggle(false);
    }
  });

  LLM.onStatus((s) => {
    root.dataset.route = s.route;
    root.dataset.wait = s.readyIn > 0 ? '1' : '0';
    label.textContent = s.label;
    panel.querySelectorAll('.lbr-routes li').forEach((li) => li.classList.toggle('on', li.dataset.r === s.route));
  });
  LLM.detect();
  return root;
}
