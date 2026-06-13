/* =========================================================================
   resonance.renderer.js — RESONANCE Canvas2D drawing (pure render).
   Gold/dust aesthetic matching the site's space-odyssey visual language.
   Layout (top → bottom):
     1. Token Stream  — words scrolling left, burst words brighter, gaps = pauses
     2. Spectral      — frequency bars with gold glow (left half)
        Cognitive Radar— hexagonal profile with gold fill (right half)
     3. Health footer — composite score + profile label + stats strip
   No DOM queries. No state mutation outside the history buffer.
   Public API (window.RESONANCE.Renderer):
     create(canvas) → { render(signature), resize(w, h) }
   ========================================================================= */
(function(){
  "use strict";
  const RESONANCE = (window.RESONANCE = window.RESONANCE || {});
  const CFG    = RESONANCE.CONFIG || {};
  const AXES   = CFG.RADAR_AXES  || [];
  const N_AXES = AXES.length;

  // ── colour palette ───────────────────────────────────────────────────────
  // Semi-transparent so the LUMEN starfield substrate bleeds through
  const C = {
    bg:         'rgba(8,10,18,0.15)',        // 15% opaque — starfield visible
    panelBg:    'rgba(8,10,18,0.42)',        // 42% opaque panels
    border:     'rgba(212,162,76,0.22)',
    borderDim:  'rgba(212,162,76,0.10)',
    text:       'rgba(234,240,251,0.45)',
    textMid:    'rgba(234,240,251,0.65)',
    textBright: 'rgba(234,240,251,0.88)',
    gold:       '#D4A24C',
    goldDim:    'rgba(212,162,76,0.25)',
    scanline:   'rgba(212,162,76,0.04)',
  };

  // ── tiny helpers ─────────────────────────────────────────────────────────
  function lbl(ctx, txt, x, y, sz, col, align){
    ctx.font = `${sz}px "IBM Plex Mono", monospace`;
    ctx.fillStyle = col || C.text;
    ctx.textAlign = align || 'left';
    ctx.fillText(txt, x, y);
  }
  function panelBg(ctx, x, y, w, h, color){
    ctx.fillStyle = color || C.panelBg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  function hdrBg(ctx, x, y, w){
    ctx.fillStyle = 'rgba(5,7,14,0.95)';
    ctx.fillRect(x + 1, y + 1, w - 2, 18);
    ctx.strokeStyle = C.borderDim;
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(x + 1, y + 19); ctx.lineTo(x + w - 1, y + 19); ctx.stroke();
  }
  function glow(ctx, color, blur){ ctx.shadowColor = color; ctx.shadowBlur = blur; }
  function noGlow(ctx){ ctx.shadowBlur = 0; }

  function hexRGB(hex){
    if(!hex || hex.length < 7) return [212, 162, 76];
    return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
  }

  function normSig(s){
    if(!s) s = {};
    const color = (typeof s.color === 'string' && s.color.length >= 7) ? s.color : '#D4A24C';
    const [r,g,b] = hexRGB(color);
    const tp = s.timing_pattern || {};
    const rd = s.radar          || {};
    return {
      profile_label:       s.profile_label       || 'COUNCIL',
      color,
      glow:                s.glow                || 'rgba(212,162,76,0.6)',
      dim_color:           s.dim_color           || `rgba(${r},${g},${b},0.08)`,
      health:              s.health              != null ? s.health : 50,
      resonance_potential: s.resonance_potential != null ? s.resonance_potential : 0.5,
      token_stream:        Array.isArray(s.token_stream) ? s.token_stream : [],
      mag:                 s.mag instanceof Float32Array ? s.mag : new Float32Array(32),
      radar: {
        processing:    rd.processing    != null ? rd.processing    : 0.5,
        latency:       rd.latency       != null ? rd.latency       : 0.5,
        throughput:    rd.throughput    != null ? rd.throughput    : 0.5,
        coherence:     rd.coherence     != null ? rd.coherence     : 0.5,
        efficiency:    rd.efficiency    != null ? rd.efficiency    : 0.5,
        stochasticity: rd.stochasticity != null ? rd.stochasticity : 0.5,
      },
      timing_pattern: {
        mean_interval:  tp.mean_interval  != null ? tp.mean_interval  : 0,
        std_interval:   tp.std_interval   != null ? tp.std_interval   : 0,
        burst_patterns: Array.isArray(tp.burst_patterns) ? tp.burst_patterns : [],
      },
    };
  }

  // ── PANEL 1 — Token Stream ───────────────────────────────────────────────
  // Words scroll left to right, oldest at left. Burst words are brighter.
  // Gap between words scales with the inter-token interval (natural rhythm).
  function drawTokenStream(ctx, sig, x, y, w, h){
    panelBg(ctx, x, y, w, h);
    hdrBg(ctx, x, y, w);
    lbl(ctx, 'TOKEN STREAM', x + 8, y + 13, 8, C.textBright);
    lbl(ctx, sig.profile_label, x + w - 8, y + 13, 8, sig.color, 'right');

    const stream = sig.token_stream || [];
    if(stream.length === 0){
      lbl(ctx, '· · ·', x + w / 2, y + h / 2 + 4, 10, C.text, 'center');
      return;
    }

    const n       = stream.length;
    const FADE    = CFG.TOKEN_STREAM.FADE_STEPS;
    const baseY   = y + h / 2 + 6;
    const PAD_L   = x + 10;

    // Measure all tokens to pack them right-aligned (newest at right edge)
    ctx.font = '10px "IBM Plex Mono", monospace';
    const GAP_BASE = 10;
    const GAP_MAX  = 28;
    const measured = stream.map(t => {
      const tw = ctx.measureText(t.word).width;
      return { ...t, tw };
    });

    // Total width needed, right-aligned
    let totalW = 0;
    for(const t of measured) totalW += t.tw + GAP_BASE;
    // Shift so the newest token ends near the right edge
    let cursor = (x + w - 10) - totalW;
    if(cursor < PAD_L) cursor = PAD_L;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y + 20, w - 2, h - 22);
    ctx.clip();

    for(let i = 0; i < n; i++){
      const t     = measured[i];
      const age_f = i / (n - 1 || 1);             // 0=oldest, 1=newest
      const fade  = Math.min(1, age_f * (n / FADE));
      const alpha = 0.15 + fade * 0.85;

      const isBurst = t.isBurst;
      let col;
      if(isBurst){
        col = sig.color;
      } else if(age_f > 0.75){
        col = sig.color + 'CC';    // near-full opacity hex
        col = sig.color;
      } else {
        // interpolate from dim to bright
        const r = parseInt(sig.color.slice(1,3),16);
        const g = parseInt(sig.color.slice(3,5),16);
        const b = parseInt(sig.color.slice(5,7),16);
        col = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
      }

      // burst gets a subtle background pill
      if(isBurst){
        glow(ctx, sig.glow, 8);
        ctx.fillStyle = sig.dim_color;
        ctx.fillRect(cursor - 3, baseY - 12, t.tw + 6, 14);
        noGlow(ctx);
      }

      if(isBurst) glow(ctx, sig.glow, 6); else noGlow(ctx);
      ctx.fillStyle = col;
      ctx.font = isBurst ? 'bold 10px "IBM Plex Mono", monospace' : '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(t.word, cursor, baseY);
      noGlow(ctx);

      // dot separator between tokens (not after last)
      if(i < n - 1){
        ctx.fillStyle = `rgba(212,162,76,${(alpha * 0.3).toFixed(2)})`;
        ctx.font = '8px "IBM Plex Mono", monospace';
        ctx.fillText('·', cursor + t.tw + 4, baseY - 1);
      }

      cursor += t.tw + GAP_BASE;
    }

    ctx.restore();
    noGlow(ctx);
  }

  // ── PANEL 2 — Spectral Analyzer ──────────────────────────────────────────
  function drawSpectral(ctx, sig, x, y, w, h){
    panelBg(ctx, x, y, w, h);
    hdrBg(ctx, x, y, w);
    lbl(ctx, 'SPECTRAL ANALYZER', x + 8, y + 13, 8, C.textBright);

    const mag  = sig.mag;
    const BARS = CFG.WAVE.BAR_COUNT;
    const gap  = 2;
    const usableW = w - 16;
    const barW = (usableW - gap * (BARS - 1)) / BARS;
    const usableH = h - 38;
    const baseY   = y + h - 10;

    let peak = 0.001;
    for(let i = 0; i < mag.length; i++) if(mag[i] > peak) peak = mag[i];

    const binsPerBar = Math.floor(mag.length / BARS);

    for(let b = 0; b < BARS; b++){
      let sum = 0;
      for(let k = 0; k < binsPerBar; k++) sum += mag[b * binsPerBar + k] || 0;
      const norm = (sum / binsPerBar) / peak;
      const barH = Math.max(2, norm * usableH);
      const bx   = x + 8 + b * (barW + gap);
      const by   = baseY - barH;

      // gradient: gold at peak, dimmer at base
      const r0 = parseInt(sig.color.slice(1,3),16);
      const g0 = parseInt(sig.color.slice(3,5),16);
      const b0 = parseInt(sig.color.slice(5,7),16);
      const grad = ctx.createLinearGradient(bx, by, bx, baseY);
      grad.addColorStop(0,   sig.color);
      grad.addColorStop(0.5, `rgba(${r0},${g0},${b0},0.50)`);
      grad.addColorStop(1,   'rgba(8,10,18,0)');

      // glow on tall bars
      if(norm > 0.6){ glow(ctx, sig.glow, 8); }
      ctx.fillStyle = grad;
      ctx.fillRect(bx, by, Math.max(1, barW), barH);
      noGlow(ctx);

      // tip dot on tall bars
      if(norm > 0.4){
        ctx.beginPath();
        ctx.arc(bx + barW / 2, by, 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = sig.color;
        ctx.fill();
      }
    }

    // baseline rule
    ctx.strokeStyle = C.borderDim;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x + 8, baseY);
    ctx.lineTo(x + w - 8, baseY);
    ctx.stroke();

    // metrics
    const mean = sig.timing_pattern.mean_interval.toFixed(0);
    const coh  = (sig.radar.coherence * 100).toFixed(0);
    lbl(ctx, `Dom.Freq · ${(sig.radar.processing * 10).toFixed(2)}Hz`, x + 8, y + h - 2, 7, C.text);
    lbl(ctx, `Coh ${coh}%`, x + w - 8, y + h - 2, 7, sig.color, 'right');
  }

  // ── PANEL 3 — Cognitive Radar ─────────────────────────────────────────────
  function drawRadar(ctx, sig, x, y, w, h){
    panelBg(ctx, x, y, w, h);
    hdrBg(ctx, x, y, w);
    lbl(ctx, 'COGNITIVE RADAR', x + 8, y + 13, 8, C.textBright);

    const radar  = sig.radar;
    const vals   = AXES.map(a => radar[a.id] || 0);
    const step   = (2 * Math.PI) / N_AXES;
    const START  = -Math.PI / 2;
    const cx     = x + w / 2;
    const cy     = y + 24 + (h - 34) / 2;
    const R      = Math.min(w, h - 34) / 2 - 20;

    // rings
    for(let ring = 1; ring <= CFG.RADAR.RINGS; ring++){
      const r = R * (ring / CFG.RADAR.RINGS);
      ctx.beginPath();
      for(let i = 0; i < N_AXES; i++){
        const a = START + i * step;
        const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
        if(i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = ring === CFG.RADAR.RINGS ? C.border : C.borderDim;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // spokes
    for(let i = 0; i < N_AXES; i++){
      const a = START + i * step;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
      ctx.strokeStyle = C.borderDim;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // data polygon
    ctx.beginPath();
    for(let i = 0; i < N_AXES; i++){
      const a = START + i * step;
      const r = R * Math.max(0.05, vals[i]);
      const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
      if(i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = sig.dim_color;
    ctx.fill();
    glow(ctx, sig.glow, 10);
    ctx.strokeStyle = sig.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    noGlow(ctx);

    // axis dots + 4-char labels
    ctx.font = '7px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    for(let i = 0; i < N_AXES; i++){
      const a    = START + i * step;
      const dotr = R * Math.max(0.05, vals[i]);
      const dx   = cx + dotr * Math.cos(a);
      const dy   = cy + dotr * Math.sin(a);

      glow(ctx, sig.glow, 6);
      ctx.beginPath();
      ctx.arc(dx, dy, 2.5, 0, 2 * Math.PI);
      ctx.fillStyle = sig.color;
      ctx.fill();
      noGlow(ctx);

      const lx = cx + (R + 14) * Math.cos(a);
      const ly = cy + (R + 14) * Math.sin(a);
      ctx.fillStyle = C.textMid;
      ctx.fillText(AXES[i].label.slice(0, 4), lx, ly + 3);
    }
  }

  // ── FOOTER — Health bar + stats ───────────────────────────────────────────
  function drawFooter(ctx, sig, x, y, w, h){
    panelBg(ctx, x, y, w, h);

    const hp   = sig.health;
    const frac = Math.max(0, Math.min(1, hp / 100));

    // HEALTH label + value
    lbl(ctx, 'HEALTH', x + 10, y + 14, 8, C.text);
    glow(ctx, sig.glow, 6);
    lbl(ctx, hp.toFixed(0) + '%', x + 76, y + 14, 9, sig.color);
    noGlow(ctx);

    // health bar track
    const barX = x + 106, barY = y + 6, barW = w * 0.38, barH = 8;
    ctx.fillStyle = 'rgba(212,162,76,0.06)';
    ctx.fillRect(barX, barY, barW, barH);
    // fill
    glow(ctx, sig.glow, 8);
    ctx.fillStyle = hp > 65 ? sig.color : hp > 35 ? '#C07830' : '#8B3A3A';
    ctx.fillRect(barX, barY, barW * frac, barH);
    noGlow(ctx);
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(barX, barY, barW, barH);

    // stats
    const mean   = sig.timing_pattern.mean_interval.toFixed(0);
    const std    = sig.timing_pattern.std_interval.toFixed(0);
    const status = sig.timing_pattern.burst_patterns.length > 0 ? 'BURST' : 'STABLE';
    const statX  = barX + barW + 16;

    lbl(ctx, sig.profile_label, statX, y + 14, 9, sig.color);
    lbl(ctx, status, statX + 80, y + 14, 7, C.textMid);
    lbl(ctx, `AVG ${mean}ms ± ${std}`, statX + 130, y + 14, 7, C.text);

    // resonance potential small dot-arc
    const rpX = x + w - 28, rpY = y + h / 2;
    const rp  = sig.resonance_potential;
    ctx.beginPath();
    ctx.arc(rpX, rpY, 9, Math.PI, Math.PI * (1 + rp * 2));
    glow(ctx, sig.glow, 5);
    ctx.strokeStyle = sig.color;
    ctx.lineWidth   = 2;
    ctx.stroke();
    noGlow(ctx);
    ctx.beginPath();
    ctx.arc(rpX, rpY, 9, Math.PI, 3 * Math.PI);
    ctx.strokeStyle = C.borderDim;
    ctx.lineWidth = 0.5;
    ctx.stroke();
    lbl(ctx, 'RP', rpX, rpY + 3, 6, C.text, 'center');

    // frame watermark
    ctx.textAlign = 'right';
    lbl(ctx, 'AI RESONANCE · WIRTHFORGE', x + w - 10, y + 14, 7, 'rgba(212,162,76,0.25)', 'right');
  }

  // ── Renderer factory ─────────────────────────────────────────────────────
  function create(canvas){
    const ctx = canvas.getContext('2d');
    if(!ctx){ console.warn('[RESONANCE] no 2D context'); return null; }

    function resize(w, h){
      canvas.width  = w;
      canvas.height = h;
    }

    function render(sig){
      const W = canvas.width, H = canvas.height;
      if(!W || !H) return;

      // ── background ────────────────────────────────────────────────────
      // Clear to transparent so LUMEN starfield substrate shows through
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);

      // subtle dot grid for spatial reference (like the site substrate)
      ctx.fillStyle = 'rgba(212,162,76,0.08)';
      for(let gy = 20; gy < H; gy += 20){
        for(let gx = 20; gx < W; gx += 20){
          ctx.fillRect(gx, gy, 1, 1);
        }
      }

      // scanlines for depth (subtle horizontal bands)
      for(let sy = 0; sy < H; sy += 4){
        ctx.fillStyle = C.scanline;
        ctx.fillRect(0, sy, W, 2);
      }

      const PAD = 10, GAP = 6;

      // ── Row heights ────────────────────────────────────────────────────
      // Stream:  ~18% of height (min 56px)
      // Middle:  ~62% of height
      // Footer:  ~20% of height (min 28px)
      const streamH = Math.max(56, Math.round(H * 0.18));
      const footerH = Math.max(28, Math.round(H * 0.16));
      const midH    = H - PAD * 2 - GAP * 2 - streamH - footerH;
      const midW    = (W - PAD * 2 - GAP) / 2;

      const streamY = PAD;
      const midY    = streamY + streamH + GAP;
      const footY   = midY + midH + GAP;

      // ── Token Stream (full width) ──────────────────────────────────────
      drawTokenStream(ctx, sig, PAD, streamY, W - PAD * 2, streamH);

      // ── Spectral (left half) ───────────────────────────────────────────
      drawSpectral(ctx, sig, PAD, midY, midW, midH);

      // ── Radar (right half) ────────────────────────────────────────────
      drawRadar(ctx, sig, PAD + midW + GAP, midY, midW, midH);

      // ── Footer (full width) ───────────────────────────────────────────
      drawFooter(ctx, sig, PAD, footY, W - PAD * 2, footerH);
    }

    return { render, resize };
  }

  RESONANCE.Renderer = { create };
})();
