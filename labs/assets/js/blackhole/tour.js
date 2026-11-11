/* ============================================================
   blackhole/tour.js — the guided tour and the idle caption.
   Stops come from config.js; their numbers are filled from the
   live model each time the caption is drawn, so a visitor who
   moves a slider mid-tour reads the new values.
   ============================================================ */

import { TOUR, VIEWS, COLOR_MODES } from './config.js';
import { theoryShadow, shadowFor, predictedUas, sci, dur } from './physics.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Tour {
  constructor(app, { caption, toScreen, getAnchors, journey }) {
    this.app = app; this.caption = caption; this.toScreen = toScreen; this.getAnchors = getAnchors; this.journey = journey;
    this.running = false; this.i = 0; this.t = 0;
    this.focusSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.focusSvg.setAttribute('aria-hidden', 'true');
    Object.assign(this.focusSvg.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 3 });
    document.body.appendChild(this.focusSvg);
    this.idleAz = 0;
    app.store.on(() => { if (!this.running) this.idleCaption(); else this.draw(); });
  }

  numbers() {
    const { store, model: m } = this.app;
    const s = store.all();
    const tel = s.view === 'telescope';
    const ts = shadowFor(s.a, tel ? store.shown.incl : 90, s.q);
    const an = this.getAnchors();
    const pred = m.obj ? predictedUas(ts.mean, m.obj) : null;
    return {
      a: s.a.toFixed(3), rh: (2 * m.rh).toFixed(2), shadowW: ts.chords.width.toFixed(2), vmax: m.vIsco.toFixed(2),
      gmax: an && an.gmax ? Math.pow(an.gmax, 4).toFixed(1) : '--', gmin: an && an.gmin ? Math.pow(an.gmin, 4).toFixed(2) : '--',
      incl: store.shown.incl.toFixed(0), shadowUas: pred ? pred.value.toFixed(1) : '--', ri: m.ri.toFixed(2),
      eta: (m.eta * 100).toFixed(1), tauIn: dur(m.interiorTauS), massSun: sci(m.massSun), horizonKm: sci(m.horizonKm), tidalG: sci(m.tidalHg),
    };
  }

  fill(text) {
    const n = this.numbers();
    return text.replace(/\{(\w+)\}/g, (_, k) => n[k] ?? k);
  }

  start(i = 0) {
    this.running = true;
    this.go(i);
  }

  go(i) {
    this.i = Math.max(0, Math.min(TOUR.length - 1, i));
    this.t = 0;
    const stop = TOUR[this.i];
    const { store } = this.app;
    let patch = { ...stop.patch };
    if (patch.obj) patch = { ...store.objectPatch(patch.obj), ...patch };
    if (patch.view) patch = { ...store.viewPatch(patch.view), ...patch };
    if (patch.obj && patch.view !== 'telescope' && store.get('view') !== 'telescope') delete patch.incl;
    store.set(patch, { src: 'tour', dur: 1700 });
    if (stop.id === 'fall') this.journey.play(); else this.journey.stop();
    this.draw();
  }

  next() { if (this.i >= TOUR.length - 1) { this.stop(); return; } this.go(this.i + 1); }
  prev() { this.go(this.i - 1); }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.focusSvg.innerHTML = '';
    this.idleCaption();
  }

  tick(now, dt) {
    const { store } = this.app;
    if (this.running) {
      this.t += dt / 1000;
      if (this.t > TOUR[this.i].dur) this.next();
      if (Math.floor(this.t * 4) !== Math.floor((this.t - dt / 1000) * 4)) this.drawFocus();
      return;
    }
    // idle drift: after 20 s without input the view turns slowly (not under reduced motion)
    if (!store.reduced && !this.app.still && now - this.app.lastInput > 20000 && store.get('anim')) {
      store.set({ az: ((store.get('az') + dt * 0.004) % 360 + 540) % 360 - 180 }, { instant: true, src: 'idle' });
    }
  }

  refresh() { if (this.running) this.draw(); }

  draw() {
    const stop = TOUR[this.i];
    const dots = TOUR.map((_, k) => `<i class="${k === this.i ? 'on' : ''}"></i>`).join('');
    this.caption.innerHTML = `<div class="cap"><div class="cap-k">Tour ${this.i + 1} / ${TOUR.length}</div><div class="cap-t">${esc(stop.title)}</div>
      <div class="cap-b">${esc(this.fill(stop.text))}</div>
      <div class="cap-nav"><button class="bh-btn" type="button" data-n="prev">Back</button><button class="bh-btn go" type="button" data-n="next">${this.i === TOUR.length - 1 ? 'Finish' : 'Next'}</button><button class="bh-btn" type="button" data-n="exit">Exit</button><span class="dots">${dots}</span></div></div>`;
    this.caption.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const n = b.dataset.n;
      if (n === 'next') this.next(); else if (n === 'prev') this.prev(); else this.stop();
    }));
    this.drawFocus();
  }

  drawFocus() {
    const stop = TOUR[this.i], an = this.getAnchors();
    if (!this.running || !an) { this.focusSvg.innerHTML = ''; return; }
    const W = window.innerWidth, H = window.innerHeight;
    this.focusSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    let pt = null, rad = 26;
    if (stop.focus === 'shadow' && an.shadow) { pt = { sx: an.shadow.cx, sy: an.shadow.cy }; const [x0] = this.toScreen(an.shadow.left, 0); const [x1] = this.toScreen(an.shadow.right, 0); rad = Math.abs(x1 - x0) * 0.62; }
    else if (stop.focus === 'limb') pt = an.limb;
    else if (stop.focus === 'ring') pt = an.ring;
    else if (stop.focus === 'isco') pt = an.isco;
    if (!pt) { this.focusSvg.innerHTML = ''; return; }
    const [x, y] = this.toScreen(pt.sx, pt.sy);
    const pulse = 1 + 0.08 * Math.sin(this.t * 3);
    this.focusSvg.innerHTML = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(rad * pulse).toFixed(1)}" fill="none" stroke="var(--accretion)" stroke-width="1" stroke-dasharray="4 5" opacity="0.85"/>`;
  }

  idleCaption() {
    if (this.running) return;
    const { store, model: m } = this.app;
    const s = store.all();
    const o = m.obj;
    const title = o ? `${o.name}: ${o.kind}` : 'Custom hole';
    const line = s.view === 'telescope'
      ? (s.emit === 'thick'
        ? `Seen from far away at ${store.shown.incl.toFixed(0)} deg. An opaque disk reaching the ISCO covers the outer shadow: the dark patch is the inner shadow (Chael et al. 2021). Gold: Bardeen's critical curve.`
        : `Seen from far away at ${store.shown.incl.toFixed(0)} deg, through hot thin gas as the EHT sees it. The gold curve is Bardeen's 1973 critical curve; the bright ring the rays found sits on it.`)
      : s.view === 'journey'
        ? 'Free fall from rest far away. Drag the Fall chart to scrub; your clock and the far clock part ways near the horizon.'
        : `Spin ${s.a.toFixed(3)}, ${COLOR_MODES[s.color].label.toLowerCase()} colour. Click any pixel to trace its ray; drag to orbit.`;
    this.caption.innerHTML = `<div class="cap"><div class="cap-k">${esc(VIEWS[s.view].label)} view</div><div class="cap-t">${esc(title)}</div><div class="cap-b">${esc(line)}</div>
      <div class="cap-nav"><button class="bh-btn go" type="button" data-n="tour">Take the tour</button></div></div>`;
    this.caption.querySelector('button').addEventListener('click', () => this.start(0));
  }
}
